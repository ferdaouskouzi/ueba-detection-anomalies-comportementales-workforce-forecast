import type { Lang } from './types'

const dict = {
  // Header
  nav_dashboard: { FR: 'Tableau de bord', EN: 'Dashboard' },
  nav_admin: { FR: 'Administration', EN: 'Administration' },
  role_eum_eud: { FR: 'Lead de département', EN: 'Department lead' },
  role_head: { FR: 'Head of Direction', EN: 'Head of Direction' },
  role_admin: { FR: 'Administrateur', EN: 'Administrator' },
  logout: { FR: 'Déconnexion', EN: 'Log out' },

  // Profil utilisateur
  profile_title: { FR: 'Mon profil', EN: 'My profile' },
  profile_pernr: { FR: 'PERNR', EN: 'PERNR' },
  profile_function: { FR: 'Fonction', EN: 'Function' },
  profile_direction: { FR: 'Direction', EN: 'Direction' },
  profile_department: { FR: 'Département', EN: 'Department' },
  profile_change_pwd_title: { FR: 'Changer de mot de passe', EN: 'Change password' },
  profile_current_pwd: { FR: 'Mot de passe actuel', EN: 'Current password' },
  profile_new_pwd: { FR: 'Nouveau mot de passe', EN: 'New password' },
  profile_confirm_pwd: { FR: 'Confirmer le nouveau mot de passe', EN: 'Confirm new password' },
  profile_pwd_requirements: {
    FR: '12 caractères minimum, avec au moins une majuscule, une minuscule, un chiffre et un symbole.',
    EN: 'At least 12 characters, including one uppercase letter, one lowercase letter, one digit and one symbol.',
  },
  profile_pwd_mismatch: { FR: 'Les mots de passe ne correspondent pas.', EN: 'Passwords do not match.' },
  profile_pwd_success: { FR: 'Mot de passe mis à jour.', EN: 'Password updated.' },
  profile_submit: { FR: 'Valider', EN: 'Confirm' },
  profile_close: { FR: 'Fermer', EN: 'Close' },
  profile_no_department: { FR: '— (pas de département rattaché)', EN: '— (no department attached)' },
  profile_no_direction: { FR: '— (pas de direction rattachée)', EN: '— (no direction attached)' },

  // Forecast
  forecast_eyebrow: { FR: 'Saisie du forecast', EN: 'Forecast entry' },
  forecast_lead: { FR: 'Lead', EN: 'Lead' },
  forecast_sub_prefix: {
    FR: 'Saisissez le forecast à la demi-journée par clic ou clic-glissé. Le code',
    EN: 'Enter the forecast per half-day by click or click-drag. The code',
  },
  forecast_sub_rule: { FR: 'exige un projet actif (règle R1).', EN: 'requires an active project (rule R1).' },
  forecast_select_project_hint: {
    FR: 'Sélectionnez un projet actif pour commencer la saisie.',
    EN: 'Select an active project to start entering data.',
  },
  kpi_effectif_visible: { FR: 'Effectif visible', EN: 'Visible headcount' },
  kpi_prod: { FR: '% Production', EN: '% Production' },
  kpi_bench: { FR: '% Bench', EN: '% Bench' },
  kpi_absence: { FR: '% Absence', EN: '% Absence' },
  prev_week: { FR: '‹ Semaine préc.', EN: '‹ Previous week' },
  next_week: { FR: 'Semaine suiv. ›', EN: 'Next week ›' },
  today: { FR: "Aujourd'hui", EN: 'Today' },
  horizon_1: { FR: 'Horizon : 1 semaine', EN: 'Horizon: 1 week' },
  horizon_2: { FR: 'Horizon : 2 semaines', EN: 'Horizon: 2 weeks' },
  horizon_4: { FR: 'Horizon : 4 semaines', EN: 'Horizon: 4 weeks' },
  choose_active_project: { FR: '— Choisir un projet actif —', EN: '— Choose an active project —' },
  erase: { FR: 'Effacer', EN: 'Clear' },
  ribbon_title: {
    FR: 'Ruban de capacité — répartition par famille et par demi-journée',
    EN: 'Capacity ribbon — breakdown by family and half-day',
  },
  collaborateur_col: { FR: 'Collaborateur', EN: 'Employee' },
  week_of: { FR: 'Semaine du', EN: 'Week of' },
  fill_row: { FR: 'Remplir la ligne', EN: 'Fill row' },
  copy_row: { FR: 'Copier', EN: 'Copy' },
  paste_row: { FR: 'Coller', EN: 'Paste' },
  clear_row: { FR: 'Effacer la ligne', EN: 'Clear row' },
  copy_week: { FR: 'Copier', EN: 'Copy' },
  paste_week: { FR: 'Coller', EN: 'Paste' },
  row_actions: { FR: 'Actions sur la ligne', EN: 'Row actions' },
  ribbon_show_detail: { FR: 'Détail par demi-journée', EN: 'Half-day detail' },
  ribbon_hide_detail: { FR: 'Masquer le détail', EN: 'Hide detail' },
  legend_toggle: { FR: 'Légende des codes', EN: 'Code legend' },
  toast_saved_prefix: { FR: 'Enregistré à', EN: 'Saved at' },
  unpaid_leave_tag: { FR: 'congé sans solde', EN: 'unpaid leave' },
  not_filled: { FR: 'Non renseigné', EN: 'Not filled' },
  alert_select_project: {
    FR: 'Sélectionnez un projet actif avant de saisir du code Production (règle R1).',
    EN: 'Select an active project before entering a Production code (rule R1).',
  },
  dept_not_ready_title: { FR: 'Votre espace n’est pas encore configuré', EN: 'Your workspace is not configured yet' },
  dept_not_ready_body: {
    FR: "Le référentiel de votre département (collaborateurs, projets actifs) n'a pas encore été importé. "
      + 'Contactez votre administrateur pour lancer cet import avant de pouvoir saisir le forecast de votre équipe.',
    EN: "Your department's reference data (employees, active projects) has not been imported yet. "
      + 'Contact your administrator to run this import before you can enter your team\'s forecast.',
  },

  // Dashboard
  dashboard_eyebrow: { FR: 'Tableau de bord de pilotage', EN: 'Management dashboard' },
  all_departments: { FR: 'Tous les départements', EN: 'All departments' },
  all_projects: { FR: 'Tous les projets', EN: 'All projects' },
  all_clients: { FR: 'Tous les clients', EN: 'All clients' },
  period_4w: { FR: '4 dernières semaines', EN: 'Last 4 weeks' },
  period_12m: { FR: '12 derniers mois', EN: 'Last 12 months' },
  period_custom: { FR: 'Personnalisé', EN: 'Custom' },
  export_xlsx: { FR: 'Exporter XLSX', EN: 'Export XLSX' },
  export_pptx: { FR: 'Exporter PPTX', EN: 'Export PPTX' },
  exporting: { FR: 'Export…', EN: 'Exporting…' },
  kpi_effectif: { FR: 'Effectif', EN: 'Headcount' },
  kpi_taux_prod: { FR: 'Taux de production', EN: 'Production rate' },
  kpi_taux_bench: { FR: 'Taux de bench', EN: 'Bench rate' },
  kpi_taux_absence: { FR: "Taux d'absence", EN: 'Absence rate' },
  kpi_etp_total: { FR: 'ETP total engagé', EN: 'Total FTE committed' },
  chart_monthly: {
    FR: 'Évolution mensuelle du taux de production',
    EN: 'Monthly production rate trend',
  },
  chart_etp_project: { FR: 'ETP par projet', EN: 'FTE by project' },
  chart_client_suffix: { FR: 'client', EN: 'client' },
  chart_family: { FR: "Répartition par famille d'activité dans le temps", EN: 'Activity family breakdown over time' },
  chart_dept_compare: { FR: 'Comparatif entre départements — taux de production', EN: 'Department comparison — production rate' },

  // Administration
  admin_eyebrow: { FR: 'Administration', EN: 'Administration' },
  admin_title: { FR: 'Référentiels & gouvernance', EN: 'Reference data & governance' },
  import_employees_title: { FR: 'Import référentiel collaborateurs (.xlsx)', EN: 'Employee reference import (.xlsx)' },
  import_employees_hint: {
    FR: 'PERNR · nom · PERNR du people manager · statut · direction · département',
    EN: 'PERNR · name · people manager PERNR · status · direction · department',
  },
  import_projects_title: { FR: 'Import référentiel projets (.xlsx)', EN: 'Project reference import (.xlsx)' },
  import_projects_hint: { FR: 'code projet · nom du projet · client / account · statut', EN: 'project code · project name · client / account · status' },
  choose_file: { FR: 'Choisir un fichier', EN: 'Choose a file' },
  import_report_title: { FR: "Rapport d'import", EN: 'Import report' },
  accepted_count: { FR: 'accepté(s)', EN: 'accepted' },
  rejected_count: { FR: 'rejeté(s)', EN: 'rejected' },
  import_by_department_title: { FR: 'État par département après import', EN: 'Status by department after import' },
  col_department: { FR: 'Département', EN: 'Department' },
  col_collaborateurs: { FR: 'Collaborateurs', EN: 'Employees' },
  col_ready_status: { FR: 'Prêt pour la saisie', EN: 'Ready for entry' },
  ready_yes: { FR: 'Prêt', EN: 'Ready' },
  ready_no: { FR: 'Pas encore prêt', EN: 'Not ready yet' },
  demo_note: {
    FR: "Maquette de démonstration : la validation s'exécute réellement sur le fichier fourni ; l'upsert en base n'est pas branché dans cet aperçu.",
    EN: 'Demo mockup: validation actually runs on the provided file; the database upsert is not wired in this preview.',
  },
  col_line: { FR: 'Ligne', EN: 'Line' },
  col_status: { FR: 'Statut', EN: 'Status' },
  col_reason: { FR: 'Motif', EN: 'Reason' },
  col_detail: { FR: 'Détail', EN: 'Detail' },
  activity_codes_title: { FR: "Référentiel des codes d'activité (piloté en base)", EN: 'Activity code reference (database-driven)' },
  col_code: { FR: 'Code', EN: 'Code' },
  col_libelle: { FR: 'Libellé', EN: 'Label' },
  col_famille: { FR: 'Famille', EN: 'Family' },
  col_projet: { FR: 'Projet', EN: 'Project' },
  mandatory: { FR: 'Obligatoire', EN: 'Mandatory' },
  forbidden: { FR: 'Interdit', EN: 'Forbidden' },
  iso_check_title: { FR: 'Vérification — lundi de la semaine ISO 8601 n°1', EN: 'Check — Monday of ISO 8601 week 1' },
  col_year: { FR: 'Année', EN: 'Year' },
  col_monday: { FR: 'Lundi calculé', EN: 'Computed Monday' },
  computed_not_hardcoded: { FR: 'calculé, non codé en dur', EN: 'computed, not hard-coded' },
  ref_summary_directions: { FR: 'directions', EN: 'directions' },
  ref_summary_departments: { FR: 'départements', EN: 'departments' },
  ref_summary_employees: { FR: 'collaborateurs', EN: 'employees' },
  ref_summary_active_projects: { FR: 'projets actifs', EN: 'active projects' },
  audit_title: { FR: 'Journal d’audit — écritures sur forecast_entry', EN: 'Audit log — writes to forecast_entry' },
  audit_empty: {
    FR: "Aucune écriture enregistrée pour l'instant. Les modifications de la grille EUM/EUD apparaîtront ici, horodatées.",
    EN: 'No writes recorded yet. Changes to the EUM/EUD grid will appear here, timestamped.',
  },
  audit_loading: { FR: 'Chargement…', EN: 'Loading…' },
  audit_error: { FR: "Impossible de charger le journal d'audit.", EN: 'Could not load the audit log.' },

  // Gestion des comptes — page dédiée « Comptes » (onglet propre, rôle Admin uniquement),
  // cahier des charges §2.2 : seuls les comptes EUM/EUD et Head of Direction, jamais le
  // référentiel employé complet.
  accounts_eyebrow: { FR: 'Comptes', EN: 'Accounts' },
  accounts_section_title: { FR: 'Gestion des comptes', EN: 'Account management' },
  accounts_section_sub: {
    FR: 'Comptes applicatifs EUM/EUD et Head of Direction — pas le référentiel collaborateurs complet.',
    EN: 'EUM/EUD and Head of Direction application accounts — not the full employee reference data.',
  },
  accounts_tab_leads: { FR: 'Leads de département', EN: 'Department leads' },
  accounts_tab_heads: { FR: 'Heads of Direction', EN: 'Heads of Direction' },
  accounts_search_placeholder: { FR: 'Rechercher par nom ou PERNR…', EN: 'Search by name or PERNR…' },
  accounts_loading: { FR: 'Chargement des comptes…', EN: 'Loading accounts…' },
  accounts_error: { FR: 'Impossible de charger les comptes.', EN: 'Could not load accounts.' },
  accounts_empty: { FR: 'Aucun compte ne correspond à cette recherche.', EN: 'No account matches this search.' },
  accounts_status_active: { FR: 'Actif', EN: 'Active' },
  accounts_status_locked: { FR: 'Verrouillé', EN: 'Locked' },
  accounts_no_direction: { FR: 'Direction non rattachée', EN: 'No direction attached' },
  accounts_reset_action_label: { FR: 'Réinitialiser le mot de passe', EN: 'Reset password' },
  accounts_drawer_confirm_title: { FR: 'Réinitialiser ce mot de passe ?', EN: 'Reset this password?' },
  accounts_drawer_confirm_body: {
    FR: 'Un nouveau mot de passe temporaire sera généré pour ce compte. L\'ancien cessera de fonctionner '
      + 'immédiatement, et un changement sera exigé à la prochaine connexion.',
    EN: 'A new temporary password will be generated for this account. The old one stops working '
      + 'immediately, and a change will be required on the next login.',
  },
  accounts_drawer_cancel: { FR: 'Annuler', EN: 'Cancel' },
  accounts_drawer_confirm_submit: { FR: 'Confirmer la réinitialisation', EN: 'Confirm reset' },
  accounts_drawer_pending: { FR: 'Réinitialisation…', EN: 'Resetting…' },
  accounts_drawer_error_prefix: { FR: 'Échec de la réinitialisation : ', EN: 'Reset failed: ' },
  accounts_drawer_revealed_title: { FR: 'Mot de passe temporaire généré', EN: 'Temporary password generated' },
  accounts_drawer_revealed_warning: {
    FR: 'Il ne sera plus jamais réaffiché — transmettez-le dès maintenant, puis fermez ce panneau.',
    EN: 'It will never be shown again — hand it over now, then close this panel.',
  },
  accounts_drawer_next_login_note: {
    FR: "L'utilisateur devra le changer à sa prochaine connexion.",
    EN: 'The user will be required to change it on their next login.',
  },
  accounts_drawer_copy: { FR: 'Copier', EN: 'Copy' },
  accounts_drawer_copied: { FR: 'Copié ✓', EN: 'Copied ✓' },
  accounts_drawer_close: { FR: 'Fermer', EN: 'Close' },

  // Page « Journaux » (rôle ADMIN uniquement) — journal d'audit + panneau UEBA
  logs_eyebrow: { FR: 'Gouvernance', EN: 'Governance' },
  logs_title: { FR: "Journaux d'audit", EN: 'Audit logs' },
  logs_window_prev: { FR: '‹ 7 jours préc.', EN: '‹ Previous 7 days' },
  logs_window_next: { FR: '7 jours suiv. ›', EN: 'Next 7 days ›' },
  status_accepted: { FR: 'accepté', EN: 'accepted' },
  status_rejected: { FR: 'rejeté', EN: 'rejected' },
  report_kind_employees: { FR: 'collaborateurs', EN: 'employees' },
  report_kind_projects: { FR: 'projets', EN: 'projects' },
  motif_pernr_manquant: { FR: 'PERNR manquant', EN: 'Missing PERNR' },
  motif_pernr_doublon: { FR: 'PERNR en doublon', EN: 'Duplicate PERNR' },
  motif_manager_introuvable: { FR: 'PERNR manager introuvable (ligne orpheline)', EN: 'Manager PERNR not found (orphan row)' },
  motif_statut_inconnu: { FR: 'Statut inconnu', EN: 'Unknown status' },
  motif_code_manquant: { FR: 'Code projet manquant', EN: 'Missing project code' },
  motif_code_doublon: { FR: 'Code projet en doublon', EN: 'Duplicate project code' },
  col_when: { FR: 'Quand', EN: 'When' },
  col_who: { FR: 'Qui', EN: 'Who' },
  col_what: { FR: 'Quoi', EN: 'What' },
  col_before: { FR: 'Avant', EN: 'Before' },
  col_after: { FR: 'Après', EN: 'After' },

  // Pré-connexion (sélection de rôle, login, TOTP)
  // Panneau bleu (.login-visual, partagé par RoleSelect et Login), ancré en bas : un titre
  // (grand, gras) suivi de l'accroche login_visual_quote, largeur limitée pour la lecture.
  login_hero_title: {
    FR: 'Piloter les effectifs sans ressaisir un seul tableau Excel.',
    EN: 'Manage headcount without retyping a single Excel sheet.',
  },
  login_visual_quote: {
    FR: "Ici, on ne raconte pas le passé : on prépare l'avenir. Chaque saisie se consolide "
      + "en une vision unique pour toute la direction, chaque donnée bénéficie d'une protection "
      + 'qui ne faiblit jamais.',
    EN: "Here, we don't recount the past — we prepare the future. Every entry consolidates "
      + 'into a single view for the whole direction, and every piece of data carries protection '
      + 'that never wavers.',
  },
  role_select_title: { FR: 'Se connecter en tant que…', EN: 'Log in as…' },
  role_select_sub: {
    FR: "Choisissez votre profil pour accéder à l'écran de connexion correspondant.",
    EN: 'Choose your profile to reach the matching login screen.',
  },
  role_admin_meta: {
    FR: "Référentiels, imports, comptes, journal d'audit",
    EN: 'Reference data, imports, accounts, audit log',
  },
  role_eum_eud_name: { FR: 'Lead de département (EUM / EUD)', EN: 'Department lead (EUM / EUD)' },
  role_eum_eud_meta: {
    FR: 'Saisie et lecture du forecast de votre département',
    EN: "Enter and view your department's forecast",
  },
  role_head_meta: {
    FR: 'Lecture seule du tableau de bord consolidé de votre direction',
    EN: "Read-only view of your direction's consolidated dashboard",
  },
  back_to_role_select: { FR: '← Changer de profil', EN: '← Change profile' },
  login_title_prefix: { FR: 'Connexion — ', EN: 'Login — ' },
  login_app_subtitle: { FR: 'Application interne — Capgemini Engineering', EN: 'Internal application — Capgemini Engineering' },
  field_pernr_label: { FR: 'PERNR', EN: 'PERNR' },
  field_password_label: { FR: 'Mot de passe', EN: 'Password' },
  continue_button: { FR: 'Continuer', EN: 'Continue' },
  verifying_label: { FR: 'Vérification…', EN: 'Verifying…' },
  login_error_generic: { FR: 'Connexion impossible.', EN: 'Unable to connect.' },
  totp_setup_title: { FR: 'Configurer la double authentification', EN: 'Set up two-factor authentication' },
  totp_setup_body: {
    FR: 'Obligatoire à la première connexion. Scannez ce QR code avec Google Authenticator, Microsoft '
      + 'Authenticator ou Authy, puis saisissez le code à 6 chiffres généré.',
    EN: 'Mandatory on first login. Scan this QR code with Google Authenticator, Microsoft Authenticator '
      + 'or Authy, then enter the generated 6-digit code.',
  },
  totp_setup_helper: {
    FR: "Impossible de scanner ? Demandez la clé secrète à l'administrateur pour l'ajouter manuellement.",
    EN: "Can't scan it? Ask your administrator for the secret key to add it manually.",
  },
  totp_code_label: { FR: 'Code à 6 chiffres', EN: '6-digit code' },
  totp_activate_button: { FR: 'Activer et se connecter', EN: 'Activate and sign in' },
  totp_validating_label: { FR: 'Validation…', EN: 'Validating…' },
  restart_link: { FR: '← Recommencer', EN: '← Start over' },
  totp_verify_title: { FR: 'Vérification en deux étapes', EN: 'Two-step verification' },
  totp_verify_body: {
    FR: "Saisissez le code généré par votre application d'authentification.",
    EN: 'Enter the code generated by your authenticator app.',
  },
  totp_connect_button: { FR: 'Se connecter', EN: 'Sign in' },
  totp_connecting_label: { FR: 'Connexion…', EN: 'Signing in…' },
  back_link: { FR: '← Retour', EN: '← Back' },
  totp_error_generic: { FR: 'Vérification impossible.', EN: 'Verification failed.' },
  login_role_mismatch_error: {
    FR: "Ce compte n'a pas ce profil. Reconnectez-vous depuis l'écran correspondant à votre rôle.",
    EN: 'This account does not have that profile. Please sign in again from the screen matching your role.',
  },
  // Issue de secours sur l'écran de changement de mot de passe obligatoire (ForcePasswordChange) —
  // déconnecte proprement plutôt que de laisser l'utilisateur bloqué sans recours.
  force_pwd_cancel: { FR: 'Annuler et se déconnecter', EN: 'Cancel and sign out' },

  // UEBA — panneau de détection d'anomalies (page Administration, rôle Admin uniquement)
  ueba_card_title: { FR: "Détection d'anomalies UEBA — accès en lecture", EN: 'UEBA anomaly detection — read access' },
  ueba_suspect_count_suffix: { FR: 'suspects', EN: 'suspicious' },
  ueba_loading: { FR: 'Chargement…', EN: 'Loading…' },
  ueba_empty: { FR: 'Aucun agrégat scoré pour le moment.', EN: 'No scored aggregate yet.' },
  ueba_error: { FR: 'Impossible de charger les anomalies.', EN: 'Could not load anomalies.' },
  ueba_col_lead: { FR: 'Lead', EN: 'Lead' },
  ueba_col_day: { FR: 'Jour', EN: 'Day' },
  ueba_col_status: { FR: 'Statut', EN: 'Status' },
  ueba_col_score: { FR: 'Score de confiance', EN: 'Confidence score' },
  ueba_col_reason: { FR: "Raison d'alerte", EN: 'Alert reason' },
  ueba_suspect: { FR: 'Suspect', EN: 'Suspicious' },
  ueba_normal: { FR: 'Normal', EN: 'Normal' },
  ueba_partial_signal: { FR: 'Signal partiel', EN: 'Partial signal' },
  ueba_partial_signal_help: {
    FR: "Signal partiel : agrégat scoré sur 3 signaux (volume, horaire, vitesse) faute de données de nouveauté/périmètre — fiabilité moindre que les lignes complètes.",
    EN: 'Partial signal: aggregate scored on 3 signals (volume, time, speed) only, lacking novelty/scope data — less reliable than fully-scored rows.',
  },
  ueba_reason_model: { FR: 'Modèle Isolation Forest', EN: 'Isolation Forest model' },
  ueba_reason_novelty: { FR: 'Nouveauté ciblée', EN: 'Targeted novelty' },
} as const

export type I18nKey = keyof typeof dict

export function t(lang: Lang, key: I18nKey): string {
  return dict[key][lang]
}
