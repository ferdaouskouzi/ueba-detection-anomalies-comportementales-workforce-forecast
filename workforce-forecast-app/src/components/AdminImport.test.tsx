import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'
import AdminImport from './AdminImport'

// Garde de rendu ajoutée en même temps que la sortie de « Gestion des comptes » vers sa
// propre page (AccountsPage.tsx) — Administration ne conservait jusque-là que la garde par
// onglet (Header.tsx) ; elle se re-garde désormais aussi elle-même, comme les autres pages
// réservées à l'ADMIN (LogsPage, AccountsPage).
vi.mock('../context/ReferenceDataContext', () => ({
  useReferenceData: () => ({
    directions: [], departments: [], employees: [], projects: [], activityCodes: [],
    loading: false, refetchEmployees: async () => {}, refetchProjects: async () => {},
  }),
}))

describe('AdminImport — visibilité restreinte au rôle ADMIN', () => {
  it('ne rend rien pour un Head of Direction', () => {
    const hod: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    expect(renderToStaticMarkup(<AdminImport user={hod} lang="FR" />)).toBe('')
  })

  it('ne rend rien pour un lead de département (EUM_EUD)', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead Test', role: 'EUM_EUD', departmentId: 'DEP1' }
    expect(renderToStaticMarkup(<AdminImport user={lead} lang="FR" />)).toBe('')
  })

  it('rend la page pour un ADMIN : imports collaborateurs et projets, plus de bloc Comptes', () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Test', role: 'ADMIN' }
    const html = renderToStaticMarkup(<AdminImport user={admin} lang="FR" />)
    expect(html).toContain('page-title')
    expect(html).toContain('Import référentiel collaborateurs')
    expect(html).toContain('Import référentiel projets')
    // La section comptes a été déplacée vers sa propre page (AccountsPage.tsx).
    expect(html).not.toContain('Gestion des comptes')
    expect(html).not.toContain('accounts-toolbar')
  })
})
