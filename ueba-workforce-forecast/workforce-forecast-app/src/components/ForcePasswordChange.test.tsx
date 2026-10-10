import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ForcePasswordChange from './ForcePasswordChange'

// Bug corrigé : un utilisateur arrivant sur ce écran obligatoire (must_change_password)
// n'avait aucun moyen d'en sortir sans le compléter — piégé s'il ne pouvait/voulait pas le
// faire tout de suite. `onCancel` (câblé par App.tsx à une déconnexion propre : invalide le
// jeton, renvoie à la sélection de rôle) doit être exposé par un bouton dédié, sans jamais
// permettre de contourner l'obligation elle-même (onCancel ne définit jamais mustChangePassword
// à false — voir App.tsx::handleCancelForcedPasswordChange).

describe('ForcePasswordChange — issue de secours (ne pas piéger l\'utilisateur)', () => {
  it('expose un bouton "Annuler et se déconnecter", distinct du bouton de soumission', () => {
    const html = renderToStaticMarkup(
      <ForcePasswordChange lang="FR" onChanged={() => {}} onCancel={() => {}} />,
    )
    expect(html).toContain('Annuler et se déconnecter')
    expect(html).toContain('Valider et continuer')
  })

  it('le bouton d\'annulation est de type="button" — il ne doit jamais soumettre le formulaire de changement de mot de passe', () => {
    const html = renderToStaticMarkup(
      <ForcePasswordChange lang="FR" onChanged={() => {}} onCancel={() => {}} />,
    )
    const cancelBtnTag = html.match(/<button[^>]*>Annuler et se déconnecter/)
    expect(cancelBtnTag).toBeTruthy()
    expect(cancelBtnTag![0]).toContain('type="button"')
  })

  it('reste disponible en anglais', () => {
    const html = renderToStaticMarkup(
      <ForcePasswordChange lang="EN" onChanged={() => {}} onCancel={() => {}} />,
    )
    expect(html).toContain('Cancel and sign out')
  })

  it('n\'appelle ni onChanged ni onCancel au simple rendu (pas d\'effet de bord)', () => {
    const onChanged = vi.fn()
    const onCancel = vi.fn()
    renderToStaticMarkup(<ForcePasswordChange lang="FR" onChanged={onChanged} onCancel={onCancel} />)
    expect(onChanged).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
