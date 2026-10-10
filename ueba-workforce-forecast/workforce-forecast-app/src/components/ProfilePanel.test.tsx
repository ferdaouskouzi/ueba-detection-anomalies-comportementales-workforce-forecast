import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser } from '../types'
import { ReferenceDataProvider } from '../context/ReferenceDataContext'
import ProfilePanel from './ProfilePanel'

// Le changement de mot de passe volontaire (« Changer de mot de passe ») n'est plus ouvert
// qu'à l'ADMIN — EUM/EUD et Head of Direction n'ont plus que le changement FORCÉ, géré à part
// par ForcePasswordChange.tsx, jamais depuis ce panneau. Voir aussi le garde-fou backend
// équivalent dans test_change_password.py (POST /auth/change-password, 403 hors ADMIN une
// fois must_change_password déjà à False).

function renderPanel(user: AppUser) {
  return renderToStaticMarkup(
    <ReferenceDataProvider>
      <ProfilePanel user={user} lang="FR" onClose={() => {}} />
    </ReferenceDataProvider>,
  )
}

describe('ProfilePanel — changement de mot de passe volontaire réservé à l\'ADMIN', () => {
  it('affiche le formulaire de changement de mot de passe pour un ADMIN', () => {
    const admin: AppUser = { id: 'a1', nom: 'Admin Global', role: 'ADMIN' }
    const html = renderPanel(admin)
    expect(html).toContain('Changer de mot de passe')
    expect(html).toContain('Mot de passe actuel')
  })

  it('masque le formulaire pour un lead EUM/EUD', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead Test', role: 'EUM_EUD', departmentId: 'DEP1' }
    const html = renderPanel(lead)
    expect(html).not.toContain('Changer de mot de passe')
    expect(html).not.toContain('Mot de passe actuel')
  })

  it('masque le formulaire pour un Head of Direction', () => {
    const head: AppUser = { id: 'h1', nom: 'Head Test', role: 'HEAD_OF_DIRECTION', directionId: 'D1' }
    const html = renderPanel(head)
    expect(html).not.toContain('Changer de mot de passe')
    expect(html).not.toContain('Mot de passe actuel')
  })

  it('garde l\'affichage des informations de profil pour tous les rôles (pas seulement le mot de passe qui disparaît)', () => {
    const lead: AppUser = { id: 'l1', nom: 'Lead Test', role: 'EUM_EUD', pernr: '0010001', departmentId: 'DEP1' }
    const html = renderPanel(lead)
    expect(html).toContain('0010001')
  })
})
