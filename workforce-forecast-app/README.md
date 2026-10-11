# Workforce Forecast — Maquette de démonstration

Prototype interactif réalisé à partir du cahier des charges *Workforce Forecast v1.0* (Capgemini Engineering).
Il illustre l'ergonomie, les règles de gestion et les écrans cibles décrits dans le document, avec des données
fictives, pour préparer la soutenance devant le tuteur.

## Ce que la maquette montre déjà

- **Écran de connexion** avec les 3 profils du cahier des charges (EUM/EUD, Head of Direction, Administrateur).
- **Grille de forecast à la demi-journée** (écran EUM/EUD) : saisie par clic ou clic-glissé, remplissage de
  ligne/colonne entière, sélecteur de projet actif obligatoire pour le code `P` (règle R1), repli/dépli de la
  chaîne de people managers (hiérarchie déduite du PERNR, jamais stockée en arbre), ruban de capacité par famille,
  indicateurs de tête (effectif, % Prod, % Bench, % Absence, demi-journées non renseignées).
- **Tableau de bord Direction** (Head of Direction, lecture seule) : KPI consolidés, évolution mensuelle du taux
  de production sur 12 mois glissants, ETP par projet, répartition par famille dans le temps, comparatif entre
  départements, filtres période/département/client.
- **Exports** : XLSX consolidé (une feuille par axe, PERNR en texte) et **PPTX avec graphiques natifs éditables**
  (et non des images), générés côté client.
- **Écran d'administration** : import réel de fichiers `.xlsx` avec rapport d'acceptation/rejet (PERNR orphelin,
  doublon, statut inconnu), référentiel des codes d'activité, vérification automatique du calcul ISO 8601 du
  lundi de semaine 1 sur 2025/2026/2027, journal d'audit des saisies.

## Ce qui reste volontairement une maquette

Il n'y a pas de backend FastAPI/PostgreSQL branché : les données sont générées en mémoire (voir
`src/data/`) pour permettre une démonstration autonome, sans serveur à déployer. L'architecture cible
(§3 du cahier des charges) reste à implémenter en phase 3 du planning. Le code est organisé pour que la
logique métier (règles de gestion, calcul ISO 8601, structure des référentiels) soit directement réutilisable
lors du branchement à une vraie API.

## Lancer la démonstration

```bash
npm install
npm run dev
```

Puis ouvrir l'URL affichée (en général http://localhost:5173).

Pour montrer l'application sans installer d'outil de développement, un dossier `dist/` déjà généré est fourni :
il suffit d'ouvrir `dist/index.html` dans un navigateur, ou de lancer `npm run preview` après `npm run build`.

## Comptes de démonstration

Sur l'écran de connexion, choisir n'importe quel compte dans la liste (aucun mot de passe requis en maquette) :
- un lead **EUM/EUD** pour saisir le forecast de son département ;
- un **Head of Direction** pour consulter le tableau de bord et exporter ;
- l'**Administrateur** pour les imports et le journal d'audit.

## Pile technique de la maquette

React 18 + TypeScript + Vite, Recharts (graphiques), SheetJS (xlsx) et pptxgenjs (pptx natif éditable) —
cohérent avec le choix cible React/TypeScript/Recharts du §3.1 du cahier des charges.
