import type { AppUser, Lang } from '../types'
import type { Theme } from '../theme'
import Logo from './Logo'
import { t } from '../i18n'
import { SunIcon, MoonIcon } from './icons/ThemeIcons'

export type ViewKey = 'forecast' | 'dashboard' | 'admin' | 'accounts' | 'logs'

// CDC §2.2 : l'Administrateur Global ne pilote QUE référentiels / imports / comptes /
// journal d'audit. Le tableau de bord de pilotage (§2.6) est réservé au Head of Direction —
// jamais accessible à l'admin, ni par onglet ni autrement (garde aussi côté
// DashboardDirection et côté endpoint /forecast-entries).
export const tabsByRole: Record<AppUser['role'], { key: ViewKey; labelFR: string; labelEN: string }[]> = {
  EUM_EUD: [],
  HEAD_OF_DIRECTION: [{ key: 'dashboard', labelFR: 'Tableau de bord', labelEN: 'Dashboard' }],
  ADMIN: [
    { key: 'admin', labelFR: 'Administration', labelEN: 'Administration' },
    { key: 'accounts', labelFR: 'Comptes', labelEN: 'Accounts' },
    { key: 'logs', labelFR: 'Journaux', labelEN: 'Logs' },
  ],
}

export function initials(name: string) {
  return name
    .split(' ')
    .filter((w) => w[0] === w[0]?.toUpperCase())
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
}

export default function Header({
  user,
  view,
  onChangeView,
  lang,
  onChangeLang,
  theme,
  onChangeTheme,
  onLogout,
  onOpenProfile,
}: {
  user: AppUser
  view: ViewKey
  onChangeView: (v: ViewKey) => void
  lang: Lang
  onChangeLang: (l: Lang) => void
  theme: Theme
  onChangeTheme: (t: Theme) => void
  onLogout: () => void
  onOpenProfile: () => void
}) {
  const tabs = tabsByRole[user.role]
  const roleLabel = user.role === 'EUM_EUD' ? t(lang, 'role_eum_eud') : user.role === 'HEAD_OF_DIRECTION' ? t(lang, 'role_head') : t(lang, 'role_admin')
  return (
    <header className="header">
      <div className="header-left">
        <Logo suffix="Workforce Forecast" />
        <nav className="nav-tabs">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              className={`nav-tab ${view === tb.key ? 'active' : ''}`}
              onClick={() => onChangeView(tb.key)}
            >
              {lang === 'FR' ? tb.labelFR : tb.labelEN}
            </button>
          ))}
        </nav>
      </div>
      <div className="header-right">
        <div className="theme-toggle" role="group" aria-label={lang === 'FR' ? 'Thème' : 'Theme'}>
          <button className={theme === 'light' ? 'active' : ''} onClick={() => onChangeTheme('light')} title="Light" aria-label="Light">
            <SunIcon />
          </button>
          <button className={theme === 'dark' ? 'active' : ''} onClick={() => onChangeTheme('dark')} title="Dark" aria-label="Dark">
            <MoonIcon />
          </button>
        </div>
        <div className="lang-toggle">
          <button className={lang === 'FR' ? 'active' : ''} onClick={() => onChangeLang('FR')}>FR</button>
          <button className={lang === 'EN' ? 'active' : ''} onClick={() => onChangeLang('EN')}>EN</button>
        </div>
        <button className="user-chip" onClick={onOpenProfile}>
          <span className="user-avatar">{initials(user.nom)}</span>
          <span className="user-meta">
            <div className="name">{user.nom}</div>
            <div className="role">{roleLabel}</div>
          </span>
        </button>
        <button className="logout-btn" onClick={onLogout}>{t(lang, 'logout')}</button>
      </div>
    </header>
  )
}
