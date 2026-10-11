import { useState } from 'react'
import type { Lang } from '../types'
import Logo from './Logo'
import { ApiError, changePassword } from '../api/authApi'
import { getToken } from '../auth/session'
import { t } from '../i18n'

export default function ForcePasswordChange({
  lang,
  onChanged,
  onCancel,
}: {
  lang: Lang
  onChanged: () => void
  onCancel: () => void
}) {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPwd !== confirmPwd) {
      setError(t(lang, 'profile_pwd_mismatch'))
      return
    }
    if (newPwd === currentPwd) {
      setError(lang === 'FR'
        ? 'Le nouveau mot de passe doit être différent du mot de passe temporaire.'
        : 'The new password must be different from the temporary password.')
      return
    }
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      await changePassword(token, currentPwd, newPwd)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-visual">
        <div className="login-visual-text">
          <h2>{lang === 'FR' ? 'Un dernier pas avant de commencer.' : 'One last step before you start.'}</h2>
          <p>
            {lang === 'FR'
              ? "Pour votre sécurité, le mot de passe temporaire qui vous a été communiqué doit être remplacé avant tout accès à l'application."
              : 'For your security, the temporary password you were given must be replaced before you can access the application.'}
          </p>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <Logo suffix="Workforce Forecast" />
          <h1>{lang === 'FR' ? 'Définir votre mot de passe' : 'Set your password'}</h1>
          <p className="sub">
            {lang === 'FR'
              ? 'Choisissez un mot de passe personnel, différent du mot de passe temporaire fourni. 12 caractères minimum.'
              : 'Choose a personal password, different from the temporary one you were given. 12 characters minimum.'}
          </p>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="current">{t(lang, 'profile_current_pwd')}</label>
              <input id="current" type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="new">{t(lang, 'profile_new_pwd')}</label>
              <input id="new" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={12} />
              <p className="helper-text">{t(lang, 'profile_pwd_requirements')}</p>
            </div>
            <div className="field">
              <label htmlFor="confirm">{t(lang, 'profile_confirm_pwd')}</label>
              <input id="confirm" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required minLength={12} />
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary sso-btn" type="submit" disabled={loading}>
              {loading ? '…' : (lang === 'FR' ? 'Valider et continuer' : 'Confirm and continue')}
            </button>
            <button type="button" className="link-btn" onClick={onCancel} disabled={loading}>
              {t(lang, 'force_pwd_cancel')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}