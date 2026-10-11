"""
Router /audit/* — exposition en LECTURE du journal d'audit applicatif, réservé au
rôle ADMIN (app.deps.require_roles, exactement la dépendance utilisée par /ueba/*
et /admin/import/*).

GET /audit/forecast-entries rejoue côté serveur les écritures de la grille de
prévision : les lignes `audit_log` d'action "FORECAST_PAINT", déjà tracées par
routers/forecast.py::paint_forecast_entries (et déjà exploitées par le module
UEBA). Le composant React « Journal d'audit » (AdminImport.tsx) affichait
jusqu'ici un état local jamais alimenté pour l'ADMIN ; cette route lui donne une
source réelle. La réponse est structurée, jamais la chaîne `detail` brute.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_roles
from ..models import AppUser, AuditLog
from ..schemas import ForecastAuditEntryOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["audit"])

# Tout le router est derrière ce garde-fou, aligné sur le reste du projet.
_admin_only = Depends(require_roles("ADMIN"))

FORECAST_PAINT_ACTION = "FORECAST_PAINT"

# routers/forecast.py écrit systématiquement le `detail` sous la forme :
#   "pernr=<pernr> date=<yyyy-mm-dd> <AM|PM> avant=<code[/projet]> apres=<code[/projet]>"
# et, pour un effacement, "... apres=— (effacement)".
# La demi-journée n'est PAS préfixée par une clé : c'est le jeton nu entre la date
# et " avant=". `avant` est capturé de façon non gourmande jusqu'à " apres=".
_DETAIL_RE = re.compile(
    r"^pernr=(?P<pernr>\S+) "
    r"date=(?P<date>\S+) "
    r"(?P<demi>AM|PM) "
    r"avant=(?P<avant>.*?) "
    r"apres=(?P<apres>.*)$"
)


@router.get("/forecast-entries", response_model=list[ForecastAuditEntryOut])
def forecast_entries_audit(
    _admin: AppUser = _admin_only,
    db: Session = Depends(get_db),
    depuis: str | None = Query(
        None,
        description="Jour ISO minimum, INCLUS (ex. 2026-08-01). Filtre sur le JOUR de "
                    "l'horodatage réel de l'écriture (AuditLog.quand), pas sur le jour du "
                    "créneau de prévision modifié. Même type/sémantique que `depuis` sur "
                    "/ueba/anomalies.",
    ),
    jusqua: str | None = Query(
        None,
        description="Jour ISO maximum, INCLUS (ex. 2026-08-31). Même borne que `depuis`. "
                    "Si `jusqua` < `depuis`, la plage est vide (liste vide, pas d'erreur).",
    ),
    limite: int = Query(200, ge=1, le=2000),
):
    """Écritures sur forecast_entry, les plus récentes d'abord. Toutes les lignes
    FORECAST_PAINT en base (création, mise à jour, effacement) — pas de filtre de
    session. Une ligne dont le `detail` ne suit pas le format attendu est exclue
    (jamais d'erreur 500) et signalée en WARNING avec son id.

    `depuis` / `jusqua` : plage de dates optionnelle, bornes INCLUSES, appliquée au
    jour de `AuditLog.quand` (`func.date(...)` — l'horodatage réel de l'écriture),
    JAMAIS au champ `date` extrait du `detail` (jour du créneau modifié, notion
    distincte). Absents : comportement inchangé. `jusqua` < `depuis` : les deux
    bornes sont AND-ées, donc aucune ligne. `limite` s'applique APRÈS ce filtre."""
    q = db.query(AuditLog).filter(AuditLog.action == FORECAST_PAINT_ACTION)
    if depuis:
        q = q.filter(func.date(AuditLog.quand) >= depuis)
    if jusqua:
        q = q.filter(func.date(AuditLog.quand) <= jusqua)
    rows = (
        q.order_by(AuditLog.quand.desc(), AuditLog.id.desc())
        .limit(limite)
        .all()
    )

    sorties: list[ForecastAuditEntryOut] = []
    for row in rows:
        m = _DETAIL_RE.match(row.detail or "")
        if m is None:
            logger.warning(
                "[audit] ligne audit_log #%s (action=%s) au format inattendu, exclue : %r",
                row.id, FORECAST_PAINT_ACTION, row.detail,
            )
            continue
        sorties.append(ForecastAuditEntryOut(
            quand=row.quand,
            qui=row.qui,
            pernr=m.group("pernr"),
            date=m.group("date"),
            demi=m.group("demi"),
            avant=m.group("avant"),
            apres=m.group("apres"),
        ))
    return sorties
