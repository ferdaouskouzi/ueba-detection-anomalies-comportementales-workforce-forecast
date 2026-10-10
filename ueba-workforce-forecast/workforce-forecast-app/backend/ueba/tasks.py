"""
Orchestration du scoring UEBA.

  - `scorer_action_explicite` : chemin synchrone de l'endpoint POST /ueba/score
    (mêmes entrées/sorties que le /score du module source).
  - `rescore_lead_jour` / `planifier_rescore` : chemin asynchrone. Après chaque
    nouvel événement AuditLog de lecture, l'agrégat (lead, jour courant) est
    recalculé et rescoré en BackgroundTasks — jamais dans le chemin de la
    réponse HTTP. Toute erreur y est avalée : une tâche de fond ne doit jamais
    faire échouer la requête qui l'a déclenchée.
"""
from __future__ import annotations

import datetime as dt
import json
import logging

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import UebaScore
from . import model
from .features import ContexteLead, charger_contexte, jour_courant_utc
from .model import LeadInconnuError

logger = logging.getLogger(__name__)


def _nouvelle_session() -> Session:
    """Indirection testable : la tâche de fond tourne APRÈS la fermeture de la
    session de la requête, elle doit donc ouvrir la sienne. Les tests peuvent
    patcher ce point pour la faire pointer sur leur base isolée."""
    return SessionLocal()


def scorer_jour(ctx: ContexteLead, jour: str) -> tuple[dict, bool] | None:
    """Score l'agrégat (lead, `jour`). Renvoie (verdict, fiables_seulement) ou
    None si le lead n'a aucun accès ce jour-là."""
    agregat = ctx.par_jour.get(jour)
    if agregat is None:
        return None

    neutraliser_perimetre = agregat.hors_departement is None
    neutraliser_novelty = not agregat.novelty_dispo

    verdict = model.evaluer(
        pernr_lead=ctx.pernr_lead,
        baseline=ctx.baseline,
        volume=agregat.volume,
        heure_connexion=agregat.heure,
        vitesse=agregat.vitesse,
        hors_departement=bool(agregat.hors_departement),
        score_nouveaute=agregat.score_nouveaute,
        neutraliser_perimetre=neutraliser_perimetre,
        neutraliser_novelty=neutraliser_novelty,
    )
    return verdict, (neutraliser_perimetre or neutraliser_novelty)


def scorer_action_explicite(
    db: Session,
    *,
    pernr_lead: str,
    heure_connexion: float,
    nb_fiches_consultees: int,
    hors_departement: bool,
    duree_minutes: float,
    pernrs_consultes: list[str],
) -> dict:
    """POST /ueba/score : score une action fournie explicitement (ne touche pas
    à audit_log). La baseline et l'historique 7 jours viennent d'audit_log ;
    lève LeadInconnuError si le lead n'y a aucun accès tracé."""
    ctx = charger_contexte(db, pernr_lead)

    consultes = {str(p) for p in (pernrs_consultes or [])}
    deja_vus = ctx.deja_vus_avant(jour_courant_utc())
    if not consultes or not deja_vus:
        score_nouveaute = 0.0
    else:
        score_nouveaute = len(consultes - deja_vus) / len(consultes)

    vitesse = nb_fiches_consultees / max(duree_minutes, 0.1)

    return model.evaluer(
        pernr_lead=pernr_lead,
        baseline=ctx.baseline,
        volume=nb_fiches_consultees,
        heure_connexion=heure_connexion,
        vitesse=vitesse,
        hors_departement=hors_departement,
        score_nouveaute=score_nouveaute,
        neutraliser_perimetre=False,
        neutraliser_novelty=False,
    )


def _upsert_score(db: Session, pernr_lead: str, jour: str, verdict: dict, fiables_seulement: bool) -> None:
    row = (
        db.query(UebaScore)
        .filter(UebaScore.pernr_lead == pernr_lead, UebaScore.jour == jour)
        .first()
    )
    if row is None:
        row = UebaScore(pernr_lead=pernr_lead, jour=jour)
        db.add(row)
    row.est_suspect = bool(verdict["est_suspect"])
    row.raison_alerte = verdict["raison_alerte"]
    row.score_confiance = float(verdict["score_confiance"])
    row.signaux_json = json.dumps(verdict["signaux_calcules"], ensure_ascii=False)
    row.signaux_fiables_seulement = fiables_seulement
    row.calcule_le = dt.datetime.utcnow()
    db.commit()


def rescore_lead_jour(pernr_lead: str, jour: str | None = None) -> None:
    """Tâche de fond : recalcule l'agrégat (lead, jour) et upsert le verdict dans
    `ueba_score`. Ouvre sa propre session (la session de la requête est fermée).
    N'émet jamais d'exception."""
    jour = jour or jour_courant_utc()
    db = _nouvelle_session()
    try:
        ctx = charger_contexte(db, pernr_lead)
        resultat = scorer_jour(ctx, jour)
        if resultat is None:
            return
        verdict, fiables = resultat
        _upsert_score(db, pernr_lead, jour, verdict, fiables)
    except LeadInconnuError:
        return  # rien à scorer pour ce lead
    except Exception:  # noqa: BLE001 — une tâche de fond ne doit rien faire remonter
        # On avale l'erreur (ne pas casser la requête qui a déclenché la tâche),
        # mais on la trace : sans ça un rescoring cassé passerait totalement inaperçu.
        logger.exception("[ueba] échec du rescoring de %s/%s", pernr_lead, jour)
    finally:
        db.close()


def planifier_rescore(background_tasks: BackgroundTasks, pernr_lead: str, jour: str | None = None) -> None:
    """À appeler depuis un endpoint après un nouvel événement AuditLog de lecture."""
    background_tasks.add_task(rescore_lead_jour, pernr_lead, jour)
