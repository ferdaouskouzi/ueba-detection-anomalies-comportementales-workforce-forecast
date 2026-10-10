"""
Journalisation des accès en LECTURE aux données nominatives (cahier des charges §4.2) —
distinct des logs d'authentification et d'écriture, déjà couverts respectivement par
routers/auth.py et routers/forecast.py::paint_forecast_entries. Point de vérité unique,
appelé par tout endpoint qui expose forecast_entry ou un détail individuel de collaborateur,
pour que le périmètre effectif de chaque lecture soit reconstituable a posteriori.

Alimente aussi les 2 colonnes UEBA de audit_log (voir backend/ueba/) :
  - target_pernrs : liste JSON des PERNR effectivement lus ;
  - perimetre     : booléen « au moins un PERNR hors du département du lecteur »
                    (à ne pas confondre avec la mention texte `perimetre=<label>`
                    déjà présente dans `detail`, qui reste inchangée).
"""
import json

from sqlalchemy.orm import Session

from .models import AppUser, AuditLog, Employee, Role


def scope_label(user: AppUser) -> str:
    """Périmètre effectif de l'utilisateur, tel qu'appliqué par le filtrage serveur — pas
    déclaratif, dérivé du même rôle qui pilote les requêtes SQL de filtrage (§2.2)."""
    if user.role == Role.EUM_EUD:
        return f"department:{user.department_id}"
    if user.role == Role.HEAD_OF_DIRECTION:
        return f"direction:{user.direction_id}"
    return "global"


def _hors_departement(db: Session, user: AppUser, pernrs: list[str]) -> bool | None:
    """True si au moins un PERNR lu appartient à un département autre que celui du
    lecteur. Pour un lecteur sans département (ADMIN / Head of Direction), toute
    fiche nominative rattachée à un département compte comme « hors département »."""
    if not pernrs:
        return None
    depts = {
        p: d for p, d in
        db.query(Employee.pernr, Employee.department_id).filter(Employee.pernr.in_(pernrs)).all()
    }
    return any(depts.get(p) != user.department_id for p in pernrs)


def log_read_access(
    db: Session,
    user: AppUser,
    action: str,
    detail: str,
    ip: str,
    target_pernrs: list[str] | None = None,
) -> None:
    pernrs = sorted({str(p) for p in (target_pernrs or []) if p is not None and str(p) != ""})
    db.add(AuditLog(
        qui=user.pernr, action=action,
        detail=f"role={user.role.value} perimetre={scope_label(user)} {detail}",
        ip=ip,
        target_pernrs=json.dumps(pernrs, ensure_ascii=False) if pernrs else None,
        perimetre=_hors_departement(db, user, pernrs),
    ))
    db.commit()
