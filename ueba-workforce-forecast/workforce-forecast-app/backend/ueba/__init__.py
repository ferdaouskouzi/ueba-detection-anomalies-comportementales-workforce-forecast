"""
Module UEBA (User & Entity Behavior Analytics) — portage backend du dépôt
UEBA-Detection-Anomalies-RH dans l'API Workforce Forecast.

Rôle : détecter les accès en lecture anormaux aux données nominatives à partir
du journal `audit_log`, via le modèle Isolation Forest déjà entraîné
(modele_isolation_forest.joblib, 5 signaux z-scorés) + la règle hybride
`novelty_zscore > 2` (voir reference/entrainement_v2_5signaux.py, section 6).

Différences assumées avec le module source (détaillées dans README.md) :
  - la baseline par lead et l'historique 7 jours ne sont plus des fichiers
    (baseline_par_lead.csv / historique_consultations.json) mais un calcul à la
    volée sur `audit_log` — contrainte RGPD : rien sur disque hors SQLite ;
  - le scoring tourne en BackgroundTasks, jamais dans le chemin de la réponse ;
  - tout /ueba/* est réservé au rôle ADMIN (app.deps.require_roles).
"""
