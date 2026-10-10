"""
Sauvegarde le modèle entraîné (5 signaux, dont novelty_zscore) + les
statistiques de baseline de chaque lead, pour pouvoir les réutiliser dans
l'API sans tout recalculer à chaque fois.

Sauvegarde aussi historique_consultations.json : pour chaque lead, les 7
derniers jours (date, liste de pernrs consultés) du dataset d'entraînement.
Ce fichier sert de point de départ à l'historique en mémoire de l'API
(voir main.py) — sans lui, l'API démarrerait avec un historique vide et
score_nouveaute=0 pour toutes les premières requêtes de chaque lead.
"""
import json

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

FENETRE_GLISSANTE_JOURS = 7

df = pd.read_csv("ueba_dataset_workforce_forecast.csv", sep=";")
detail = pd.read_csv("consultations_detail.csv", sep=";")

if "novelty_zscore" not in df.columns:
    raise SystemExit(
        "novelty_zscore absent du dataset : exécute d'abord "
        "generation_dataset.py puis calculer_novelty_zscore.py."
    )

df["hors_departement_num"] = df["hors_departement"].astype(str).map({"True": 1, "False": 0})
df["vitesse"] = df["nb_fiches_consultees"] / df["duree_minutes"].replace(0, 0.1)


def zscore(df, col):
    m = df.groupby("pernr_lead")[col].transform("mean")
    s = df.groupby("pernr_lead")[col].transform("std").replace(0, 0.001)
    return (df[col] - m) / s


df["volume_zscore"] = zscore(df, "nb_fiches_consultees")
df["heure_zscore"] = zscore(df, "heure_connexion")
df["vitesse_zscore"] = zscore(df, "vitesse")
# novelty_zscore est déjà calculé (calculer_novelty_zscore.py) et présent dans le CSV.

features = ["volume_zscore", "heure_zscore", "vitesse_zscore", "hors_departement_num", "novelty_zscore"]
modele = IsolationForest(n_estimators=200, contamination=0.012, random_state=42)
modele.fit(df[features])

# On sauvegarde le modèle entraîné dans un fichier
joblib.dump(modele, "modele_isolation_forest.joblib")

# On sauvegarde la baseline (moyenne/écart-type) de chaque lead, pour chaque signal
baseline = df.groupby("pernr_lead").agg(
    moyenne_volume=("nb_fiches_consultees", "mean"),
    ecart_type_volume=("nb_fiches_consultees", "std"),
    moyenne_heure=("heure_connexion", "mean"),
    ecart_type_heure=("heure_connexion", "std"),
    moyenne_vitesse=("vitesse", "mean"),
    ecart_type_vitesse=("vitesse", "std"),
    moyenne_nouveaute=("score_nouveaute", "mean"),
    ecart_type_nouveaute=("score_nouveaute", "std"),
).reset_index()
baseline.to_csv("baseline_par_lead.csv", sep=";", index=False)

# --- historique_consultations.json : les 7 derniers jours de chaque lead ---
historique = {}
for pernr_lead, groupe in detail.groupby("pernr_lead"):
    dates_recentes = sorted(groupe["date"].unique())[-FENETRE_GLISSANTE_JOURS:]
    jours = []
    for date in dates_recentes:
        pernrs_du_jour = sorted(
            str(p) for p in groupe.loc[groupe["date"] == date, "pernr_collaborateur_consulte"].unique()
        )
        jours.append({"date": date, "pernrs": pernrs_du_jour})
    historique[str(pernr_lead)] = jours

with open("historique_consultations.json", "w", encoding="utf-8") as f:
    json.dump(historique, f, ensure_ascii=False, indent=2)

print("Modèle sauvegardé -> modele_isolation_forest.joblib (5 signaux)")
print("Baseline sauvegardée -> baseline_par_lead.csv")
print("Historique de consultations sauvegardé -> historique_consultations.json")
print(f"\n{len(baseline)} leads dans la baseline.")
print(baseline.head(3))
