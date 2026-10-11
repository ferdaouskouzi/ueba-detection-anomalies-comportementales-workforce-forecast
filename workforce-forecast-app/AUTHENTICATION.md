# Authentification réelle — Workforce Forecast

Ce document décrit ce qui a été ajouté par rapport à la maquette d'origine, et comment lancer
l'ensemble (backend + frontend) en local.

## Pourquoi ce choix

Le cahier des charges (§4.1) prévoit deux modes d'authentification :
- **Cible** : SSO Microsoft Entra ID (OIDC) — nécessite une app registration Azure AD
  (`client_id` / `client_secret` / `tenant_id`) que seul Capgemini peut créer.
- **À défaut** : compte local avec **PERNR en identifiant**, **mot de passe haché Argon2id**,
  et **double authentification (2FA) obligatoire**.

C'est ce second mode qui a été implémenté, avec une architecture qui permet de brancher
Entra ID plus tard sans réécrire le frontend (le rôle vient de `app_user.role` en base
plutôt que d'un groupe d'annuaire, mais le flux d'appel côté React reste identique).

## Ce qui a changé

### Nouveau : `backend/` (FastAPI + SQLite + Argon2id + TOTP)

```
backend/
  app/
    main.py          → application FastAPI, CORS, routes
    config.py         → lecture du .env (secret JWT, durées, verrouillage...)
    database.py        → session SQLAlchemy
    models.py          → tables direction / department / app_user / audit_log
    schemas.py          → schémas Pydantic des requêtes/réponses
    security.py         → hachage Argon2id, JWT, génération/vérification TOTP + QR
    deps.py              → extraction de l'utilisateur courant depuis le JWT, contrôle de rôle
    seed.py               → peuple la base avec les comptes de démo
  requirements.txt
  .env.example / .env      → configuration (clé JWT, durée de session, CORS...)
  CREDENTIALS_DEMO.md       → identifiants des comptes de démo (généré par seed.py)
```

**Flux d'authentification (2 étapes, jamais court-circuitées) :**

1. `POST /auth/login {pernr, password}`
   - Vérifie le mot de passe (Argon2id). Message d'erreur générique en cas d'échec
     (pas d'énumération de comptes).
   - Verrouille le compte 15 min après 5 échecs consécutifs.
   - Ne renvoie **jamais** de session complète ici : uniquement un `temp_token` de 5 min
     (scope `totp_pending`).
   - Si c'est la première connexion (`totp_confirmed = false`), renvoie aussi un QR code
     (PNG en base64) à scanner avec une app d'authentification.

2. `POST /auth/verify-totp {temp_token, code}`
   - Vérifie le code à 6 chiffres.
   - C'est **seulement à cette étape** qu'un token de session (`access_token`, scope `access`,
     8h de validité) est délivré.

3. `GET /auth/me` (Bearer token) → renvoie l'utilisateur courant. Toute route protégée revérifie
   le token côté serveur — jamais de confiance dans ce que le client affirme (§2.2/§4.1 du CdC).

4. `POST /auth/logout` → journalise la déconnexion (les JWT étant sans état, la révocation
   effective se fait côté client en supprimant le token ; une liste de révocation serait à ajouter
   avant une mise en production réelle).

Toutes les tentatives (succès, échecs, verrouillages, configuration 2FA) sont journalisées dans
`audit_log`, comme l'exige le cahier des charges (§3.2, §4.3).

### Modifié côté frontend

| Fichier | Changement |
|---|---|
| `src/components/Login.tsx` | Entièrement réécrit : formulaire PERNR + mot de passe, puis écran TOTP (QR au premier login, code seul ensuite). L'ancienne liste "cliquer pour se connecter en tant que..." a disparu. |
| `src/App.tsx` | Au chargement, restaure la session via `GET /auth/me` si un token est déjà stocké. `onLogout` appelle désormais `POST /auth/logout` puis supprime le token local. |
| `src/data/users.ts` | Marqué **obsolète** (plus utilisé), conservé seulement pour référence des rôles/scopes de démo. |
| `src/vite-env.d.ts` | **Nouveau** — nécessaire pour typer `import.meta.env.VITE_API_URL`. |

### Nouveau côté frontend

| Fichier | Rôle |
|---|---|
| `src/api/authApi.ts` | Client HTTP vers le backend (`loginStep1`, `verifyTotp`, `fetchMe`, `logout`, `changePassword`). URL configurable via `VITE_API_URL`. |
| `src/auth/session.ts` | Stockage du JWT (`localStorage`) et conversion `BackendUser → AppUser`. |
| `.env.example` / `.env` | `VITE_API_URL=http://localhost:8000` |
| `styles.css` | Ajout des classes `.field`, `.form-error`, `.totp-qr`, `.totp-code-input`, `.link-btn`. |

**Ce qui n'a pas changé** : `ForecastGrid`, `DashboardDirection`, `AdminImport`, les exports
PPTX/XLSX et les données de forecast restent sur les mocks (`mockData.ts`, `seedForecast.ts`) —
seule l'authentification est désormais réelle, comme demandé. Le reste de l'application
(grille de saisie, tableau de bord, imports) reste à connecter à un vrai backend métier dans une
prochaine étape.

## Lancer le tout en local

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # à adapter avant toute mise en production
python -m app.seed              # crée la base + les comptes de démo (une seule fois)
uvicorn app.main:app --reload --port 8000
```

Les identifiants de démo sont dans `backend/CREDENTIALS_DEMO.md` (mot de passe unique :
`Capgemini2026!`). Le backend tourne sur `http://localhost:8000` — doc interactive sur
`http://localhost:8000/docs`.

### 2. Frontend

```bash
cp .env.example .env            # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

Ouvrir l'URL indiquée par Vite (`http://localhost:5173`), se connecter avec un PERNR de
`CREDENTIALS_DEMO.md`. Au premier login, un QR code apparaît : à scanner avec Google
Authenticator / Microsoft Authenticator / Authy, puis saisir le code à 6 chiffres pour
activer la 2FA et entrer dans l'application.

## Avant toute mise en production

- Remplacer `SQLite` par `PostgreSQL` (`DATABASE_URL` dans `.env` — le code SQLAlchemy est déjà
  compatible, il suffit de changer l'URL et d'ajouter `psycopg2-binary`).
- Générer une vraie clé `JWT_SECRET` (`python -c "import secrets; print(secrets.token_hex(32))"`)
  et la sortir du dépôt (variable d'environnement / secret manager).
- Changer tous les mots de passe de démo, ou mieux : supprimer `workforce.db` et relancer
  `seed.py` avec des mots de passe générés aléatoirement et transmis individuellement.
- Ajouter Alembic pour les migrations (prévu au cahier des charges §3.1) plutôt que
  `Base.metadata.create_all`.
- Brancher le SSO Entra ID (OIDC) comme mode d'authentification principal — la structure du
  backend (rôle en base, JWT interne) permet de l'ajouter comme route alternative
  (`/auth/oidc/callback`) sans toucher au frontend au-delà de réactiver le bouton SSO.
- Mettre en place une politique de révocation des JWT (liste noire ou durée de vie plus courte
  + refresh token) et une purge/rotation des tokens TOTP en cas de compromission.
