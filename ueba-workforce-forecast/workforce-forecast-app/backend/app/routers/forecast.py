"""
Persistance des saisies de forecast à la demi-journée (cahier des charges §3.2, §4.1).
Seul un EUM_EUD peut écrire (règle métier : seuls les leads de département saisissent le
forecast). Le contrôle de périmètre est rejoué côté serveur à chaque requête (§2.2/§4.1),
via une jointure sur `employee` — `ForecastEntry.pernr` n'étant pas une ForeignKey stricte
(voir la note dans models.ForecastEntry), le rapprochement se fait par égalité de PERNR.
"""
import datetime as dt
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..audit import log_read_access
from ..database import get_db
from ..deps import require_roles
from ..models import ActivityCode, AppUser, AuditLog, Employee, ForecastEntry, Role
from ..readiness import department_is_ready
from ..schemas import ForecastEntryOut, ForecastPaintRequest, ForecastPaintResponse, ForecastPaintUpdate
from ueba.tasks import planifier_rescore

router = APIRouter(tags=["forecast"])


def _scoped_pernrs(db: Session, user: AppUser) -> set[str] | None:
    """PERNR visibles pour cet utilisateur, ou None si aucune restriction (ADMIN)."""
    if user.role == Role.EUM_EUD:
        q = db.query(Employee.pernr).filter(Employee.department_id == user.department_id)
    elif user.role == Role.HEAD_OF_DIRECTION:
        q = db.query(Employee.pernr).filter(Employee.direction_id == user.direction_id)
    else:
        return None
    return {p for (p,) in q.all()}


def _serialize_entries(entries: list[ForecastEntry], user: AppUser, db: Session) -> list[ForecastEntryOut]:
    """
    Un Head of Direction n'accède qu'à des agrégats (§4.2) : un motif d'absence nominatif
    (MAT/SS/EL/CP) ne doit jamais figurer dans une réponse qui lui est destinée — remplacé
    par le libellé générique de la famille elle-même. Point de vérité unique, valable pour
    tout endpoint qui sérialise des forecast_entry (y compris de futurs exports côté
    serveur) : un EUM/EUD, lui, garde le code exact, c'est son périmètre direct.
    La famille est lue dynamiquement dans le référentiel — jamais une liste de codes en dur.
    """
    out = [ForecastEntryOut.model_validate(e) for e in entries]
    if user.role != Role.HEAD_OF_DIRECTION:
        return out
    absence_codes = {c for (c,) in db.query(ActivityCode.code).filter(ActivityCode.famille == "Absence").all()}
    for o in out:
        if o.code in absence_codes:
            o.code = "Absence"
    return out


@router.get("/forecast-entries", response_model=list[ForecastEntryOut])
def list_forecast_entries(
    request: Request,
    background_tasks: BackgroundTasks,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    # Les saisies de forecast ne concernent que ceux qui les produisent (EUM/EUD) ou les
    # consolident (Head of Direction). L'Administrateur Global n'y a pas accès (CDC §2.2) —
    # défense en profondeur, en plus du retrait de l'onglet Tableau de bord côté client.
    user: AppUser = Depends(require_roles("EUM_EUD", "HEAD_OF_DIRECTION")),
):
    q = db.query(ForecastEntry)
    if start:
        q = q.filter(ForecastEntry.date >= start)
    if end:
        q = q.filter(ForecastEntry.date <= end)

    scoped = _scoped_pernrs(db, user)
    if scoped is not None:
        q = q.filter(ForecastEntry.pernr.in_(scoped)) if scoped else q.filter(False)
    entries = q.all()

    ip = request.client.host if request.client else ""
    log_read_access(
        db, user, "FORECAST_READ",
        f"start={start or '-'} end={end or '-'} lignes={len(entries)}", ip,
        target_pernrs=[e.pernr for e in entries],
    )
    # Scoring UEBA hors du chemin de la réponse (voir backend/ueba/).
    planifier_rescore(background_tasks, user.pernr)

    return _serialize_entries(entries, user, db)


@router.post("/forecast-entries/paint", response_model=ForecastPaintResponse)
def paint_forecast_entries(
    payload: ForecastPaintRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_roles("EUM_EUD")),
):
    # Le référentiel (collaborateurs + au moins un projet actif) doit avoir été importé par
    # l'administrateur avant toute saisie — cahier des charges §2.3/§3.3. Contrôle rejoué ici,
    # jamais fait uniquement côté client (même principe que le filtrage de périmètre RBAC).
    if not department_is_ready(db, user.department_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Le référentiel de votre département (collaborateurs, projets actifs) n'a pas encore "
            "été importé par l'administrateur. Aucune saisie n'est possible pour le moment.",
        )

    scoped = _scoped_pernrs(db, user) or set()
    hors_perimetre = {u.pernr for u in payload.updates} - scoped
    if hors_perimetre:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Hors de votre périmètre : {', '.join(sorted(hors_perimetre))}",
        )

    # payload.code n'est validé par aucun schéma Pydantic ni contrainte SQL (ForecastEntry.code
    # n'a délibérément pas de ForeignKey vers activity_code, cf. la note sur `pernr` juste
    # au-dessus dans ce modèle — même logique : ne pas bloquer une saisie existante si le
    # référentiel change). Le contrôle est donc rejoué ici, avant toute écriture, jamais
    # laissé au seul client (même principe que department_is_ready ci-dessus).
    if payload.code != "__erase" and not db.query(ActivityCode).filter(ActivityCode.code == payload.code).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Code d'activité inconnu : {payload.code}")

    ip = request.client.host if request.client else ""
    changed: list[ForecastEntry] = []
    deleted: list[ForecastPaintUpdate] = []

    for u in payload.updates:
        existing = (
            db.query(ForecastEntry)
            .filter(ForecastEntry.pernr == u.pernr, ForecastEntry.date == u.date, ForecastEntry.demi_journee == u.demi)
            .first()
        )
        avant = f"{existing.code}{'/' + existing.project_code if existing.project_code else ''}" if existing else "—"

        if payload.code == "__erase":
            if existing is not None:
                db.delete(existing)
                deleted.append(u)
                db.add(AuditLog(
                    qui=user.pernr, action="FORECAST_PAINT",
                    detail=f"pernr={u.pernr} date={u.date} {u.demi} avant={avant} apres=— (effacement)", ip=ip,
                    target_pernrs=json.dumps([u.pernr]),
                    perimetre=u.pernr not in scoped,
                ))
            continue

        if existing is None:
            existing = ForecastEntry(pernr=u.pernr, date=u.date, demi_journee=u.demi)
            db.add(existing)
        existing.code = payload.code
        existing.project_code = payload.project_code
        existing.auteur = user.nom
        existing.horodatage = dt.datetime.utcnow()
        changed.append(existing)

        apres = f"{payload.code}{'/' + payload.project_code if payload.project_code else ''}"
        db.add(AuditLog(
            qui=user.pernr, action="FORECAST_PAINT",
            detail=f"pernr={u.pernr} date={u.date} {u.demi} avant={avant} apres={apres}", ip=ip,
            target_pernrs=json.dumps([u.pernr]),
            perimetre=u.pernr not in scoped,
        ))

    db.commit()
    for e in changed:
        db.refresh(e)
    # Scoring UEBA hors du chemin de la réponse (voir backend/ueba/).
    planifier_rescore(background_tasks, user.pernr)
    # _serialize_entries est un no-op ici (seul un EUM_EUD peut atteindre cette route,
    # cf. require_roles ci-dessus) — appliqué par cohérence si ce rôle évoluait un jour.
    return ForecastPaintResponse(updated=_serialize_entries(changed, user, db), deleted=deleted)
