# Module UEBA — portage backend

Portage du dépôt `UEBA-Detection-Anomalies-RH` dans l'API Workforce Forecast.
Détecte les accès en lecture anormaux aux données nominatives à partir du journal
`audit_log`.

## Point 1 — le modèle est-il réutilisable tel quel ?

**Oui.** `modele_isolation_forest.joblib` (copié tel quel) est entraîné
(`reference/sauvegarder_modele.py`) sur cinq features **standardisées par lead** :

```
volume_zscore, heure_zscore, vitesse_zscore, hors_departement_num, novelty_zscore
```

Aucune identité de lead n'entre dans le modèle — uniquement des z-scores, un
indicateur 0/1 et un z-score de nouveauté. Il suffit de lui présenter les cinq
mêmes signaux, calculés ici depuis `audit_log` au lieu des CSV source.
Vérifié à l'exécution : `feature_names_in_ == [...]`, `n_features_in_ == 5`.

## Ce qui a été copié vs adapté

| Source | Ici |
|---|---|
| `main.py` (`evaluer_action`, règle hybride, `calculer_score_nouveaute`, `mettre_a_jour_historique`) | `model.py` (`evaluer` + règle hybride `novelty_zscore > 2`) et `features.py` / `tasks.py` (nouveauté, agrégats) |
| `entrainement_v2_5signaux.py`, `sauvegarder_modele.py`, `calculer_novelty_zscore.py`, `main.py`, `tests/test_api.py` | `reference/` (documentation, non importés au runtime) |
| `modele_isolation_forest.joblib` | `ueba/modele_isolation_forest.joblib` (identique) |
| `templates/dashboard.html` (Jinja2) | **non copié** — le panneau Admin React consomme `GET /ueba/anomalies` (JSON) |
| `baseline_par_lead.csv` | **non copié** — recalculé à la volée (`features.calculer_baseline`) depuis `audit_log` |
| `historique_consultations.json` | **non copié** — fenêtre 7 jours reconstruite depuis `audit_log` (`features` / `ContexteLead.deja_vus_avant`) |
| `tests/test_api.py` + `conftest.py` | `tests/test_ueba.py` (réutilise `tests/conftest.py` du projet) |

## Contraintes respectées

- **RBAC (point 3)** : tout `/ueba/*` passe par `Depends(require_roles("ADMIN"))`
  — la dépendance exacte utilisée ailleurs (`/admin/import/*`).
- **Données réelles (point 4)** : moyenne / écart-type par lead et suivi 7 jours
  des PERNR consultés sont dérivés de `audit_log` (`qui`, `quand`, `target_pernrs`,
  `perimetre`, `detail`).
- **BackgroundTasks (point 6)** : après chaque événement `audit_log` de lecture,
  l'agrégat (lead, jour courant) est replanifié via `planifier_rescore` — jamais
  dans le chemin de la réponse HTTP. Le verdict atterrit dans `ueba_score`.
- **RGPD (point 7)** : aucun artefact de scoring sur disque hors du schéma SQLite.
  Baseline et historique sont recalculés en mémoire ; seul le verdict est
  persisté, dans la table `ueba_score` de `workforce.db`. Le `.joblib` est un
  poids de modèle en lecture seule, pas une sortie de scoring.

## Signaux (granularité : un agrégat par `(lead, jour civil UTC)`)

| Signal | Calcul depuis `audit_log` |
|---|---|
| `volume` | somme des PERNR consultés dans la journée (`target_pernrs`, ou repli `lignes=N` de `detail` pour les lignes antérieures à la migration) |
| `heure_connexion` | heure décimale du **premier** événement du jour |
| `vitesse` | `volume ÷ (dernier − premier événement du jour, en minutes, plancher 0.1)` — analogue journalier de `duree_minutes` source |
| `hors_departement` | `perimetre = True` sur au moins un événement du jour |
| `score_nouveaute` | proportion des PERNR du jour absents des 7 jours glissants précédents (fenêtre exclusive du jour) — logique de `reference/calculer_novelty_zscore.py` |

Quand `target_pernrs` **et/ou** `perimetre` manquent sur l'agrégat (lignes
historiques laissées à `NULL` par la migration), le signal correspondant est
**forcé à 0** (jamais inventé) : le modèle tourne alors de fait sur les trois
signaux fiables `volume / heure / vitesse`, et la ligne `ueba_score` est marquée
`signaux_fiables_seulement = True`.

## Migration de `workforce.db`

`Base.metadata.create_all` ne fait pas d'`ALTER` sur une table existante :

```bash
cd backend
./venv/Scripts/python.exe -m ueba.migration_audit_columns
```

Ajoute `audit_log.target_pernrs` (TEXT, JSON) et `audit_log.perimetre` (BOOLEAN),
crée `ueba_score`, et fait une sauvegarde `workforce.db.bak-before-ueba`.
Idempotent. **Déjà exécuté** sur le `workforce.db` de dev.

## Endpoints (`/ueba/*`, ADMIN uniquement)

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/ueba/score` | Score une action fournie explicitement — même schéma d'E/S que le `/score` source. `404` si le lead n'a aucun accès tracé, `422` si le corps est invalide. |
| `GET` | `/ueba/anomalies` | Liste des agrégats `(lead, jour)` déjà scorés (filtres : `suspects_seulement`, `depuis`, `pernr_lead`, `limite`). Alimente le panneau React. |
| `POST` | `/ueba/rescore` | (Re)planifie le scoring de tous les leads pour un jour (défaut : aujourd'hui). Utile pour amorcer `ueba_score` après la migration. |

## Dépendances ajoutées à `requirements.txt`

`scikit-learn==1.7.2`, `scipy==1.15.3`, `numpy==2.2.6`, `pandas==2.3.3`,
`joblib==1.5.3` — versions alignées sur celles ayant produit le `.joblib`.
