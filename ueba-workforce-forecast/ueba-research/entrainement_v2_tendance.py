"""
ÉTAPE 6bis — Expérimentation : ajouter un signal de TENDANCE à Isolation Forest
================================================================================
Ce script est une COPIE de entrainement_isolation_forest.py, il ne le remplace
pas et ne modifie ni main.py ni les fichiers de production (modele_isolation_forest.joblib,
baseline_par_lead.csv restent intacts).

Objectif : le modèle actuel (4 signaux, calculés sur UN SEUL jour) rate les
anomalies "discrètes" qui restent proches de la moyenne habituelle du lead sur
une journée isolée mais qui, vues sur plusieurs jours, dessinent une dérive.

On ajoute donc un 5ème signal, "tendance_zscore" :
  1) pour chaque ligne, on calcule la moyenne glissante de nb_fiches_consultees
     sur les 5 jours PRÉCÉDENTS ce même pernr_lead (trié par date) ;
  2) pour les tout premiers jours d'un lead (moins de 5 jours d'historique
     disponible), on utilise la moyenne glissante sur les jours réellement
     disponibles plutôt que d'exclure la ligne. Pour le tout premier jour
     d'un lead (aucun historique du tout), on utilise la valeur du jour même
     comme meilleure information disponible ;
  3) on transforme cette moyenne glissante en score-z par rapport à la
     moyenne/écart-type habituels du lead sur TOUT le dataset (les mêmes
     moyenne/écart-type que ceux utilisés pour volume_zscore).

On entraîne ensuite un second IsolationForest avec les 5 signaux (mêmes
hyperparamètres que l'original) et on compare les deux modèles, en particulier
sur les anomalies "discrètes" : est_anomalie=True, hors_departement=False,
et volume_zscore (ancien modèle) < 1.5 — celles que le modèle à 4 signaux rate.
"""

import pandas as pd
from sklearn.ensemble import IsolationForest

# ------------------------------------------------------------------
# 1) CHARGER LE CSV
# ------------------------------------------------------------------
df = pd.read_csv("ueba_dataset_workforce_forecast.csv", sep=";")

print(f"{len(df)} lignes chargées.")

# ------------------------------------------------------------------
# 2) PRÉPARER LES SIGNAUX, COMME DANS entrainement_isolation_forest.py
# ------------------------------------------------------------------
df["hors_departement_num"] = df["hors_departement"].astype(str).map({"True": 1, "False": 0})
df["vitesse"] = df["nb_fiches_consultees"] / df["duree_minutes"].replace(0, 0.1)


def ajouter_zscore_par_lead(df, colonne):
    moyenne = df.groupby("pernr_lead")[colonne].transform("mean")
    ecart_type = df.groupby("pernr_lead")[colonne].transform("std")
    ecart_type = ecart_type.replace(0, 0.001)
    return (df[colonne] - moyenne) / ecart_type


df["volume_zscore"] = ajouter_zscore_par_lead(df, "nb_fiches_consultees")
df["heure_zscore"] = ajouter_zscore_par_lead(df, "heure_connexion")
df["vitesse_zscore"] = ajouter_zscore_par_lead(df, "vitesse")

features_v1 = ["volume_zscore", "heure_zscore", "vitesse_zscore", "hors_departement_num"]

# ------------------------------------------------------------------
# 3) NOUVEAU SIGNAL : tendance_zscore
# ------------------------------------------------------------------
# On trie par lead puis par date pour calculer une vraie moyenne glissante
# chronologique, puis on remet le résultat dans l'ordre original du DataFrame.
df_chrono = df.sort_values(["pernr_lead", "date"])

moyenne_glissante_5j = df_chrono.groupby("pernr_lead")["nb_fiches_consultees"].transform(
    lambda serie: serie.shift(1).rolling(window=5, min_periods=1).mean()
)
# Tout premier jour d'un lead : aucun jour précédent n'existe encore.
# On utilise la valeur du jour même plutôt que d'exclure la ligne (NaN).
moyenne_glissante_5j = moyenne_glissante_5j.fillna(df_chrono["nb_fiches_consultees"])

df["tendance_brute"] = moyenne_glissante_5j.reindex(df.index)

moyenne_volume_lead = df.groupby("pernr_lead")["nb_fiches_consultees"].transform("mean")
ecart_type_volume_lead = df.groupby("pernr_lead")["nb_fiches_consultees"].transform("std")
ecart_type_volume_lead = ecart_type_volume_lead.replace(0, 0.001)

df["tendance_zscore"] = (df["tendance_brute"] - moyenne_volume_lead) / ecart_type_volume_lead

features_v2 = features_v1 + ["tendance_zscore"]

print("Aperçu des features (avec tendance_zscore) :")
print(df[["pernr_lead", "date"] + features_v2].head(8), "\n")

# ------------------------------------------------------------------
# 4) ENTRAÎNER LES DEUX MODÈLES (mêmes hyperparamètres)
# ------------------------------------------------------------------
HYPERPARAMS = dict(n_estimators=200, contamination=0.012, random_state=42)

modele_v1 = IsolationForest(**HYPERPARAMS)
modele_v1.fit(df[features_v1])
df["prediction_v1"] = modele_v1.predict(df[features_v1])
df["est_detecte_anormal_v1"] = df["prediction_v1"] == -1

modele_v2 = IsolationForest(**HYPERPARAMS)
modele_v2.fit(df[features_v2])
df["prediction_v2"] = modele_v2.predict(df[features_v2])
df["est_detecte_anormal_v2"] = df["prediction_v2"] == -1

# ------------------------------------------------------------------
# 5) COMPARER AVEC LA VÉRITÉ TERRAIN (est_anomalie)
# ------------------------------------------------------------------
def comparer(df, colonne_detection, nom_modele):
    vrais_positifs = (df[colonne_detection] & df["est_anomalie"]).sum()
    faux_negatifs = ((~df[colonne_detection]) & df["est_anomalie"]).sum()
    faux_positifs = (df[colonne_detection] & (~df["est_anomalie"])).sum()
    total_vraies_anomalies = df["est_anomalie"].sum()

    print(f"--- {nom_modele} ---")
    print(f"Anomalies détectées (total)           : {df[colonne_detection].sum()}")
    print(f"Vraies anomalies dans le dataset       : {total_vraies_anomalies}")
    print(f"Anomalies correctement détectées       : {vrais_positifs}")
    print(f"Anomalies ratées (faux négatifs)       : {faux_negatifs}")
    print(f"Fausses alertes (faux positifs)        : {faux_positifs}")
    print(f"Taux de détection (recall)             : {vrais_positifs/total_vraies_anomalies:.1%}\n")


print("=" * 60)
print("COMPARAISON GLOBALE : 4 signaux (v1) vs 5 signaux (v2)")
print("=" * 60)
comparer(df, "est_detecte_anormal_v1", "Modèle v1 (4 signaux)")
comparer(df, "est_detecte_anormal_v2", "Modèle v2 (4 signaux + tendance_zscore)")

# ------------------------------------------------------------------
# 6) FOCUS SUR LES ANOMALIES "DISCRÈTES" (celles que v1 rate typiquement)
# ------------------------------------------------------------------
discretes = df[
    (df["est_anomalie"])
    & (~df["hors_departement"])
    & (df["volume_zscore"] < 1.5)
]

print("=" * 60)
print(f"ANOMALIES DISCRÈTES (hors_departement=False, volume_zscore<1.5) : {len(discretes)} trouvées")
print("=" * 60)
colonnes_affichage = [
    "pernr_lead", "date", "volume_zscore", "tendance_zscore",
    "est_detecte_anormal_v1", "est_detecte_anormal_v2",
]
print(discretes[colonnes_affichage].to_string(index=False), "\n")

nb_detectees_v1 = discretes["est_detecte_anormal_v1"].sum()
nb_detectees_v2 = discretes["est_detecte_anormal_v2"].sum()

print(f"Détectées par v1 (4 signaux)            : {nb_detectees_v1}/{len(discretes)}")
print(f"Détectées par v2 (4 signaux + tendance)  : {nb_detectees_v2}/{len(discretes)}\n")

if nb_detectees_v2 > nb_detectees_v1:
    print(f"RÉSULTAT : le signal tendance_zscore AMÉLIORE la détection des anomalies "
          f"discrètes ({nb_detectees_v1} -> {nb_detectees_v2} sur {len(discretes)}).")
elif nb_detectees_v2 < nb_detectees_v1:
    print(f"RÉSULTAT : le signal tendance_zscore DÉGRADE la détection des anomalies "
          f"discrètes ({nb_detectees_v1} -> {nb_detectees_v2} sur {len(discretes)}).")
else:
    print(f"RÉSULTAT : le signal tendance_zscore NE CHANGE PAS la détection des anomalies "
          f"discrètes ({nb_detectees_v1}/{len(discretes)} dans les deux cas).")

# Sauvegarde des résultats détaillés pour analyse (fichier séparé, n'écrase rien)
df.to_csv("resultats_v2_tendance.csv", sep=";", index=False)
print("\nRésultats complets sauvegardés dans resultats_v2_tendance.csv")
