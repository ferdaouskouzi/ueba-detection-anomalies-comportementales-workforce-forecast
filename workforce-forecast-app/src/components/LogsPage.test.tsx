import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'
import LogsPage from './LogsPage'

// Garde-fou : la page « Journaux » (journal d'audit + panneau UEBA) n'apparaît
// pour AUCUN rôle autre qu'ADMIN — ni la page, ni donc l'appel réseau, l'effet
// de chargement étant gardé par le même `isAdmin` que le rendu.
// La logique de fenêtre glissante (défaut 7 jours, prev/next borné au présent)
// est testée unitairement dans data/auditLog.test.ts (recentAuditWindow /
// shiftAuditAnchor) — pas de harnais DOM interactif dans ce projet.

describe('LogsPage — visibilité restreinte au rôle ADMIN', () => {
  it('ne rend rien pour un Head of Direction', () => {
    const hod: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    expect(renderToStaticMarkup(<LogsPage user={hod} lang="FR" />)).toBe('')
  })

  it('ne rend rien pour un lead de département (EUM_EUD)', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead Test', role: 'EUM_EUD', departmentId: 'DEP1' }
    expect(renderToStaticMarkup(<LogsPage user={lead} lang="FR" />)).toBe('')
  })

  it('rend la page pour un ADMIN : titre, contrôle de plage, panneau UEBA', () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Test', role: 'ADMIN' }
    const html = renderToStaticMarkup(<LogsPage user={admin} lang="FR" />)

    expect(html).toContain('Journaux d') // "Journaux d'audit", apostrophe échappée dans le markup
    expect(html).toContain('page-title')
    // contrôle de plage récente
    expect(html).toContain('toolbar')
    expect(html).toContain('week-range')
    expect(html).toContain('7 jours préc.')
    expect(html).toContain('7 jours suiv.')
    // journal en cours de chargement (l'effet ne tourne pas en rendu statique)
    expect(html).toContain('Chargement…')
    // panneau UEBA déplacé en bas de cette page
    expect(html).toContain('UEBA')
  })
})
