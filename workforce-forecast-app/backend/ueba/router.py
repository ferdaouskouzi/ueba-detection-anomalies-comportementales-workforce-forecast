"""
Router /ueba/* — réservé au rôle ADMIN via app.deps.require_roles (exactement la
dépendance RBAC utilisée par le reste du projet, ex. /admin/import/*).

  POST /ueba/score      : score une action fournie explicitement (schéma source).
  GET  /ueba/anomalies  : liste des agrégats (lead, jour) déjà scorés, pour le
                          panneau Admin React.
  POST /ueba/rescore    : (re)planifie le scoring de tous les leads pour un jour
                          donné — utile après la migration pour amorcer la table.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import AppUser, Employee, UebaScore
from .features import jour_courant_utc, leads_avec_historique
from .model import LeadInconnuError
from .schemas import ActionAEvaluer, AnomalieOut, RescoreResponse, ScoreResponse
from .tasks import planifier_rescore, scorer_action_explicite

router = APIRouter(prefix="/ueba", tags=["ueba"])

# Tout le router est derrière ce garde-fou : un seul point, aligné sur le reste du projet.
_admin_only = Depends(require_roles("ADMIN"))


def _noms_leads(db: Session, pernrs: set[str]) -> dict[str, str]:
    noms: dict[str, str] = {}
    for pernr, nom in db.query(AppUser.pernr, AppUser.nom).filter(AppUser.pernr.in_(pernrs)).all():
        noms[pernr] = nom
    manquants = pernrs - noms.keys()
    if manquants:
        for pernr, nom in db.query(Employee.pernr, Employee.nom).filter(Employee.pernr.in_(manquants)).all():
            noms[pernr] = nom
    return noms


def _en_anomalie_out(row: UebaScore, nom_lead: str | None) -> AnomalieOut:
    return AnomalieOut(
        pernr_lead=row.pernr_lead,
        nom_lead=nom_lead,
        jour=row.jour,
        est_suspect=row.est_suspect,
        raison_alerte=row.raison_alerte,
        score_confiance=row.score_confiance,
        signaux_calcules=json.loads(row.signaux_json),
        signaux_fiables_seulement=row.signaux_fiables_seulement,
        calcule_le=row.calcule_le,
    )


@router.post("/score", response_model=ScoreResponse)
def score(action: ActionAEvaluer, _admin: AppUser = _admin_only, db: Session = Depends(get_db)):
    try:
        return scorer_action_explicite(
            db,
            pernr_lead=action.pernr_lead,
            heure_connexion=action.heure_connexion,
            nb_fiches_consultees=action.nb_fiches_consultees,
            hors_departement=action.hors_departement,
            duree_minutes=action.duree_minutes,
            pernrs_consultes=action.pernrs_consultes,
        )
    except LeadInconnuError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))


@router.get("/anomalies", response_model=list[AnomalieOut])
def anomalies(
    _admin: AppUser = _admin_only,
    db: Session = Depends(get_db),
    suspects_seulement: bool = Query(False, description="Ne renvoyer que les agrégats jugés suspects"),
    depuis: str | None = Query(None, description="Jour ISO minimum (inclus), ex. 2026-08-01"),
    pernr_lead: str | None = Query(None, description="Filtrer sur un lead précis"),
    limite: int = Query(200, ge=1, le=2000),
):
    q = db.query(UebaScore)
    if suspects_seulement:
        q = q.filter(UebaScore.est_suspect.is_(True))
    if depuis:
        q = q.filter(UebaScore.jour >= depuis)
    if pernr_lead:
        q = q.filter(UebaScore.pernr_lead == pernr_lead)
    rows = q.order_by(UebaScore.jour.desc(), UebaScore.score_confiance.asc()).limit(limite).all()

    noms = _noms_leads(db, {r.pernr_lead for r in rows})
    return [_en_anomalie_out(r, noms.get(r.pernr_lead)) for r in rows]


@router.post("/rescore", response_model=RescoreResponse)
def rescore(
    background_tasks: BackgroundTasks,
    _admin: AppUser = _admin_only,
    db: Session = Depends(get_db),
    jour: str | None = Query(None, description="Jour ISO à recalculer (défaut : aujourd'hui UTC)"),
):
    cible = jour or jour_courant_utc()
    leads = leads_avec_historique(db)
    for pernr_lead in leads:
        planifier_rescore(background_tasks, pernr_lead, cible)
    return RescoreResponse(leads_planifies=len(leads), jour=cible)
