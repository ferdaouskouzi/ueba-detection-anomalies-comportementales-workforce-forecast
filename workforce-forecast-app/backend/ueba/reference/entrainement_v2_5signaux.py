"""
ÉTAPE 3 — Entraîner Isolation Forest avec 5 signaux (+ novelty_zscore)
================================================================================
Copie de entrainement_isolation_forest.py qui ajoute le 5ème signal
novelty_zscore (calculé par calculer_novelty_zscore.py, déjà présent dans
ueba_dataset_workforce_forecast.csv) et compare le modèle à 4 signaux et le
modèle à 5 signaux :
  - recall global (sur les 20 anomalies injectées)
  - recall sur les 5 anomalies "discrètes" (hors_departement=False, volume
    proche de la normale — celles que le modèle à 4 signaux est censé rater)
  - nombre de fausses alertes nécessaires pour atteindre différents seuils de
    sensibilité (top 20 / 50 / 100 / 150 / 200 lignes les plus suspectes)

Ce script n'écrase ni entrainement_isolation_forest.py ni
modele_isolation_forest.joblib : c'est une expérimentation de comparaison.
"""

import pandas as pd
from sklearn.ensemble import IsolationForest

# ------------------------------------------------------------------
# 1) CHARGER LE CSV (déjà enrichi de score_nouveaute / novelty_zscore
#    par calculer_novelty_zscore.py)
# ------------------------------------------------------------------
df = pd.read_csv("ueba_dataset_workforce_forecast.csv", sep=";")
print(f"{len(df)} lignes chargées.\n")

if "novelty_zscore" not in df.columns:
    raise SystemExit(
        "novelty_zscore absent du dataset : exécute d'abord "
        "generation_dataset.py puis calculer_novelty_zscore.py."
    )

# ------------------------------------------------------------------
# 2) PRÉPARER LES 4 SIGNAUX EXISTANTS (identique à entrainement_isolation_forest.py)
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
features_v2 = features_v1 + ["novelty_zscore"]

# ------------------------------------------------------------------
# 3) ENTRAÎNER LES DEUX MODÈLES (mêmes hyperparamètres)
# ------------------------------------------------------------------
HYPERPARAMS = dict(n_estimators=200, contamination=0.012, random_state=42)

modele_v1 = IsolationForest(**HYPERPARAMS)
modele_v1.fit(df[features_v1])
df["prediction_v1"] = modele_v1.predict(df[features_v1])
df["score_v1"] = modele_v1.decision_function(df[features_v1])
df["est_detecte_anormal_v1"] = df["prediction_v1"] == -1

modele_v2 = IsolationForest(**HYPERPARAMS)
modele_v2.fit(df[features_v2])
df["prediction_v2"] = modele_v2.predict(df[features_v2])
df["score_v2"] = modele_v2.decision_function(df[features_v2])
df["est_detecte_anormal_v2"] = df["prediction_v2"] == -1

# ------------------------------------------------------------------
# 4) RECALL GLOBAL ET RECALL SUR LES ANOMALIES DISCRÈTES
# ------------------------------------------------------------------
discretes_mask = df["est_anomalie"] & (~df["hors_departement"]) & (df["volume_zscore"].abs() < 1.5)
nb_discretes = discretes_mask.sum()
nb_anomalies = df["est_anomalie"].sum()


def recall(colonne_detection, masque):
    vrais_positifs = (df.loc[masque, colonne_detection]).sum()
    total = masque.sum()
    return vrais_positifs, total, (vrais_positifs / total if total else float("nan"))


print("=" * 70)
print("COMPARAISON : 4 signaux (v1) vs 5 signaux (v1 + novelty_zscore, v2)")
print("=" * 70)

for nom_modele, colonne in [("v1 (4 signaux)", "est_detecte_anormal_v1"), ("v2 (5 signaux)", "est_detecte_anormal_v2")]:
    vp_global, total_global, recall_global = recall(colonne, df["est_anomalie"])
    vp_discret, total_discret, recall_discret = recall(colonne, discretes_mask)
    faux_positifs = ((df[colonne]) & (~df["est_anomalie"])).sum()

    print(f"\n--- Modèle {nom_modele} ---")
    print(f"Recall global            : {vp_global}/{total_global} ({recall_global:.1%})")
    print(f"Recall anomalies discrètes: {vp_discret}/{total_discret} ({recall_discret:.1%})")
    print(f"Fausses alertes (total)   : {faux_positifs}")

# ------------------------------------------------------------------
# 5) COMPARAISON À SEUIL VARIABLE (pas seulement au seuil par défaut de
#    predict(), qui ne retient que le top ~21 selon contamination=0.012)
# ------------------------------------------------------------------
# Le recall global au seuil par défaut ne bouge pas entre v1 et v2 (voir
# section 4) : ça ne veut pas dire que novelty_zscore n'apporte rien, juste
# que son effet ne se voit pas forcément à CE seuil précis. On regarde donc
# le classement complet par decision_function (le plus suspect en premier),
# à plusieurs seuils de sensibilité, pour voir si les anomalies discrètes
# remontent plus haut dans le classement avec le 5ème signal.


def table_seuils(df, score_col, seuils):
    """Pour chaque seuil (top-N lignes les plus suspectes selon score_col,
    croissant = plus suspect en premier), renvoie une liste de dicts :
    vraies anomalies dans le top-N, fausses alertes, et parmi les vraies
    anomalies détectées, combien sont des anomalies discrètes."""
    classement = df.sort_values(score_col)
    lignes = []
    for n in seuils:
        top_n = classement.head(n)
        vraies_anomalies = int(top_n["est_anomalie"].sum())
        fausses_alertes = n - vraies_anomalies
        discretes_detectees = int((top_n["est_anomalie"] & (~top_n["hors_departement"]) &
                                    (top_n["volume_zscore"].abs() < 1.5)).sum())
        lignes.append({
            "seuil": n,
            "vraies_anomalies": vraies_anomalies,
            "fausses_alertes": fausses_alertes,
            "discretes_detectees": discretes_detectees,
        })
    return lignes


def seuil_pour_recall_cible(df, score_col, cible):
    """Plus petit top-N (et son nombre de fausses alertes) nécessaire pour
    atteindre au moins `cible` vraies anomalies détectées au total."""
    classement = df.sort_values(score_col).reset_index(drop=True)
    cumul_vp = classement["est_anomalie"].cumsum()
    atteint = cumul_vp[cumul_vp >= cible]
    if atteint.empty:
        return None, None, None
    position = atteint.index[0]  # 0-indexé
    n = position + 1
    vp = int(cumul_vp.iloc[position])
    fp = n - vp
    return n, vp, fp


SEUILS = [20, 50, 100, 150, 200]
table_v1 = table_seuils(df, "score_v1", SEUILS)
table_v2 = table_seuils(df, "score_v2", SEUILS)

print("\n" + "=" * 90)
print("COMPARAISON À SEUIL VARIABLE (classement complet par decision_function, top-N lignes les plus suspectes)")
print("=" * 90)
entete = f"{'Seuil':>7} | {'v1 (4 signaux) : VP':>19} {'FP':>6} {'dont discrètes':>15} | {'v2 (5 signaux) : VP':>19} {'FP':>6} {'dont discrètes':>15}"
print(entete)
print("-" * len(entete))
for l1, l2 in zip(table_v1, table_v2):
    print(f"{l1['seuil']:>7} | {l1['vraies_anomalies']:>19} {l1['fausses_alertes']:>6} {l1['discretes_detectees']:>15} | "
          f"{l2['vraies_anomalies']:>19} {l2['fausses_alertes']:>6} {l2['discretes_detectees']:>15}")

# --- À seuil de recall équivalent : combien de fausses alertes pour atteindre 17/20 ? ---
CIBLE_RECALL = 17
n_v1, vp_v1, fp_v1 = seuil_pour_recall_cible(df, "score_v1", CIBLE_RECALL)
n_v2, vp_v2, fp_v2 = seuil_pour_recall_cible(df, "score_v2", CIBLE_RECALL)

print(f"\nPour atteindre {CIBLE_RECALL}/{nb_anomalies} anomalies détectées au total :")
print(f"  v1 (4 signaux) : top-{n_v1} lignes -> {vp_v1} vraies anomalies, {fp_v1} fausses alertes")
print(f"  v2 (5 signaux) : top-{n_v2} lignes -> {vp_v2} vraies anomalies, {fp_v2} fausses alertes")

if fp_v2 < fp_v1:
    print(f"  -> v2 atteint ce recall avec MOINS de fausses alertes ({fp_v1} -> {fp_v2}) : "
          f"novelty_zscore aide à seuil élargi.")
elif fp_v2 > fp_v1:
    print(f"  -> v2 a besoin de PLUS de fausses alertes ({fp_v1} -> {fp_v2}) pour ce même recall : "
          f"novelty_zscore dégrade à seuil élargi.")
else:
    print(f"  -> même nombre de fausses alertes ({fp_v1}) pour les deux modèles : aucun gain à seuil élargi.")

# ------------------------------------------------------------------
# 6) RÈGLE HYBRIDE : Isolation Forest (5 signaux, seuil par défaut) OU
#    novelty_zscore > 2, indépendamment du modèle.
# ------------------------------------------------------------------
# Élargir le seuil top-N marche (section 5) mais coûte cher en fausses
# alertes car il fait remonter TOUTES les lignes un peu suspectes, pas
# seulement celles qui le sont via la nouveauté. Une règle indépendante
# ciblée sur novelty_zscore ne rajoute des alertes QUE pour ce signal précis.
SEUIL_NOVELTY_HYBRIDE = 2

df["est_suspect_hybride"] = df["est_detecte_anormal_v2"] | (df["novelty_zscore"] > SEUIL_NOVELTY_HYBRIDE)

vp_hybride = int((df["est_suspect_hybride"] & df["est_anomalie"]).sum())
fp_hybride = int((df["est_suspect_hybride"] & ~df["est_anomalie"]).sum())
total_alertes_hybride = int(df["est_suspect_hybride"].sum())
discretes_hybride = int((df["est_suspect_hybride"] & discretes_mask).sum())

print("\n" + "=" * 70)
print(f"RÈGLE HYBRIDE : IsolationForest(5 signaux) OU novelty_zscore > {SEUIL_NOVELTY_HYBRIDE}")
print("=" * 70)
print(f"Anomalies détectées (total)  : {vp_hybride}/{nb_anomalies}")
print(f"  dont discrètes             : {discretes_hybride}/{nb_discretes}")
print(f"Fausses alertes              : {fp_hybride}")
print(f"Total d'alertes générées     : {total_alertes_hybride}")

print("\nComparaison avec l'élargissement du seuil top-N (section 5) :")
print(f"{'Approche':>38} | {'VP total':>9} | {'dont discrètes':>15} | {'FP':>6} | {'Alertes totales':>16}")
print("-" * 96)
print(f"{'v2 seuil par défaut (~top-21)':>38} | {table_v2[0]['vraies_anomalies']:>9} | "
      f"{table_v2[0]['discretes_detectees']:>15} | {table_v2[0]['fausses_alertes']:>6} | "
      f"{table_v2[0]['vraies_anomalies'] + table_v2[0]['fausses_alertes']:>16}")
for seuil, l2 in zip(SEUILS, table_v2):
    if seuil in (150, 200):
        print(f"{f'v2 seuil élargi top-{seuil}':>38} | {l2['vraies_anomalies']:>9} | "
              f"{l2['discretes_detectees']:>15} | {l2['fausses_alertes']:>6} | {seuil:>16}")
print(f"{'Règle hybride (IF ou novelty>2)':>38} | {vp_hybride:>9} | "
      f"{discretes_hybride:>15} | {fp_hybride:>6} | {total_alertes_hybride:>16}")

if fp_hybride <= table_v2[3]["fausses_alertes"] and vp_hybride >= table_v2[3]["vraies_anomalies"]:
    # table_v2[3] correspond au seuil top-150
    print(f"\nRÉSULTAT : la règle hybride égale ou améliore le recall du seuil élargi top-150 "
          f"({vp_hybride} vs {table_v2[3]['vraies_anomalies']} vraies anomalies) avec MOINS ou AUTANT "
          f"de fausses alertes ({fp_hybride} vs {table_v2[3]['fausses_alertes']}). Net avantage confirmé.")
else:
    print(f"\nRÉSULTAT : la règle hybride n'égale PAS le compromis du seuil élargi top-150 sur ce dataset "
          f"(recall {vp_hybride} vs {table_v2[3]['vraies_anomalies']}, FP {fp_hybride} vs {table_v2[3]['fausses_alertes']}).")

# ------------------------------------------------------------------
# 7) DÉTAIL DES ANOMALIES DISCRÈTES
# ------------------------------------------------------------------
print("\n" + "=" * 70)
print(f"DÉTAIL DES {nb_discretes} ANOMALIES DISCRÈTES")
print("=" * 70)
colonnes = ["pernr_lead", "date", "volume_zscore", "novelty_zscore", "est_detecte_anormal_v1", "est_detecte_anormal_v2"]
print(df.loc[discretes_mask, colonnes].to_string(index=False))

# ------------------------------------------------------------------
# 8) CONCLUSION
# ------------------------------------------------------------------
vp_discret_v1 = df.loc[discretes_mask, "est_detecte_anormal_v1"].sum()
vp_discret_v2 = df.loc[discretes_mask, "est_detecte_anormal_v2"].sum()

print("\n" + "=" * 70)
if vp_discret_v2 > vp_discret_v1:
    print(f"RÉSULTAT : novelty_zscore AMÉLIORE la détection des anomalies discrètes "
          f"({vp_discret_v1} -> {vp_discret_v2} sur {nb_discretes}).")
elif vp_discret_v2 < vp_discret_v1:
    print(f"RÉSULTAT : novelty_zscore DÉGRADE la détection des anomalies discrètes "
          f"({vp_discret_v1} -> {vp_discret_v2} sur {nb_discretes}).")
else:
    print(f"RÉSULTAT : novelty_zscore NE CHANGE PAS la détection des anomalies discrètes "
          f"({vp_discret_v1}/{nb_discretes} dans les deux cas).")
print("=" * 70)

df.to_csv("resultats_v2_5signaux.csv", sep=";", index=False)
print("\nRésultats complets sauvegardés dans resultats_v2_5signaux.csv")
