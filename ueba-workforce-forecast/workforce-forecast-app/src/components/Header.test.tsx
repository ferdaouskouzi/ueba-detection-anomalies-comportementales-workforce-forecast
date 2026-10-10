import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'
import Header, { tabsByRole, type ViewKey } from './Header'

// CDC §2.2 : l'Administrateur Global ne voit que « Administration », « Comptes » et « Journaux ».
// Le tableau de bord de pilotage (§2.6) est réservé au Head of Direction.

describe('tabsByRole', () => {
  it("n'expose PAS l'onglet dashboard à l'ADMIN", () => {
    expect(tabsByRole.ADMIN.map((t) => t.key)).toEqual<ViewKey[]>(['admin', 'accounts', 'logs'])
    expect(tabsByRole.ADMIN.some((t) => t.key === 'dashboard')).toBe(false)
  })

  it('garde l\'onglet dashboard pour le Head of Direction', () => {
    expect(tabsByRole.HEAD_OF_DIRECTION.map((t) => t.key)).toEqual<ViewKey[]>(['dashboard'])
  })

  it('ne donne aucun onglet à un EUM/EUD', () => {
    expect(tabsByRole.EUM_EUD).toEqual([])
  })
})

const headerProps = {
  view: 'admin' as ViewKey,
  onChangeView: () => {},
  lang: 'FR' as const,
  onChangeLang: () => {},
  theme: 'light' as const,
  onChangeTheme: () => {},
  onLogout: () => {},
  onOpenProfile: () => {},
}

describe('Header — barre de navigation', () => {
  it("le rendu ADMIN ne contient aucun onglet « Tableau de bord »", () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Global', role: 'ADMIN' }
    const html = renderToStaticMarkup(<Header user={admin} {...headerProps} />)
    expect(html).toContain('Administration')
    expect(html).toContain('Comptes')
    expect(html).toContain('Journaux')
    expect(html).not.toContain('Tableau de bord')
  })

  it('le rendu Head of Direction contient bien l\'onglet « Tableau de bord »', () => {
    const hod: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    const html = renderToStaticMarkup(<Header user={hod} {...headerProps} view={'dashboard' as ViewKey} />)
    expect(html).toContain('Tableau de bord')
  })
})
