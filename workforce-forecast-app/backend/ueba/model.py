"""
Chargement du modèle Isolation Forest (5 signaux z-scorés, entraîné dans
reference/sauvegarder_modele.py) et calcul du verdict — portage direct de
`evaluer_action` du main.py source, sans l'accès aux fichiers baseline/historique
(fournis ici par ueba.features à partir de audit_log).

Vérification du point 1 de la demande : le .joblib est entraîné sur
['volume_zscore','heure_zscore','vitesse_zscore','hors_departement_num','novelty_zscore'],
c.-à-d. des features standardisées par lead + un indicateur 0/1 + un z-score de
nouveauté — AUCUNE identité de lead n'entre dans le modèle. Il est donc
réutilisable tel quel dès qu'on lui présente les 5 mêmes signaux.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd

_MODELE_PATH = Path(__file__).with_name("modele_isolation_forest.joblib")

# Seuil de la règle hybride — reference/entrainement_v2_5signaux.py, section 6 :
# une action est aussi marquée suspecte si novelty_zscore dépasse ce seuil,
# indépendamment du verdict d'Isolation Forest (meilleur recall sur les
# anomalies "discrètes" avec beaucoup moins de fausses alertes qu'un seuil élargi).
SEUIL_NOVELTY_HYBRIDE = 2

_FEATURES = ["volume_zscore", "heure_zscore", "vitesse_zscore", "hors_departement_num", "novelty_zscore"]

# Chargé une seule fois à l'import (comme au démarrage de l'API source).
_modele = joblib.load(_MODELE_PATH)


@dataclass
class Baseline:
    """Moyennes / écarts-types des signaux d'un lead — équivalent d'une ligne de
    baseline_par_lead.csv, mais calculé à la volée (ueba.features.calculer_baseline)."""
    moyenne_volume: float
    ecart_type_volume: float
    moyenne_heure: float
    ecart_type_heure: float
    moyenne_vitesse: float
    ecart_type_vitesse: float
    moyenne_nouveaute: float
    ecart_type_nouveaute: float
    n_jours: int


class LeadInconnuError(Exception):
    """Levée quand le pernr_lead n'a aucun historique d'accès exploitable
    (équivalent de l'absence de baseline dans le module source)."""


def _z(valeur: float, moyenne: float, ecart_type: float) -> float:
    return (valeur - moyenne) / max(ecart_type, 0.001)


def evaluer(
    *,
    pernr_lead: str,
    baseline: Baseline,
    volume: float,
    heure_connexion: float,
    vitesse: float,
    hors_departement: bool,
    score_nouveaute: float,
    neutraliser_perimetre: bool = False,
    neutraliser_novelty: bool = False,
) -> dict:
    """
    Reproduit `evaluer_action` du main.py source :
      1) 5 signaux z-scorés par rapport à la baseline du lead ;
      2) Isolation Forest : normal (1) / anormal (-1) + decision_function ;
      3) règle hybride : suspect si le modèle le dit OU si novelty_zscore > seuil.

    neutraliser_perimetre / neutraliser_novelty : mis à True quand `perimetre` /
    `target_pernrs` manquent sur l'agrégat (lignes d'audit antérieures à la
    migration). Le signal correspondant est alors forcé à 0 — pas inventé — et
    le modèle tourne de fait sur les 3 signaux fiables (volume, horaire, vitesse).
    """
    volume_zscore = _z(volume, baseline.moyenne_volume, baseline.ecart_type_volume)
    heure_zscore = _z(heure_connexion, baseline.moyenne_heure, baseline.ecart_type_heure)
    vitesse_zscore = _z(vitesse, baseline.moyenne_vitesse, baseline.ecart_type_vitesse)

    hors_departement_num = 0 if neutraliser_perimetre else (1 if hors_departement else 0)
    if neutraliser_novelty:
        score_nouveaute = 0.0
        novelty_zscore = 0.0
    else:
        novelty_zscore = _z(score_nouveaute, baseline.moyenne_nouveaute, baseline.ecart_type_nouveaute)

    features = pd.DataFrame(
        [[volume_zscore, heure_zscore, vitesse_zscore, hors_departement_num, novelty_zscore]],
        columns=_FEATURES,
    )

    prediction = _modele.predict(features)[0]           # -1 = anormal, 1 = normal
    score_brut = _modele.decision_function(features)[0]  # plus c'est négatif, plus c'est suspect

    modele_suspect = bool(prediction == -1)
    novelty_suspect = (not neutraliser_novelty) and bool(novelty_zscore > SEUIL_NOVELTY_HYBRIDE)
    est_suspect = modele_suspect or novelty_suspect

    raisons = []
    if modele_suspect:
        raisons.append("modele_isolation_forest")
    if novelty_suspect:
        raisons.append("nouveaute_cible")

    return {
        "pernr_lead": pernr_lead,
        "est_suspect": est_suspect,
        "raison_alerte": ",".join(raisons) if raisons else None,
        "score_confiance": round(float(score_brut), 3),
        "signaux_calcules": {
            "volume_zscore": round(volume_zscore, 2),
            "heure_zscore": round(heure_zscore, 2),
            "vitesse_zscore": round(vitesse_zscore, 2),
            "hors_departement": bool(hors_departement) and not neutraliser_perimetre,
            "score_nouveaute": round(float(score_nouveaute), 3),
            "novelty_zscore": round(novelty_zscore, 2),
        },
    }
