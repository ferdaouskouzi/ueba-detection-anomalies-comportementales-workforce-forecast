import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ResetPasswordDrawer from './ResetPasswordDrawer'
import type { AccountRow, ResetPanelState } from '../data/accountsAdmin'

const account: AccountRow = {
  id: 1, pernr: '0010001', nom: 'Amine Benali', role: 'EUM_EUD',
  directionId: 'D1', departmentId: 'DEP1', locked: false, mustChangePassword: false,
}

const TEMP_PASSWORD = 'Xk9!mPq2Rv7$'
const noop = () => {}

// Le cahier des charges exige que le mot de passe temporaire ne soit affiché qu'une seule
// fois, jamais réaffiché ensuite — ce composant étant purement présentationnel (piloté par
// `panel`), on prouve l'invariant en le rendant successivement avec les états que produit la
// machine à états de data/accountsAdmin.ts (voir accountsAdmin.test.ts pour la partie logique
// pure : closeResetPanel() ramène toujours l'état à null).
describe('ResetPasswordDrawer — le mot de passe temporaire n\'est affiché qu\'une seule fois', () => {
  it('ne rend rien quand le panneau est fermé', () => {
    const html = renderToStaticMarkup(
      <ResetPasswordDrawer panel={null} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(html).toBe('')
  })

  it('n\'affiche aucun mot de passe pendant la phase de confirmation', () => {
    const panel: ResetPanelState = { account, phase: 'confirm' }
    const html = renderToStaticMarkup(
      <ResetPasswordDrawer panel={panel} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(html).not.toContain(TEMP_PASSWORD)
    expect(html).not.toMatch(/temp-password-value/)
  })

  it('affiche le mot de passe en clair, avec un bouton Copier, pendant la phase revealed', () => {
    const panel: ResetPanelState = { account, phase: 'revealed', temporaryPassword: TEMP_PASSWORD }
    const html = renderToStaticMarkup(
      <ResetPasswordDrawer panel={panel} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(html).toContain(TEMP_PASSWORD)
    expect(html).toContain('Copier')
  })

  it('le mot de passe disparaît une fois le panneau refermé (panel repasse à null)', () => {
    const revealedPanel: ResetPanelState = { account, phase: 'revealed', temporaryPassword: TEMP_PASSWORD }
    const beforeClose = renderToStaticMarkup(
      <ResetPasswordDrawer panel={revealedPanel} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(beforeClose).toContain(TEMP_PASSWORD)

    // AccountsManagement.tsx appelle closeResetPanel() sur clic Fermer / fond / Échap, qui
    // ramène toujours `panel` à null (voir accountsAdmin.test.ts) — on rejoue cet état ici.
    const afterClose = renderToStaticMarkup(
      <ResetPasswordDrawer panel={null} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(afterClose).not.toContain(TEMP_PASSWORD)
    expect(afterClose).toBe('')
  })

  it('rouvrir le panneau pour le même compte repart en confirmation, jamais avec l\'ancien mot de passe', () => {
    const reopened: ResetPanelState = { account, phase: 'confirm' }
    const html = renderToStaticMarkup(
      <ResetPasswordDrawer panel={reopened} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(html).not.toContain(TEMP_PASSWORD)
  })

  it('affiche le message d\'erreur, jamais un mot de passe, en phase error', () => {
    const panel: ResetPanelState = { account, phase: 'error', message: 'Erreur 500' }
    const html = renderToStaticMarkup(
      <ResetPasswordDrawer panel={panel} copied={false} lang="FR" onConfirm={noop} onCopy={noop} onClose={noop} />,
    )
    expect(html).toContain('Erreur 500')
    expect(html).not.toContain(TEMP_PASSWORD)
  })
})
