import { useEffect, useMemo, useState } from 'react'
import type { AppUser, Lang } from '../types'
import { t } from '../i18n'
import { getToken } from '../auth/session'
import { formatFrDate, toISODate } from '../utils/isoWeek'
import { listForecastAuditEntries, type ForecastAuditEntry } from '../api/auditApi'
import { AUDIT_WINDOW_DAYS, recentAuditWindow, shiftAuditAnchor } from '../data/auditLog'
import ForecastAuditLog from './ForecastAuditLog'
import AnomaliesPanel from './AnomaliesPanel'

// Page « Journaux » — rôle ADMIN uniquement (onglet ajouté dans Header.tsx pour
// ce seul rôle, ET double garde ici : rendu null + aucun appel réseau si le rôle
// n'est pas ADMIN, même principe que AnomaliesPanel et le reste de l'app).
//
// Regroupe ce qui relève de la gouvernance/traçabilité, sorti de la page
// Administration : le journal d'audit des écritures forecast_entry (fenêtre
// récente par défaut, bornée côté serveur via ?depuis/?jusqua — jamais tout
// l'historique), puis le panneau de détection d'anomalies UEBA.

// Plafond de sécurité par fenêtre de 7 jours (une fenêtre courte n'atteint pas
// ce volume en pratique) — évite de rapatrier un historique entier si la borne
// est mal calculée.
const WINDOW_LIMITE = 500

export default function LogsPage({ user, lang }: { user: AppUser; lang: Lang }) {
  const isAdmin = user.role === 'ADMIN'
  const todayISO = toISODate(new Date())

  // `anchor` = dernier jour (inclus) de la fenêtre affichée. Par défaut aujourd'hui
  // -> les AUDIT_WINDOW_DAYS derniers jours.
  const [anchor, setAnchor] = useState(todayISO)
  const [rows, setRows] = useState<ForecastAuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dateRange = useMemo(() => recentAuditWindow(anchor), [anchor])

  useEffect(() => {
    if (!isAdmin) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    setRows(null)
    setError(null)
    listForecastAuditEntries(token, { depuis: dateRange.start, jusqua: dateRange.end, limite: WINDOW_LIMITE })
      .then((data) => { if (!cancelled) setRows(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : t(lang, 'audit_error')) })
    return () => { cancelled = true }
  }, [isAdmin, lang, dateRange.start, dateRange.end])

  if (!isAdmin) return null

  const canGoNext = anchor < todayISO

  return (
    <div>
      <div className="page-head">
        <p className="eyebrow">{t(lang, 'logs_eyebrow')}</p>
        <h1 className="page-title">{t(lang, 'logs_title')}</h1>
      </div>

      <div className="card">
        <div className="card-title">{t(lang, 'audit_title')}</div>
        <div className="toolbar">
          <div className="toolbar-left">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAnchor((a) => shiftAuditAnchor(a, -AUDIT_WINDOW_DAYS, todayISO))}
            >
              {t(lang, 'logs_window_prev')}
            </button>
            <span className="week-range">{formatFrDate(dateRange.start)} – {formatFrDate(dateRange.end)}</span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!canGoNext}
              onClick={() => setAnchor((a) => shiftAuditAnchor(a, AUDIT_WINDOW_DAYS, todayISO))}
            >
              {t(lang, 'logs_window_next')}
            </button>
            {anchor !== todayISO && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAnchor(todayISO)}>{t(lang, 'today')}</button>
            )}
          </div>
        </div>
        <ForecastAuditLog rows={rows} error={error} lang={lang} />
      </div>

      <AnomaliesPanel user={user} lang={lang} />
    </div>
  )
}
