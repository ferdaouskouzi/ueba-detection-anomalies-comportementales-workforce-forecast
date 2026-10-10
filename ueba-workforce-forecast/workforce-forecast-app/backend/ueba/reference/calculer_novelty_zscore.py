"""
ÉTAPE 2 — Calcul du signal novelty_zscore
================================================================================
Lit consultations_detail.csv (une ligne par consultation individuelle) et
ueba_dataset_workforce_forecast.csv (les agrégats), et ajoute au dataset
principal deux colonnes :

  - score_nouveaute : pour chaque (lead, jour), la proportion de collaborateurs
    consultés ce jour-là qui n'apparaissent PAS dans les 7 jours glissants
    PRÉCÉDENTS (le jour même exclu). Cas particulier : le tout premier jour
    d'historique d'un lead (aucun jour précédent du tout) donnerait
    mécaniquement 100% de "nouveaux" sans que ce soit un comportement suspect
    — on force alors score_nouveaute=0 (même convention que l'API en
    production, voir main.py, quand pernrs_consultes est vide).
  - novelty_zscore : le score-z de score_nouveaute par rapport à la
    moyenne/écart-type habituels de CE lead, calculés sur tout son historique
    dans le dataset — exactement la même logique que pour volume_zscore,
    heure_zscore et vitesse_zscore.

Ce calcul est volontairement indépendant de la génération (generation_dataset.py) :
il ne réutilise pas l'état interne du générateur, il repart uniquement du
détail des consultations, comme le ferait l'API en production (voir main.py,
étape 5) à partir de son propre historique.
"""

import pandas as pd

FENETRE_GLISSANTE_JOURS = 7


def calculer_score_nouveaute(detail: pd.DataFrame) -> pd.DataFrame:
    """Retourne un DataFrame (pernr_lead, date, score_nouveaute)."""
    # Un set de pernrs consultés par (lead, date)
    consultes_par_jour = (
        detail.groupby(["pernr_lead", "date"])["pernr_collaborateur_consulte"]
        .apply(set)
        .reset_index(name="consultes")
    )
    consultes_par_jour = consultes_par_jour.sort_values(["pernr_lead", "date"])

    lignes = []
    for lead, groupe in consultes_par_jour.groupby("pernr_lead"):
        historique = []  # liste de sets, fenêtre glissante des 7 jours précédents
        for _, ligne in groupe.iterrows():
            aujourdhui = ligne["consultes"]

            if not historique:
                # Aucun jour précédent connu : pas de référence pour juger de la
                # "nouveauté", donc pas de signal plutôt qu'un faux 100%.
                score = 0.0
            else:
                deja_vus = set().union(*historique)
                nouveaux = aujourdhui - deja_vus
                score = len(nouveaux) / len(aujourdhui) if aujourdhui else 0.0

            lignes.append({
                "pernr_lead": lead,
                "date": ligne["date"],
                "score_nouveaute": score,
            })

            historique.append(aujourdhui)
            if len(historique) > FENETRE_GLISSANTE_JOURS:
                historique.pop(0)

    return pd.DataFrame(lignes)


if __name__ == "__main__":
    df = pd.read_csv("ueba_dataset_workforce_forecast.csv", sep=";")
    detail = pd.read_csv("consultations_detail.csv", sep=";")

    # Idempotent : si le script a déjà tourné, on repart des agrégats bruts
    # plutôt que d'empiler des colonnes en double.
    df = df.drop(columns=["score_nouveaute", "novelty_zscore"], errors="ignore")

    scores = calculer_score_nouveaute(detail)
    df = df.merge(scores, on=["pernr_lead", "date"], how="left")

    moyenne = df.groupby("pernr_lead")["score_nouveaute"].transform("mean")
    ecart_type = df.groupby("pernr_lead")["score_nouveaute"].transform("std")
    ecart_type = ecart_type.replace(0, 0.001)
    df["novelty_zscore"] = (df["score_nouveaute"] - moyenne) / ecart_type

    df.to_csv("ueba_dataset_workforce_forecast.csv", sep=";", index=False)

    print(f"score_nouveaute et novelty_zscore ajoutés à ueba_dataset_workforce_forecast.csv "
          f"({len(df)} lignes).")
    print(f"score_nouveaute moyen : {df['score_nouveaute'].mean():.3f}")

    discretes = df[
        df["est_anomalie"]
        & (~df["hors_departement"])
    ]
    print("\nAnomalies discrètes (hors_departement=False) — score_nouveaute / novelty_zscore :")
    print(discretes[["pernr_lead", "date", "score_nouveaute", "novelty_zscore"]].to_string(index=False))
