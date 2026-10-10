import { useState } from 'react'
import type { AppUser, Lang, Role } from '../types'
import Logo from './Logo'
import { ApiError, loginStep1, verifyTotp } from '../api/authApi'
import { mapBackendUser, saveToken } from '../auth/session'
import { t } from '../i18n'

type Step = 'credentials' | 'totp-setup' | 'totp-verify'

const ROLE_TITLE_KEY = {
  ADMIN: 'role_admin',
  EUM_EUD: 'role_eum_eud_name',
  HEAD_OF_DIRECTION: 'role_head',
} as const

export default function Login({
  role,
  lang,
  onBack,
  onLogin,
}: {
  role: Role
  lang: Lang
  onBack: () => void
  onLogin: (u: AppUser) => void
}) {
  const [step, setStep] = useState<Step>('credentials')
  const [pernr, setPernr] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await loginStep1(pernr.trim(), password)
      setTempToken(res.temp_token)
      if (res.needs_totp_setup) {
        setQr(res.qr_code_base64)
        setOtpauthUri(res.otpauth_uri)
        setStep('totp-setup')
      } else {
        setStep('totp-verify')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(lang, 'login_error_generic'))
    } finally {
      setLoading(false)
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // expected_role est revérifié côté serveur, après mot de passe + TOTP et avant toute
      // émission de token (défense en profondeur) — le serveur renvoie 403 "role_mismatch"
      // plutôt qu'un token si le compte n'a pas ce rôle ; aucun contrôle client seul ne
      // suffit, un frontend contourné ou modifié ne doit jamais pouvoir obtenir de session.
      const res = await verifyTotp(tempToken, code.trim(), role)
      saveToken(res.access_token)
      onLogin(mapBackendUser(res.user))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message === 'role_mismatch') {
        setError(t(lang, 'login_role_mismatch_error'))
        setStep('credentials')
        setPassword('')
        setCode('')
      } else {
        setError(err instanceof ApiError ? err.message : t(lang, 'totp_error_generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  function resetToStart() {
    setStep('credentials')
    setPassword('')
    setCode('')
    setError(null)
  }

  return (
    <div className="login-wrap">
      <div className="login-visual">
        <div className="login-visual-text">
          <h2>{t(lang, 'login_hero_title')}</h2>
          <p>{t(lang, 'login_visual_quote')}</p>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <Logo suffix="Workforce Forecast" />

          {step === 'credentials' && (
            <>
              <button type="button" className="link-btn back-link" onClick={onBack}>{t(lang, 'back_to_role_select')}</button>
              <h1>{t(lang, 'login_title_prefix')}{t(lang, ROLE_TITLE_KEY[role])}</h1>
              <p className="sub">{t(lang, 'login_app_subtitle')}</p>

              <form onSubmit={handleCredentialsSubmit}>
                <div className="field">
                  <label htmlFor="pernr">{t(lang, 'field_pernr_label')}</label>
                  <input
                    id="pernr"
                    autoFocus
                    value={pernr}
                    onChange={(e) => setPernr(e.target.value)}
                    placeholder="ex. 0010001"
                    autoComplete="username"
                  />
                </div>
                <div className="field">
                  <label htmlFor="password">{t(lang, 'field_password_label')}</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                {error && <div className="form-error">{error}</div>}
                <button className="btn btn-primary sso-btn" type="submit" disabled={loading || !pernr || !password}>
                  {loading ? t(lang, 'verifying_label') : t(lang, 'continue_button')}
                </button>
              </form>
            </>
          )}

          {step === 'totp-setup' && (
            <>
              <h1>{t(lang, 'totp_setup_title')}</h1>
              <p className="sub">{t(lang, 'totp_setup_body')}</p>
              {qr && (
                <div className="totp-qr">
                  <img src={`data:image/png;base64,${qr}`} alt="QR code TOTP" width={180} height={180} />
                </div>
              )}
              {otpauthUri && (
                <p className="helper-text">{t(lang, 'totp_setup_helper')}</p>
              )}
              <form onSubmit={handleTotpSubmit}>
                <div className="field">
                  <label htmlFor="code">{t(lang, 'totp_code_label')}</label>
                  <input
                    id="code"
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="totp-code-input"
                  />
                </div>
                {error && <div className="form-error">{error}</div>}
                <button className="btn btn-primary sso-btn" type="submit" disabled={loading || code.length !== 6}>
                  {loading ? t(lang, 'totp_validating_label') : t(lang, 'totp_activate_button')}
                </button>
                <button type="button" className="link-btn" onClick={resetToStart}>{t(lang, 'restart_link')}</button>
              </form>
            </>
          )}

          {step === 'totp-verify' && (
            <>
              <h1>{t(lang, 'totp_verify_title')}</h1>
              <p className="sub">{t(lang, 'totp_verify_body')}</p>
              <form onSubmit={handleTotpSubmit}>
                <div className="field">
                  <label htmlFor="code2">{t(lang, 'totp_code_label')}</label>
                  <input
                    id="code2"
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="totp-code-input"
                  />
                </div>
                {error && <div className="form-error">{error}</div>}
                <button className="btn btn-primary sso-btn" type="submit" disabled={loading || code.length !== 6}>
                  {loading ? t(lang, 'totp_connecting_label') : t(lang, 'totp_connect_button')}
                </button>
                <button type="button" className="link-btn" onClick={resetToStart}>{t(lang, 'back_link')}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
