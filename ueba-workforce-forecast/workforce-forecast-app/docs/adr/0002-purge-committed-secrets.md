# ADR-0002 — Purge des secrets versionnés (CREDENTIALS_DEMO.md, workforce.db)

**Statut** : Accepté
**Date** : 2026-09-03
**Portée** : `.gitignore`, historique Git complet (toutes branches), `backend/CREDENTIALS_DEMO.md`, `backend/workforce.db`, comptes de démo en base

## Contexte

`backend/CREDENTIALS_DEMO.md` (mots de passe en clair de tous les comptes de démo, y
compris `ADMIN001`) et `backend/workforce.db` (base SQLite complète, hashes Argon2id
inclus) étaient versionnés dans Git depuis le premier commit du dépôt (`26b2f28`,
2026-08-19), sans entrée `.gitignore` correspondante — trouvé lors d'un audit externe
préparatoire à la soutenance de PFA.

Un hash Argon2id est conçu pour résister à une attaque hors-ligne, mais rester exposé
dans un historique Git n'est pas une hypothèse de menace acceptable pour ce projet :
le dépôt peut être partagé, cloné, ou son historique inspecté bien après suppression du
fichier en HEAD (`git log`/`git show` retrouvent tout blob jamais commité, même si le
fichier a été supprimé depuis). Supprimer le fichier sans réécrire l'historique ne
retire rien de réellement exposé.

## Décision

1. **Rotation immédiate** de tous les mots de passe de démo (13 comptes : 8 EUM/EUD,
   4 Head of Direction, 1 ADMIN), via le même mécanisme que le reset admin
   (`generate_strong_password` + `hash_password`, `must_change_password` forcé) — les
   anciens hashes exposés sont désormais sans valeur même s'ils restent lisibles dans
   l'historique.
2. `backend/workforce.db` et `backend/CREDENTIALS_DEMO*.md` ajoutés au `.gitignore` —
   plus jamais recommités.
3. **Réécriture de l'historique Git** (`git filter-repo`) pour retirer ces deux
   fichiers de **tous** les commits passés, sur toutes les branches — pas seulement de
   l'état courant. Sauvegarde complète du dépôt prise avant toute réécriture.
4. Scan `gitleaks` sur l'historique réécrit pour vérifier qu'aucun autre secret n'a été
   manqué.

## Alternative écartée : supprimer le fichier sans réécrire l'historique

Insuffisant par construction : le blob reste récupérable via l'historique Git tant que
la réécriture n'a pas eu lieu. La rotation des mots de passe (point 1) rend
l'information obsolète *quoi qu'il arrive*, mais la réécriture reste nécessaire pour
que le dépôt cesse de porter, en clair, la preuve qu'un tel fichier a existé.

## Conséquences

- Les hashes exposés deviennent inertes dès la rotation (point 1), avant même la
  réécriture d'historique — pas de fenêtre où seule la réécriture protégeait le projet.
- Tout hash de commit **postérieur au premier commit touché** change — dépôt purement
  local (aucun remote configuré au moment de cet ADR), donc aucune coordination de
  force-push nécessaire ; à réévaluer si un remote est ajouté par la suite.
- `backend/workforce.db` doit être recréé localement (`python -m app.seed`) après la
  réécriture — plus aucune base pré-remplie dans le dépôt.
- Faiblesse residuelle identifiée en marge de cet audit, **hors périmètre de cette
  ADR** : `JWT_SECRET` a une valeur de repli codée en dur (`app/config.py:6`,
  `"dev-only-secret-change-me"`) si la variable d'environnement n'est pas définie —
  ce n'est pas un secret réel exposé (placeholder explicitement nommé), mais une
  faiblesse de configuration par défaut qui mériterait un correctif séparé (échec
  explicite au démarrage si non définie, plutôt qu'un repli silencieux).
