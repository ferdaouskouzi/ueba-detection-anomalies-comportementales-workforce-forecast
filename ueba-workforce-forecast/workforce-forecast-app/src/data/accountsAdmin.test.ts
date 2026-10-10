import { describe, expect, it } from 'vitest'
import {
  accountScopeName, closeResetPanel, failResetPanel, filterAccounts, openResetPanel,
  revealTempPassword, splitByRole, startReset, toAccountRow, type AccountRow,
} from './accountsAdmin'
import type { BackendAccount } from '../api/accountsApi'

const lead: AccountRow = {
  id: 1, pernr: '0010001', nom: 'Amine Benali', role: 'EUM_EUD',
  directionId: 'D1', departmentId: 'DEP1', locked: false, mustChangePassword: false,
}
const head: AccountRow = {
  id: 2, pernr: 'HOD0001', nom: 'Nadia — Head of Ingénierie', role: 'HEAD_OF_DIRECTION',
  directionId: 'D1', departmentId: null, locked: true, mustChangePassword: false,
}

describe('toAccountRow', () => {
  it('convertit le shape backend (snake_case) vers le shape frontend (camelCase)', () => {
    const backend: BackendAccount = {
      id: 1, pernr: '0010001', nom: 'Amine Benali', role: 'EUM_EUD',
      direction_id: 'D1', department_id: 'DEP1', is_active: true, locked: false, must_change_password: false,
    }
    expect(toAccountRow(backend)).toEqual(lead)
  })
})

describe('filterAccounts — recherche par nom ou PERNR', () => {
  const accounts = [lead, head]

  it('retourne tout si la recherche est vide', () => {
    expect(filterAccounts(accounts, '')).toEqual(accounts)
    expect(filterAccounts(accounts, '   ')).toEqual(accounts)
  })

  it('filtre par nom, insensible à la casse', () => {
    expect(filterAccounts(accounts, 'amine')).toEqual([lead])
  })

  it('filtre par PERNR, correspondance partielle', () => {
    expect(filterAccounts(accounts, 'HOD')).toEqual([head])
  })

  it('ne renvoie rien si aucune correspondance', () => {
    expect(filterAccounts(accounts, 'inexistant')).toEqual([])
  })
})

describe('splitByRole — deux onglets « Leads de département » / « Heads of Direction »', () => {
  it('sépare correctement les comptes EUM/EUD des Head of Direction', () => {
    const { leads, heads } = splitByRole([lead, head])
    expect(leads).toEqual([lead])
    expect(heads).toEqual([head])
  })

  it('gère une liste vide sans erreur', () => {
    expect(splitByRole([])).toEqual({ leads: [], heads: [] })
  })
})

describe('accountScopeName — département pour un lead, direction pour un Head', () => {
  const directions = [{ id: 'D1', nom: 'Ingénierie Automobile' }]
  const departments = [{ id: 'DEP1', nom: 'Powertrain Systems' }]

  it('résout le département pour un compte EUM_EUD', () => {
    expect(accountScopeName(lead, directions, departments)).toBe('Powertrain Systems')
  })

  it('résout la direction pour un Head of Direction (jamais le département)', () => {
    expect(accountScopeName(head, directions, departments)).toBe('Ingénierie Automobile')
  })

  it('renvoie null si le référentiel ne contient pas encore l\'id rattaché', () => {
    expect(accountScopeName(lead, [], [])).toBeNull()
  })
})

// --------------------------------------------------------------------------------------
// Le mot de passe temporaire ne doit être affiché qu'une seule fois : cette machine à
// états (utilisée par AccountsManagement.tsx) est le seul endroit qui le porte, et fermer
// le panneau (closeResetPanel) le fait disparaître sans recours — aucune autre variable ne
// le conserve, donc rien ne peut le réafficher ensuite.
// --------------------------------------------------------------------------------------
describe('panneau de réinitialisation — le mot de passe temporaire ne survit pas à la fermeture', () => {
  it('openResetPanel démarre en phase confirm, sans mot de passe', () => {
    const state = openResetPanel(lead)
    expect(state).toEqual({ account: lead, phase: 'confirm' })
  })

  it('revealTempPassword porte le mot de passe en clair pendant la phase revealed', () => {
    const confirmed = openResetPanel(lead)
    const revealed = revealTempPassword(confirmed, 'Xk9!mPq2Rv7$')
    expect(revealed).toEqual({ account: lead, phase: 'revealed', temporaryPassword: 'Xk9!mPq2Rv7$' })
  })

  it('closeResetPanel efface tout — le mot de passe ne peut pas être retrouvé après fermeture', () => {
    const confirmed = openResetPanel(lead)
    revealTempPassword(confirmed, 'Xk9!mPq2Rv7$')
    const closed = closeResetPanel()
    expect(closed).toBeNull()
    // Rouvrir un panneau (même pour le même compte) repart de zéro, jamais du dernier
    // mot de passe révélé — openResetPanel ne prend que l'account en entrée.
    const reopened = openResetPanel(lead)
    expect(reopened).toEqual({ account: lead, phase: 'confirm' })
    expect(JSON.stringify(reopened)).not.toContain('Xk9!mPq2Rv7$')
  })

  it('startReset passe en pending sans jamais introduire de mot de passe', () => {
    const pending = startReset(openResetPanel(lead))
    expect(pending).toEqual({ account: lead, phase: 'pending' })
  })

  it('failResetPanel porte un message d\'erreur, jamais de mot de passe', () => {
    const failed = failResetPanel(startReset(openResetPanel(lead)), 'Erreur 500')
    expect(failed).toEqual({ account: lead, phase: 'error', message: 'Erreur 500' })
  })

  it('les transitions sur un panneau déjà fermé (null) restent null', () => {
    expect(startReset(null)).toBeNull()
    expect(revealTempPassword(null, 'x')).toBeNull()
    expect(failResetPanel(null, 'x')).toBeNull()
  })
})
