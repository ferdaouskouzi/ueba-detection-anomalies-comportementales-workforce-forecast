import { useEffect, useMemo, useState } from 'react'
import type { AppUser, DemiJournee, ForecastEntry, Lang } from '../types'
import { entryKey } from '../data/seedForecast'
import { useReferenceData } from '../context/ReferenceDataContext'
import Header, { type ViewKey } from './Header'
import ForecastGrid from './ForecastGrid'
import DepartmentNotReady from './DepartmentNotReady'
import DashboardDirection from './DashboardDirection'
import AdminImport from './AdminImport'
import AccountsPage from './AccountsPage'
import LogsPage from './LogsPage'
import ProfilePanel from './ProfilePanel'
import { logout as apiLogout } from '../api/authApi'
import { listForecastEntries, paintForecast } from '../api/forecastApi'
import { clearToken, getToken } from '../auth/session'
import type { Theme } from '../theme'
import { t } from '../i18n'

export default function AuthenticatedApp({
  user,
  lang,
  onChangeLang,
  theme,
  onChangeTheme,
  onLogout,
}: {
  user: AppUser
  lang: Lang
  onChangeLang: (l: Lang) => void
  theme: Theme
  onChangeTheme: (t: Theme) => void
  onLogout: () => void
}) {
  const { loading: referenceLoading } = useReferenceData()
  const [view, setView] = useState<ViewKey>(() =>
    user.role === 'EUM_EUD' ? 'forecast' : user.role === 'HEAD_OF_DIRECTION' ? 'dashboard' : 'admin',
  )
  const [profileOpen, setProfileOpen] = useState(false)
  const [entries, setEntries] = useState<Record<string, ForecastEntry>>({})
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // Charge les saisies réellement persistées en base pour ce périmètre, puis les tient à
  // jour sans rechargement manuel : un lead dont la grille reste ouverte doit voir ses
  // saisies après un focus sans avoir à recharger la page. Aucun push serveur (websocket) —
  // on rejoue un GET /forecast-entries périodiquement, plus immédiatement quand l'onglet
  // reprend le focus (le cas courant : on quitte l'onglet, on saisit ailleurs, on y revient).
  // Non bornée dans le temps (contrairement au dashboard Direction) : ForecastGrid navigue
  // librement d'une semaine à l'autre, y compris hors de la fenêtre par défaut. Seul un
  // EUM_EUD utilise cet état — un HOD/ADMIN ne voit jamais ForecastGrid (cf. Header.tsx),
  // le dashboard Direction charge désormais ses propres saisies, bornées par sa période.
  useEffect(() => {
    const token = getToken()
    if (!token || user.role !== 'EUM_EUD') {
      setEntriesLoading(false)
      return
    }
    let cancelled = false
    function load(showLoading: boolean) {
      if (showLoading) setEntriesLoading(true)
      listForecastEntries(token!)
        .then((backendEntries) => {
          if (cancelled) return
          const next: Record<string, ForecastEntry> = {}
          backendEntries.forEach((e) => { next[entryKey(e.pernr, e.date, e.demiJournee)] = e })
          setEntries(next)
        })
        .catch(() => void 0)
        .finally(() => { if (showLoading) setEntriesLoading(false) })
    }
    load(true)
    const interval = setInterval(() => load(false), 10000)
    function onFocus() { load(false) }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  async function handlePaint(updates: { pernr: string; date: string; demi: DemiJournee }[], code: string, projectCode: string | null) {
    const token = getToken()
    if (!token) return

    let result: Awaited<ReturnType<typeof paintForecast>>
    try {
      result = await paintForecast(token, updates, code, projectCode)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'enregistrement du forecast.")
      return
    }

    setEntries((prev) => {
      const next = { ...prev }
      result.updated.forEach((e) => { next[entryKey(e.pernr, e.date, e.demiJournee)] = e })
      result.deleted.forEach(({ pernr, date, demi }) => { delete next[entryKey(pernr, date, demi)] })
      return next
    })

    const savedAt = new Date()
    setToast(`${t(lang, 'toast_saved_prefix')} ${savedAt.getHours().toString().padStart(2, '0')}:${savedAt.getMinutes().toString().padStart(2, '0')}`)
    setTimeout(() => setToast(null), 2200)
  }

  function handleLogout() {
    const token = getToken()
    if (token) apiLogout(token).catch(() => void 0)
    clearToken()
    onLogout()
  }

  const content = useMemo(() => {
    if (user.role === 'EUM_EUD' && user.departmentReady === false) return <DepartmentNotReady lang={lang} />
    if (view === 'forecast' && user.role === 'EUM_EUD') return <ForecastGrid user={user} entries={entries} onPaint={handlePaint} lang={lang} />
    // Tableau de bord = Head of Direction uniquement (CDC §2.6) : jamais l'admin, même si
    // `view` valait 'dashboard' par un moyen détourné. DashboardDirection se re-garde aussi.
    if (view === 'dashboard' && user.role === 'HEAD_OF_DIRECTION') return <DashboardDirection user={user} lang={lang} />
    // Pages Administration, Comptes et Journaux = seul rôle ADMIN (cf. Header.tsx::tabsByRole) ;
    // chacune se re-garde en plus elle-même sur user.role === 'ADMIN'.
    if (view === 'admin') return <AdminImport user={user} lang={lang} />
    if (view === 'accounts') return <AccountsPage user={user} lang={lang} />
    if (view === 'logs') return <LogsPage user={user} lang={lang} />
    return <ForecastGrid user={user} entries={entries} onPaint={handlePaint} lang={lang} />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, view, entries, lang])

  if (referenceLoading || entriesLoading) {
    return <div className="app-shell" />
  }

  return (
    <div className="app-shell">
      <Header
        user={user}
        view={view}
        onChangeView={setView}
        lang={lang}
        onChangeLang={onChangeLang}
        theme={theme}
        onChangeTheme={onChangeTheme}
        onLogout={handleLogout}
        onOpenProfile={() => setProfileOpen(true)}
      />
      <main className="page">{content}</main>
      {profileOpen && (
        <ProfilePanel user={user} lang={lang} onClose={() => setProfileOpen(false)} />
      )}
      {toast && <div className="toast">{toast}</div>}
      <footer className="footer-note">
        Workforce Forecast v1.0 — Capgemini Engineering
      </footer>
    </div>
  )
}
