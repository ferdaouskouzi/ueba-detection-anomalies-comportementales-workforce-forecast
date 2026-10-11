# ADR-0001 — Vérification du rôle attendu après TOTP, avant émission du token

**Statut** : Accepté
**Date** : 2026-08-24
**Portée** : `backend/app/routers/auth.py` (`POST /auth/verify-totp`), `backend/app/schemas.py` (`TotpVerifyRequest`), `src/components/Login.tsx`

## Contexte

L'écran de départ propose trois tuiles (Administrateur, Lead de département, Head of
Direction) qui mènent chacune à un écran de connexion dédié. Le rôle réel d'un compte
n'est cependant connu qu'après authentification complète (mot de passe + TOTP), renvoyé
par le serveur.

Un bug a été identifié : lorsqu'un utilisateur s'authentifiait avec des identifiants
valides mais correspondant à un rôle différent de la tuile choisie (ex. identifiants
d'un Lead saisis sur l'écran "Administrateur"), l'incohérence n'était détectée que côté
client, *après* obtention d'un token de session valide. L'interface affichait un écran
« Profil différent détecté » avec un bouton « Continuer vers mon espace » qui laissait
la connexion aboutir, simplement redirigée vers le bon espace. Un contrôle purement
côté client ne garantit rien si le frontend est contourné, modifié, ou si un appel est
fait directement contre l'API.

## Décision

Le rôle attendu (`expected_role`, correspondant à la tuile choisie) est envoyé au
serveur dans `POST /auth/verify-totp` et comparé au rôle réel du compte (`user.role`)
**après** vérification du mot de passe et du code TOTP, et **avant** toute génération
de token :

- Concordance → flux inchangé, `access_token` émis normalement.
- Incohérence → rejet `403 Forbidden`, `detail: "role_mismatch"`, **aucun token émis**.
  L'événement est journalisé dans `audit_log` sous l'action `LOGIN_ROLE_MISMATCH`
  (PERNR, rôle attendu, rôle réel, IP).

Le frontend (`Login.tsx`) envoie `expected_role` à cette étape et affiche, sur réception
d'un `403 role_mismatch`, le même message qu'auparavant côté client ; l'ancien écran
« Continuer quand même » a été supprimé.

## Alternative écartée : vérifier dès `POST /auth/login`

Rejeter l'incohérence de rôle dès l'étape 1 (juste après le contrôle du mot de passe,
avant le TOTP) a été envisagé mais écarté. `/auth/login` répond aujourd'hui par un
message générique (« Identifiants invalides ») quel que soit le motif d'échec —
PERNR inconnu, mot de passe incorrect, compte désactivé — précisément pour empêcher
l'énumération de comptes. Introduire à cette étape une réponse spécifique au rôle
reviendrait à révéler, à un attaquant qui n'a pas encore franchi la 2FA, l'existence
d'un compte pour un PERNR donné et son rôle réel — une fuite d'information que le
design actuel évite délibérément. Le contrôle est donc repoussé après authentification
complète, seul moment où révéler cette information ne profite plus qu'à un utilisateur
déjà légitimement authentifié.

## Conséquences

- **Défense en profondeur** : le serveur redevient la source de vérité finale, en plus
  du contrôle client existant (qui reste utile pour un retour immédiat en cas d'erreur
  de tuile, sans aller-retour serveur inutile).
- **Traçabilité** : toute tentative de connexion avec un rôle incohérent est visible
  dans `audit_log` (`LOGIN_ROLE_MISMATCH`), au même titre que `LOGIN_FAIL` ou
  `ACCOUNT_LOCKED`.
- **Aucune régression sur l'anti-énumération** : le comportement de `/auth/login`
  (étape 1) est inchangé.
- **Coût** : `expected_role` doit être porté par le frontend depuis la sélection de
  tuile jusqu'à l'appel `/auth/verify-totp` (état déjà disponible dans `Login.tsx`,
  aucun état supplémentaire nécessaire).
- **Tests** : couverture dédiée dans `backend/tests/test_auth.py` (rôle correspondant →
  200 + token ; rôle incohérent → 403 `role_mismatch`, aucun token dans la réponse).
