import { useEffect, useState } from 'react'
import type { AppUser, Lang } from '../types'
import { t } from '../i18n'
import { getToken } from '../auth/session'
import { listAnomalies, type Anomalie } from '../api/uebaApi'

// Panneau "Détection d'anomalies UEBA" — visible uniquement sur la page « Journaux »
// (rôle ADMIN). Double garde : ce composant n'est monté que dans la branche `view === 'logs'`
// de AuthenticatedApp (via LogsPage), ET il ne rend rien si `user.role !== 'ADMIN'` (défense
// en profondeur, même principe que le contrôle de périmètre rejoué côté serveur).
//
// Réutilise strictement les classes du dashboard : `card`, `card-title`, `report-table`,
// `badge ok|ko|warn`, `form-error`, tokens `var(--cap-*)`.

function formatRaison(raison: string | null, lang: Lang): string {
  if (!raison) return '—'
  const libelles: Record<string, string> = {
    modele_isolation_forest: t(lang, 'ueba_reason_model'),
    nouveaute_cible: t(lang, 'ueba_reason_novelty'),
  }
  return raison
    .split(',')
    .map((code) => libelles[code.trim()] ?? code.trim())
    .join(' · ')
}

export default function AnomaliesPanel({ user, lang }: { user: AppUser; lang: Lang }) {
  const isAdmin = user.role === 'ADMIN'
  const [rows, setRows] = useState<Anomalie[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    listAnomalies(token)
      .then((data) => { if (!cancelled) setRows(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : t(lang, 'ueba_error')) })
    return () => { cancelled = true }
  }, [isAdmin, lang])

  if (!isAdmin) return null

  const suspects = rows?.filter((a) => a.estSuspect).length ?? 0

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">
        {t(lang, 'ueba_card_title')}
        {rows && ` · ${suspects}/${rows.length} ${t(lang, 'ueba_suspect_count_suffix')}`}
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      {!error && rows === null && (
        <p style={{ fontSize: 13, color: 'var(--cap-grey)' }}>{t(lang, 'ueba_loading')}</p>
      )}

      {!error && rows !== null && rows.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--cap-grey)' }}>{t(lang, 'ueba_empty')}</p>
      )}

      {rows !== null && rows.length > 0 && (
        <table className="report-table">
          <thead>
            <tr>
              <th>{t(lang, 'ueba_col_lead')}</th>
              <th>{t(lang, 'ueba_col_day')}</th>
              <th>{t(lang, 'ueba_col_status')}</th>
              <th>{t(lang, 'ueba_col_score')}</th>
              <th>{t(lang, 'ueba_col_reason')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={`${a.pernrLead}-${a.jour}`}>
                <td>
                  {a.nomLead ?? a.pernrLead}
                  {a.nomLead && <span style={{ color: 'var(--cap-grey)' }}> · {a.pernrLead}</span>}
                </td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{a.jour}</td>
                <td>
                  <span className={`badge ${a.estSuspect ? 'ko' : 'ok'}`}>
                    {a.estSuspect ? t(lang, 'ueba_suspect') : t(lang, 'ueba_normal')}
                  </span>
                  {a.signalPartiel && (
                    <span className="badge warn" style={{ marginLeft: 6 }} title={t(lang, 'ueba_partial_signal_help')}>
                      {t(lang, 'ueba_partial_signal')}
                    </span>
                  )}
                </td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{a.scoreConfiance.toFixed(3)}</td>
                <td>{formatRaison(a.raisonAlerte, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
