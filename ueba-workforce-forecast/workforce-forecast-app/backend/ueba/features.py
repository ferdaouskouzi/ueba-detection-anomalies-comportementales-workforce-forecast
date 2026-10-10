"""
Construction des signaux UEBA à partir de `audit_log` — remplace les fichiers
baseline_par_lead.csv et historique_consultations.json du module source par un
calcul à la volée sur la base SQLite existante (contrainte RGPD : rien sur disque
hors du schéma).

Granularité (décidée avec l'utilisateur) : un agrégat par (lead, jour civil UTC),
miroir du dataset source lead × jour :
  - volume  = nombre de fiches nominatives consultées dans la journée ;
  - heure   = heure de la première connexion du jour ;
  - vitesse = volume ÷ amplitude horaire du jour (dernier − premier événement,
              en minutes, plancher 0.1) — analogue de duree_minutes source ;
  - hors_departement = au moins un accès hors du département du lecteur ;
  - score_nouveaute  = proportion de PERNR du jour jamais vus dans les 7 jours
                        glissants précédents (fenêtre exclusive du jour même).
"""
from __future__ import annotations

import datetime as dt
import statistics
from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import AuditLog
from .audit_fields import load_target_pernrs, volume_depuis_detail
from .model import Baseline, LeadInconnuError

FENETRE_GLISSANTE_JOURS = 7

# Actions d'audit qui portent une consultation nominative (les seules pertinentes
# pour l'UEBA). Les événements d'authentification (LOGIN_*, TOTP_*, LOGOUT...) sont
# volontairement exclus : ils n'ont ni target_pernrs ni périmètre.
UEBA_READ_ACTIONS = ("FORECAST_READ", "EMPLOYEES_READ", "FORECAST_PAINT")


@dataclass
class AgregatJour:
    jour: str                       # ISO yyyy-mm-dd
    volume: int
    heure: float
    vitesse: float
    hors_departement: bool | None   # None = colonne `perimetre` NULL sur toutes les lignes du jour
    target_pernrs: set[str] = field(default_factory=set)
    novelty_dispo: bool = False     # True si au moins une ligne du jour porte target_pernrs
    score_nouveaute: float = 0.0    # rempli par _rejouer_nouveaute


def _heure_decimale(quand: dt.datetime) -> float:
    return quand.hour + quand.minute / 60 + quand.second / 3600


def _lignes_lead(db: Session, pernr_lead: str) -> list[AuditLog]:
    return (
        db.query(AuditLog)
        .filter(AuditLog.qui == pernr_lead, AuditLog.action.in_(UEBA_READ_ACTIONS))
        .order_by(AuditLog.quand.asc(), AuditLog.id.asc())
        .all()
    )


def _agreger_par_jour(lignes: list[AuditLog]) -> list[AgregatJour]:
    par_jour: dict[str, list[AuditLog]] = {}
    for row in lignes:
        quand = row.quand or dt.datetime.utcnow()
        par_jour.setdefault(quand.date().isoformat(), []).append(row)

    agregats: list[AgregatJour] = []
    for jour, rows in sorted(par_jour.items()):
        instants = [r.quand for r in rows if r.quand is not None]
        volume = 0
        cibles: set[str] = set()
        novelty_dispo = False
        perimetres: list[bool] = []

        for r in rows:
            pernrs = load_target_pernrs(r.target_pernrs)
            if pernrs:
                novelty_dispo = True
                cibles.update(pernrs)
                volume += len(pernrs)
            else:
                volume += volume_depuis_detail(r.detail)
            if r.perimetre is not None:
                perimetres.append(bool(r.perimetre))

        premier = min(instants) if instants else dt.datetime.utcnow()
        dernier = max(instants) if instants else premier
        duree_minutes = max((dernier - premier).total_seconds() / 60, 0.1)

        agregats.append(AgregatJour(
            jour=jour,
            volume=volume,
            heure=_heure_decimale(premier),
            vitesse=volume / duree_minutes,
            hors_departement=(any(perimetres) if perimetres else None),
            target_pernrs=cibles,
            novelty_dispo=novelty_dispo,
        ))
    return agregats


def _rejouer_nouveaute(agregats: list[AgregatJour]) -> None:
    """Remplit `score_nouveaute` sur chaque agrégat — même logique que
    reference/calculer_novelty_zscore.py : fenêtre glissante de 7 jours
    PRÉCÉDENTS (jour courant exclu), et 0.0 quand il n'y a pas encore de
    référence (aucun jour précédent) pour ne pas fabriquer un faux 100 %."""
    historique: list[set[str]] = []
    for a in agregats:
        aujourdhui = a.target_pernrs
        if not historique or not aujourdhui:
            a.score_nouveaute = 0.0
        else:
            deja_vus = set().union(*historique)
            a.score_nouveaute = (len(aujourdhui - deja_vus) / len(aujourdhui)) if deja_vus else 0.0
        historique.append(aujourdhui)
        if len(historique) > FENETRE_GLISSANTE_JOURS:
            historique.pop(0)


def _std(valeurs: list[float]) -> float:
    """Écart-type d'échantillon (ddof=1, comme pandas dans le module source),
    plancher à 0.001 pour éviter toute division par ~0."""
    if len(valeurs) < 2:
        return 0.001
    return max(statistics.stdev(valeurs), 0.001)


def calculer_baseline(agregats: list[AgregatJour]) -> Baseline:
    if not agregats:
        raise LeadInconnuError("Aucun agrégat exploitable pour ce lead.")
    volumes = [a.volume for a in agregats]
    heures = [a.heure for a in agregats]
    vitesses = [a.vitesse for a in agregats]
    nouveautes = [a.score_nouveaute for a in agregats]
    return Baseline(
        moyenne_volume=statistics.fmean(volumes), ecart_type_volume=_std(volumes),
        moyenne_heure=statistics.fmean(heures), ecart_type_heure=_std(heures),
        moyenne_vitesse=statistics.fmean(vitesses), ecart_type_vitesse=_std(vitesses),
        moyenne_nouveaute=statistics.fmean(nouveautes), ecart_type_nouveaute=_std(nouveautes),
        n_jours=len(agregats),
    )


@dataclass
class ContexteLead:
    """Historique complet d'un lead, prêt à scorer un jour donné ou une action ad hoc."""
    pernr_lead: str
    agregats: list[AgregatJour]
    baseline: Baseline

    @property
    def par_jour(self) -> dict[str, AgregatJour]:
        return {a.jour: a for a in self.agregats}

    def deja_vus_avant(self, jour: str) -> set[str]:
        """Union des PERNR consultés dans les <=7 jours qui précèdent `jour`."""
        anterieurs = [a for a in self.agregats if a.jour < jour][-FENETRE_GLISSANTE_JOURS:]
        vus: set[str] = set()
        for a in anterieurs:
            vus |= a.target_pernrs
        return vus


def charger_contexte(db: Session, pernr_lead: str) -> ContexteLead:
    """Reconstruit toute l'historique d'accès d'un lead depuis audit_log.
    Lève LeadInconnuError si le lead n'a aucun accès nominatif tracé."""
    lignes = _lignes_lead(db, pernr_lead)
    if not lignes:
        raise LeadInconnuError(f"Lead {pernr_lead} inconnu : aucun accès nominatif dans audit_log.")
    agregats = _agreger_par_jour(lignes)
    _rejouer_nouveaute(agregats)
    return ContexteLead(pernr_lead=pernr_lead, agregats=agregats, baseline=calculer_baseline(agregats))


def leads_avec_historique(db: Session) -> list[str]:
    """PERNR de tous les leads ayant au moins un accès nominatif tracé."""
    rows = (
        db.query(AuditLog.qui)
        .filter(AuditLog.action.in_(UEBA_READ_ACTIONS))
        .group_by(AuditLog.qui)
        .all()
    )
    return [q for (q,) in rows]


def jour_courant_utc() -> str:
    return dt.datetime.utcnow().date().isoformat()
