import type { AppUser, Lang } from '../types'
import { t } from '../i18n'
import AccountsManagement from './AccountsManagement'

// Page « Comptes » — rôle ADMIN uniquement (onglet ajouté dans Header.tsx pour ce seul
// rôle, ET double garde ici : rendu null pour tout autre rôle, même principe que
// LogsPage/AnomaliesPanel). AccountsManagement se re-garde en plus lui-même, et l'endpoint
// backend est déjà derrière require_roles("ADMIN") (routers/accounts.py) — triple garde du
// cahier des charges §2.2/§4.1.
export default function AccountsPage({ user, lang }: { user: AppUser; lang: Lang }) {
  if (user.role !== 'ADMIN') return null

  return (
    <div>
      <div className="page-head">
        <p className="eyebrow">{t(lang, 'accounts_eyebrow')}</p>
        <h1 className="page-title">{t(lang, 'accounts_section_title')}</h1>
        <p className="page-sub">{t(lang, 'accounts_section_sub')}</p>
      </div>

      <AccountsManagement user={user} lang={lang} />
    </div>
  )
}
