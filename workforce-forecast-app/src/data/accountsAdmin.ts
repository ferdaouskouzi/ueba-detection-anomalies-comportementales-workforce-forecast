import type { BackendAccount } from '../api/accountsApi'

// Logique pure de la section « Gestion des comptes » (page Administration) — isolée du
// composant pour rester testable sans DOM (même principe que dashboardKpis.ts / auditLog.ts).

export interface AccountRow {
  id: number
  pernr: string
  nom: string
  role: 'EUM_EUD' | 'HEAD_OF_DIRECTION'
  directionId: string | null
  departmentId: string | null
  locked: boolean
  mustChangePassword: boolean
}

export function toAccountRow(a: BackendAccount): AccountRow {
  return {
    id: a.id, pernr: a.pernr, nom: a.nom, role: a.role as AccountRow['role'],
    directionId: a.direction_id, departmentId: a.department_id,
    locked: a.locked, mustChangePassword: a.must_change_password,
  }
}

// Filtre par nom ou PERNR — insensible à la casse et aux accents mineurs, ni l'un ni l'autre
// n'a besoin d'être renseigné en entier (recherche partielle, cahier des charges : « utile si
// la liste grandit »).
export function filterAccounts(accounts: AccountRow[], query: string): AccountRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return accounts
  return accounts.filter((a) => a.nom.toLowerCase().includes(q) || a.pernr.toLowerCase().includes(q))
}

export function splitByRole(accounts: AccountRow[]): { leads: AccountRow[]; heads: AccountRow[] } {
  return {
    leads: accounts.filter((a) => a.role === 'EUM_EUD'),
    heads: accounts.filter((a) => a.role === 'HEAD_OF_DIRECTION'),
  }
}

// Nom du département (EUM/EUD) ou de la direction (Head of Direction) à afficher sous le
// nom du compte — jamais les deux : le rôle détermine lequel des deux champs est pertinent.
export function accountScopeName(
  account: AccountRow,
  directions: { id: string; nom: string }[],
  departments: { id: string; nom: string }[],
): string | null {
  if (account.role === 'EUM_EUD') {
    return departments.find((d) => d.id === account.departmentId)?.nom ?? null
  }
  return directions.find((d) => d.id === account.directionId)?.nom ?? null
}

// --- Panneau de réinitialisation (drawer latéral) --------------------------------------
// Machine à états minimale : 'confirm' -> 'revealed' (ou 'error'), puis fermeture -> null.
// Le mot de passe temporaire n'existe QUE dans la phase 'revealed' de CET état : fermer le
// panneau (closeResetPanel) le fait disparaître sans recours, aucune autre variable ne le
// conserve — c'est ce qui garantit l'affichage « une seule fois, jamais réaffiché ensuite ».

export type ResetPanelState =
  | { account: AccountRow; phase: 'confirm' }
  | { account: AccountRow; phase: 'pending' }
  | { account: AccountRow; phase: 'revealed'; temporaryPassword: string }
  | { account: AccountRow; phase: 'error'; message: string }
  | null

export function openResetPanel(account: AccountRow): ResetPanelState {
  return { account, phase: 'confirm' }
}

export function startReset(state: ResetPanelState): ResetPanelState {
  if (!state) return state
  return { account: state.account, phase: 'pending' }
}

export function revealTempPassword(state: ResetPanelState, temporaryPassword: string): ResetPanelState {
  if (!state) return state
  return { account: state.account, phase: 'revealed', temporaryPassword }
}

export function failResetPanel(state: ResetPanelState, message: string): ResetPanelState {
  if (!state) return state
  return { account: state.account, phase: 'error', message }
}

export function closeResetPanel(): ResetPanelState {
  return null
}
