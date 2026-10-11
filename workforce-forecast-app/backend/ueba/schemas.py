"""Schémas d'E/S du router /ueba/* — le schéma de sortie de /ueba/score est
identique à celui du /score du module source."""
from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


class ActionAEvaluer(BaseModel):
    """Entrée de POST /ueba/score — reprise telle quelle du main.py source."""
    pernr_lead: str
    heure_connexion: float
    nb_fiches_consultees: int
    hors_departement: bool
    duree_minutes: float
    pernrs_consultes: list[str] = Field(default_factory=list)


class SignauxCalcules(BaseModel):
    volume_zscore: float
    heure_zscore: float
    vitesse_zscore: float
    hors_departement: bool
    score_nouveaute: float
    novelty_zscore: float


class ScoreResponse(BaseModel):
    """Sortie de POST /ueba/score — mêmes clés que le /score source."""
    pernr_lead: str
    est_suspect: bool
    raison_alerte: str | None = None
    score_confiance: float
    signaux_calcules: SignauxCalcules


class AnomalieOut(BaseModel):
    """Une ligne de GET /ueba/anomalies : un agrégat (lead, jour) déjà scoré."""
    pernr_lead: str
    nom_lead: str | None = None
    jour: str
    est_suspect: bool
    raison_alerte: str | None = None
    score_confiance: float
    signaux_calcules: SignauxCalcules
    signaux_fiables_seulement: bool
    calcule_le: dt.datetime

    class Config:
        from_attributes = True


class RescoreResponse(BaseModel):
    """Sortie de POST /ueba/rescore : combien d'agrégats (lead, jour) ont été
    planifiés pour un recalcul en tâche de fond."""
    leads_planifies: int
    jour: str
