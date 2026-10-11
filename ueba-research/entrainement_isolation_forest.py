"""
ÉTAPE 6 — Entraîner Isolation Forest sur le dataset UEBA
============================================================
À exécuter SUR TON PC (pas ici), une fois Python + pandas + scikit-learn installés.
Mets ce script dans le MÊME dossier que ueba_dataset_workforce_forecast.csv
"""

import pandas as pd
from sklearn.ensemble import IsolationForest

# ------------------------------------------------------------------
# 1) CHARGER LE CSV
# ------------------------------------------------------------------
# sep=";" -> car on a généré le fichier avec des points-virgules
df = pd.read_csv("ueba_dataset_workforce_forecast.csv", sep=";")

print(f"{len(df)} lignes chargées.")
print(df.head(), "\n")


# ------------------------------------------------------------------
# 2) PRÉPARER LES 4 SIGNAUX (features), COMME ON L'A APPRIS
# ------------------------------------------------------------------
# hors_departement est du texte "False"/"True" -> on le transforme en 0/1
df["hors_departement_num"] = df["hors_departement"].astype(str).map({"True": 1, "False": 0})

# Vitesse = fiches consultées par minute (plus c'est haut, plus c'est suspect)
df["vitesse"] = df["nb_fiches_consultees"] / df["duree_minutes"].replace(0, 0.1)

# RAPPEL IMPORTANT (celui qu'on a longuement travaillé ensemble) :
# on ne compare JAMAIS une valeur brute entre deux personnes différentes.
# On calcule le score-z de CHAQUE lead PAR RAPPORT A SA PROPRE moyenne.
def ajouter_zscore_par_lead(df, colonne):
    moyenne = df.groupby("pernr_lead")[colonne].transform("mean")
    ecart_type = df.groupby("pernr_lead")[colonne].transform("std")
    ecart_type = ecart_type.replace(0, 0.001)  # évite une division par zéro
    return (df[colonne] - moyenne) / ecart_type

df["volume_zscore"] = ajouter_zscore_par_lead(df, "nb_fiches_consultees")
df["heure_zscore"] = ajouter_zscore_par_lead(df, "heure_connexion")
df["vitesse_zscore"] = ajouter_zscore_par_lead(df, "vitesse")

# Les 4 signaux finaux qu'on donne au modèle (volume, horaire, vitesse, périmètre) :
features = ["volume_zscore", "heure_zscore", "vitesse_zscore", "hors_departement_num"]

print("Aperçu des features calculées :")
print(df[["pernr_lead", "date"] + features].head(), "\n")


# ------------------------------------------------------------------
# 3) ENTRAÎNER ISOLATION FOREST
# ------------------------------------------------------------------
# contamination = la proportion attendue d'anomalies dans les données.
# On sait qu'on en a injecté 20 sur 1728 lignes (~1.16%) - en vrai, on
# ne connaît jamais ce chiffre à l'avance, on l'estime prudemment.
modele = IsolationForest(
    n_estimators=200,     # nombre "d'arbres" qui essaient d'isoler les points
    contamination=0.012,  # ~1.2% de points jugés anormaux
    random_state=42        # pour avoir un résultat reproductible
)

# ATTENTION : le modèle ne voit JAMAIS la colonne est_anomalie pendant l'entraînement.
# C'est ça, le principe du non supervisé qu'on a vu ensemble.
modele.fit(df[features])

# predict() renvoie -1 pour "anormal" et 1 pour "normal"
df["prediction"] = modele.predict(df[features])
df["est_detecte_anormal"] = df["prediction"] == -1


# ------------------------------------------------------------------
# 4) COMPARER AVEC LA VÉRITÉ TERRAIN (est_anomalie)
# ------------------------------------------------------------------
vrais_positifs = ((df["est_detecte_anormal"]) & (df["est_anomalie"])).sum()
faux_negatifs = ((~df["est_detecte_anormal"]) & (df["est_anomalie"])).sum()
faux_positifs = ((df["est_detecte_anormal"]) & (~df["est_anomalie"])).sum()
total_vraies_anomalies = df["est_anomalie"].sum()

print("=" * 50)
print("RÉSULTATS")
print("=" * 50)
print(f"Vraies anomalies dans le dataset      : {total_vraies_anomalies}")
print(f"Anomalies correctement détectées      : {vrais_positifs}")
print(f"Anomalies ratées (faux négatifs)      : {faux_negatifs}")
print(f"Fausses alertes (faux positifs)       : {faux_positifs}")
print(f"Taux de détection (recall)            : {vrais_positifs/total_vraies_anomalies:.1%}")

# Sauvegarde des résultats pour les regarder en détail dans Excel
df.to_csv("resultats_isolation_forest.csv", sep=";", index=False)
print("\nRésultats complets sauvegardés dans resultats_isolation_forest.csv")