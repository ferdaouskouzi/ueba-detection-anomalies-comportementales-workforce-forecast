import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'
import AnomaliesPanel from './AnomaliesPanel'

// Garde-fou : le panneau UEBA ne doit apparaître pour AUCUN rôle autre qu'ADMIN,
// même si un jour il était monté ailleurs que dans la page « Journaux »
// (view === 'logs'), son point de montage actuel.
describe('AnomaliesPanel — visibilité restreinte au rôle ADMIN', () => {
  it('ne rend rien pour un Head of Direction', () => {
    const hod: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    expect(renderToStaticMarkup(<AnomaliesPanel user={hod} lang="FR" />)).toBe('')
  })

  it('ne rend rien pour un lead de département (EUM_EUD)', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead Test', role: 'EUM_EUD', departmentId: 'DEP1' }
    expect(renderToStaticMarkup(<AnomaliesPanel user={lead} lang="FR" />)).toBe('')
  })

  it('rend la carte pour un ADMIN', () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Test', role: 'ADMIN' }
    const html = renderToStaticMarkup(<AnomaliesPanel user={admin} lang="FR" />)
    expect(html).toContain('card-title')
    expect(html).toContain('UEBA')
  })
})
