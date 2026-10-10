import type { Lang } from '../types'
import { t } from '../i18n'
import type { ResetPanelState } from '../data/accountsAdmin'
import { initials } from './Header'

// Panneau latéral de réinitialisation de mot de passe — composant purement présentationnel
// (piloté entièrement par `panel`), isolé d'AccountsManagement pour être testable sans DOM
// réel (renderToStaticMarkup, même principe que ForecastAuditLog.tsx).
//
// Invariant à préserver : le mot de passe temporaire n'existe que dans
// `panel.phase === 'revealed'`. Ce composant ne le stocke nulle part par lui-même — quand
// l'appelant repasse `panel` à `null` (fermeture), il redevient impossible à afficher.
export default function ResetPasswordDrawer({
  panel,
  copied,
  lang,
  onConfirm,
  onCopy,
  onClose,
}: {
  panel: ResetPanelState
  copied: boolean
  lang: Lang
  onConfirm: () => void
  onCopy: () => void
  onClose: () => void
}) {
  if (!panel) return null

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>{t(lang, panel.phase === 'revealed' ? 'accounts_drawer_revealed_title' : 'accounts_drawer_confirm_title')}</h2>
          <button className="drawer-close" onClick={onClose} aria-label={t(lang, 'accounts_drawer_close')}>✕</button>
        </div>

        <div className="drawer-account">
          <span className="account-avatar">{initials(panel.account.nom)}</span>
          <div className="account-info">
            <div className="name">{panel.account.nom}</div>
            <div className="meta">{panel.account.pernr}</div>
          </div>
        </div>

        {(panel.phase === 'confirm' || panel.phase === 'pending') && (
          <>
            <p style={{ fontSize: 13, color: 'var(--cap-ink)', lineHeight: 1.5 }}>{t(lang, 'accounts_drawer_confirm_body')}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-outline btn-sm" onClick={onClose} disabled={panel.phase === 'pending'}>
                {t(lang, 'accounts_drawer_cancel')}
              </button>
              <button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={panel.phase === 'pending'}>
                {panel.phase === 'pending' ? t(lang, 'accounts_drawer_pending') : t(lang, 'accounts_drawer_confirm_submit')}
              </button>
            </div>
          </>
        )}

        {panel.phase === 'error' && (
          <>
            <div className="form-error">{t(lang, 'accounts_drawer_error_prefix')}{panel.message}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={onClose}>{t(lang, 'accounts_drawer_cancel')}</button>
              <button className="btn btn-primary btn-sm" onClick={onConfirm}>{t(lang, 'accounts_drawer_confirm_submit')}</button>
            </div>
          </>
        )}

        {panel.phase === 'revealed' && (
          <>
            <div className="temp-password-box">
              <span className="temp-password-value">{panel.temporaryPassword}</span>
              <button className="btn btn-ghost btn-sm" onClick={onCopy}>
                {copied ? t(lang, 'accounts_drawer_copied') : t(lang, 'accounts_drawer_copy')}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--cap-red)', fontWeight: 600, lineHeight: 1.5 }}>
              {t(lang, 'accounts_drawer_revealed_warning')}
            </p>
            <p className="helper-text" style={{ margin: '4px 0 16px' }}>{t(lang, 'accounts_drawer_next_login_note')}</p>
            <button className="btn btn-primary btn-sm" onClick={onClose}>{t(lang, 'accounts_drawer_close')}</button>
          </>
        )}
      </div>
    </div>
  )
}
