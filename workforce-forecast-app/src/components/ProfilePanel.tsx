import { useEffect, useState } from 'react'
import type { AppUser, Lang } from '../types'
import { useReferenceData } from '../context/ReferenceDataContext'
import { ApiError, changePassword } from '../api/authApi'
import { getToken } from '../auth/session'
import { t } from '../i18n'

const ROLE_LABEL: Record<AppUser['role'], { FR: string; EN: string }> = {
  EUM_EUD: { FR: 'Lead de département', EN: 'Department lead' },
  HEAD_OF_DIRECTION: { FR: 'Head of Direction', EN: 'Head of Direction' },
  ADMIN: { FR: 'Administrateur', EN: 'Administrator' },
}

export default function ProfilePanel({ user, lang, onClose }: { user: AppUser; lang: Lang; onClose: () => void }) {
  const { directions, departments } = useReferenceData()
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const direction = directions.find((d) => d.id === user.directionId)
  const department = departments.find((d) => d.id === user.departmentId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (newPwd !== confirmPwd) {
      setError(t(lang, 'profile_pwd_mismatch'))
      return
    }
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      await changePassword(token, currentPwd, newPwd)
      setSuccess(true)
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-backdrop" onClick={onClose}>
      <div className="profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <h2>{t(lang, 'profile_title')}</h2>
          <button className="profile-close" onClick={onClose} aria-label={t(lang, 'profile_close')}>✕</button>
        </div>

        <div className="profile-section">
          <div className="profile-row"><span>{t(lang, 'profile_pernr')}</span><strong>{user.pernr ?? '—'}</strong></div>
          <div className="profile-row"><span>{t(lang, 'profile_function')}</span><strong>{ROLE_LABEL[user.role][lang]}</strong></div>
          <div className="profile-row"><span>{t(lang, 'profile_direction')}</span><strong>{direction?.nom ?? t(lang, 'profile_no_direction')}</strong></div>
          <div className="profile-row"><span>{t(lang, 'profile_department')}</span><strong>{department?.nom ?? t(lang, 'profile_no_department')}</strong></div>
        </div>

        {/* Changement de mot de passe volontaire — réservé à l'ADMIN désormais (cahier des
            charges) : EUM/EUD et Head of Direction ne contrôlent plus leur mot de passe
            eux-mêmes, seule une réinitialisation par l'Administrateur (page Administration,
            AccountsManagement.tsx) le fait. Le changement FORCÉ (première connexion / après
            un reset) reste géré ailleurs, par ForcePasswordChange.tsx, hors de ce panneau. */}
        {user.role === 'ADMIN' && (
          <div className="profile-section">
            <div className="card-title">{t(lang, 'profile_change_pwd_title')}</div>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="p-current">{t(lang, 'profile_current_pwd')}</label>
                <input id="p-current" type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="p-new">{t(lang, 'profile_new_pwd')}</label>
                <input id="p-new" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required minLength={12} />
                <p className="helper-text">{t(lang, 'profile_pwd_requirements')}</p>
              </div>
              <div className="field">
                <label htmlFor="p-confirm">{t(lang, 'profile_confirm_pwd')}</label>
                <input id="p-confirm" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required minLength={12} />
              </div>
              {error && <div className="form-error">{error}</div>}
              {success && <div className="form-success">{t(lang, 'profile_pwd_success')}</div>}
              <button className="btn btn-primary sso-btn" type="submit" disabled={loading}>
                {loading ? '…' : t(lang, 'profile_submit')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
