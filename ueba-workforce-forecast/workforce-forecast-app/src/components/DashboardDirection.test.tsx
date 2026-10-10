import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'

// Le tableau de bord de pilotage est réservé au Head of Direction (CDC §2.6). Ce
// composant doit se re-garder lui-même — return null pour tout autre rôle, même
// atteint autrement que par l'onglet (déjà retiré de tabsByRole pour l'ADMIN).

vi.mock('../context/ReferenceDataContext', () => ({
  useReferenceData: () => ({
    directions: [{ id: 'D1', nom: 'Ingénierie' }],
    departments: [{ id: 'DEP1', nom: 'Powertrain', directionId: 'D1', leadPernr: 'E1', leadTitre: 'EUM' }],
    employees: [{ pernr: 'E1', nom: 'Lead', managerPernr: null, statut: 'Active', departmentId: 'DEP1', directionId: 'D1' }],
    projects: [],
    activityCodes: [],
    loading: false,
    refetchEmployees: async () => {},
    refetchProjects: async () => {},
  }),
}))

import DashboardDirection from './DashboardDirection'

describe('DashboardDirection — accès réservé au Head of Direction', () => {
  it('ne rend rien pour un ADMIN (accès direct forcé)', () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Global', role: 'ADMIN' }
    expect(renderToStaticMarkup(<DashboardDirection user={admin} lang="FR" />)).toBe('')
  })

  it('ne rend rien pour un lead de département (EUM_EUD)', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead', role: 'EUM_EUD', departmentId: 'DEP1' }
    expect(renderToStaticMarkup(<DashboardDirection user={lead} lang="FR" />)).toBe('')
  })

  it('rend le tableau de bord pour un Head of Direction', () => {
    const hod: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    const html = renderToStaticMarkup(<DashboardDirection user={hod} lang="FR" />)
    expect(html).not.toBe('')
    expect(html).toContain('filters-bar')
    expect(html).toContain('kpi-row')
  })
})
