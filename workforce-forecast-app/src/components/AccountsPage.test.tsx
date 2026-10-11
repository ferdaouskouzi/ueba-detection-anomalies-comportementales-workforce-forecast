import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'
import AccountsPage from './AccountsPage'

// La section « Gestion des comptes » a été sortie de la page Administration pour devenir
// sa propre page (onglet « Comptes », Header.tsx) — même garde de rendu que les autres
// pages réservées à l'ADMIN (LogsPage, AnomaliesPanel) : rien pour tout autre rôle.
vi.mock('../context/ReferenceDataContext', () => ({
  useReferenceData: () => ({
    directions: [], departments: [], employees: [], projects: [], activityCodes: [],
    loading: false, refetchEmployees: async () => {}, refetchProjects: async () => {},
  }),
}))

describe('AccountsPage — visibilité restreinte au rôle ADMIN', () => {
  it('ne rend rien pour un Head of Direction', () => {
    const hod: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    expect(renderToStaticMarkup(<AccountsPage user={hod} lang="FR" />)).toBe('')
  })

  it('ne rend rien pour un lead de département (EUM_EUD)', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead Test', role: 'EUM_EUD', departmentId: 'DEP1' }
    expect(renderToStaticMarkup(<AccountsPage user={lead} lang="FR" />)).toBe('')
  })

  it('rend la page pour un ADMIN : titre et section Gestion des comptes', () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Test', role: 'ADMIN' }
    const html = renderToStaticMarkup(<AccountsPage user={admin} lang="FR" />)
    expect(html).toContain('page-title')
    expect(html).toContain('Gestion des comptes')
    expect(html).toContain('accounts-toolbar')
  })
})
