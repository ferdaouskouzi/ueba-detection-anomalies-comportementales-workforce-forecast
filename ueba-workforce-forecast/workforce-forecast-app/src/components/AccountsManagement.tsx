import { useEffect, useState } from 'react'
import type { AppUser, Lang } from '../types'
import { t } from '../i18n'
import { useReferenceData } from '../context/ReferenceDataContext'
import { getToken } from '../auth/session'
import { listAccounts, resetAccountPassword } from '../api/accountsApi'
import {
  accountScopeName, closeResetPanel, failResetPanel, filterAccounts, openResetPanel,
  revealTempPassword, splitByRole, startReset, toAccountRow,
  type AccountRow, type ResetPanelState,
} from '../data/accountsAdmin'
import { initials } from './Header'
import { ResetPasswordIcon } from './icons/ActionIcons'
import ResetPasswordDrawer from './ResetPasswordDrawer'

type Tab = 'leads' | 'heads'

// Contenu de la page dédiée « Comptes » (AccountsPage.tsx) — rôle ADMIN uniquement.
// Triple garde du cahier des charges §2.2/§4.1 : onglet (Header.tsx ne l'expose qu'à
// l'ADMIN), garde de rendu ici (isAdmin, aucun appel réseau sinon — AccountsPage se
// re-garde aussi), et l'endpoint backend lui-même derrière require_roles("ADMIN")
// (routers/accounts.py).
//
// Le mot de passe temporaire ne vit que dans `panel.phase === 'revealed'` (voir
// data/accountsAdmin.ts) : fermer le panneau retombe sur `null`, rien ne le conserve
// ailleurs — il ne peut donc jamais être réaffiché après coup.
export default function AccountsManagement({ user, lang }: { user: AppUser; lang: Lang }) {
  const { directions, departments } = useReferenceData()
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('leads')
  const [panel, setPanel] = useState<ResetPanelState>(null)
  const [copied, setCopied] = useState(false)

  const isAdmin = user.role === 'ADMIN'

  useEffect(() => {
    if (!isAdmin) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    listAccounts(token)
      .then((rows) => { if (!cancelled) setAccounts(rows.map(toAccountRow)) })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : t(lang, 'accounts_error')) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  if (!isAdmin) return null

  const { leads, heads } = splitByRole(accounts ?? [])
  const visible = filterAccounts(tab === 'leads' ? leads : heads, query)

  function openPanel(account: AccountRow) {
    setCopied(false)
    setPanel(openResetPanel(account))
  }

  function closePanel() {
    setPanel(closeResetPanel())
    setCopied(false)
  }

  async function confirmReset() {
    if (!panel) return
    const target = panel.account
    setPanel((prev) => startReset(prev))
    const token = getToken()
    if (!token) return
    try {
      const { temporary_password } = await resetAccountPassword(token, target.pernr)
      setPanel((prev) => revealTempPassword(prev, temporary_password))
      setAccounts((prev) => prev?.map((a) => (
        a.pernr === target.pernr ? { ...a, locked: false, mustChangePassword: true } : a
      )) ?? prev)
    } catch (err) {
      setPanel((prev) => failResetPanel(prev, err instanceof Error ? err.message : t(lang, 'accounts_error')))
    }
  }

  async function copyTempPassword() {
    if (!panel || panel.phase !== 'revealed') return
    try {
      await navigator.clipboard.writeText(panel.temporaryPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* Presse-papiers indisponible (contexte non sécurisé, permission refusée) — le mot de
         passe reste visible et sélectionnable manuellement, rien d'autre à faire ici. */
    }
  }

  return (
    <div className="card">
      <div className="accounts-toolbar">
        <div className="accounts-subtabs">
          <button className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}>
            {t(lang, 'accounts_tab_leads')} · {leads.length}
          </button>
          <button className={tab === 'heads' ? 'active' : ''} onClick={() => setTab('heads')}>
            {t(lang, 'accounts_tab_heads')} · {heads.length}
          </button>
        </div>
        <div className="accounts-search">
          <SearchIcon />
          <input
            type="search"
            placeholder={t(lang, 'accounts_search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loadError && <div className="form-error">{loadError}</div>}
      {!loadError && accounts === null && <p style={{ fontSize: 13, color: 'var(--cap-grey)' }}>{t(lang, 'accounts_loading')}</p>}
      {!loadError && accounts !== null && visible.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--cap-grey)' }}>{t(lang, 'accounts_empty')}</p>
      )}

      {!loadError && accounts !== null && visible.length > 0 && (
        <div className="accounts-list">
          {visible.map((a) => (
            <div className="account-row" key={a.id}>
              <span className="account-avatar">{initials(a.nom)}</span>
              <div className="account-info">
                <div className="name">{a.nom}</div>
                <div className="meta">{a.pernr} · {accountScopeName(a, directions, departments) ?? t(lang, 'accounts_no_direction')}</div>
              </div>
              <span className={`badge ${a.locked ? 'ko' : 'ok'}`}>
                {a.locked ? t(lang, 'accounts_status_locked') : t(lang, 'accounts_status_active')}
              </span>
              <button
                className="account-reset-btn"
                title={t(lang, 'accounts_reset_action_label')}
                aria-label={`${t(lang, 'accounts_reset_action_label')} — ${a.nom}`}
                onClick={() => openPanel(a)}
              >
                <ResetPasswordIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      <ResetPasswordDrawer
        panel={panel}
        copied={copied}
        lang={lang}
        onConfirm={confirmReset}
        onCopy={copyTempPassword}
        onClose={closePanel}
      />
    </div>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}
