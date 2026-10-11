# UEBA pour Workforce Forecast

Détection d'anomalies comportementales (UEBA) sur les accès aux données nominatives d'une application RH.
Projet réalisé pendant un stage chez Capgemini Engineering.

## Le problème

Le contrôle d'accès par rôles dit **qui a le droit** de lire les données, mais pas si l'usage reste **normal**.
Un responsable peut consulter beaucoup de fiches d'un coup, à une heure inhabituelle, ou en dehors de son
département. Ce module repère ce genre de comportement à partir du journal d'audit de l'application.

## Comment ça marche

Pour chaque responsable et chaque jour, on calcule 5 signaux :

| Signal | Description |
|---|---|
| `volume` | nombre de fiches consultées dans la journée |
| `heure_connexion` | heure du premier accès du jour |
| `vitesse` | fiches consultées par minute |
| `hors_departement` | accès à des données hors de son périmètre |
| `novelty` | part des personnes consultées qui ne l'étaient pas sur les 7 jours précédents |

Chaque signal est comparé aux habitudes **du responsable lui-même** (z-score), puis envoyé à un modèle
**Isolation Forest** (non supervisé : pas besoin d'exemples d'attaques). Une règle hybride sur la nouveauté
complète le modèle. Cinq approches ont été comparées : z-score, LOF, One-Class SVM, autoencodeurs et Isolation Forest.

## Contenu du dépôt

```
ueba-research/            Recherche : génération du jeu de données, entraînement,
                          comparaison des approches, API de démonstration
workforce-forecast-app/   Application complète : frontend React + backend FastAPI,
                          avec le module UEBA intégré (backend/ueba/)
```

- Le détail de l'intégration est dans [`workforce-forecast-app/backend/ueba/README.md`](workforce-forecast-app/backend/ueba/README.md).
- L'authentification (JWT, TOTP, rôles) est décrite dans [`workforce-forecast-app/AUTHENTICATION.md`](workforce-forecast-app/AUTHENTICATION.md).

## Points de conception

- **Accès restreint** : les routes `/ueba/*` sont réservées au rôle administrateur.
- **Calcul en arrière-plan** : le scoring ne ralentit jamais la réponse de l'application.
- **RGPD** : seul le verdict est conservé en base. Moyennes et historiques sont recalculés en mémoire.
- **Pas de signal inventé** : si une donnée manque, le signal est mis à 0 et le résultat est marqué comme partiel.

## Lancer le projet

Les données (noms, matricules) sont **entièrement fictives**.

### Backend

```bash
cd workforce-forecast-app/backend
python -m venv venv
source venv/bin/activate          # Windows : venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # puis changer JWT_SECRET
python -m app.seed                # crée la base et les comptes de démo
uvicorn app.main:app --reload --port 8000
```

Le seed génère des mots de passe forts pour les comptes de démo. Ils ne sont pas dans le dépôt.

### Frontend

```bash
cd workforce-forecast-app
cp .env.example .env
npm install
npm run dev
```

### Tests

```bash
cd workforce-forecast-app/backend && pytest
cd workforce-forecast-app && npm test
```

## Technologies

Python, scikit-learn, FastAPI, SQLite, React, TypeScript, Vite, Recharts.
