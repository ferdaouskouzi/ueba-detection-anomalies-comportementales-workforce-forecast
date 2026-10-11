import type { Lang } from '../types'
import { t } from '../i18n'
import type { ForecastAuditEntry } from '../api/auditApi'
import { auditEntryTime, formatAuditDayHeading, groupAuditEntriesByDay } from '../data/auditLog'

// Journal d'audit des écritures sur forecast_entry (page « Journaux », rôle
// ADMIN). Composant purement présentationnel — le chargement (fenêtre récente,
// ?depuis/?jusqua) et la carte englobante restent dans LogsPage. Isolé ici pour
// être testable sans effet asynchrone (renderToStaticMarkup, comme le reste du
// dossier).
//
// `rows === null` => chargement ; `error` non nul => échec ; sinon un bloc par
// jour calendaire de `quand`, en-tête daté au-dessus des lignes de ce jour.
// Réutilise strictement `report-table`, `form-error` et les tokens `var(--cap-*)`.

export default function ForecastAuditLog({
  rows,
  error,
  lang,
}: {
  rows: ForecastAuditEntry[] | null
  error: string | null
  lang: Lang
}) {
  if (error) {
    return <div className="form-error">{error}</div>
  }
  if (rows === null) {
    return <p style={{ fontSize: 13, color: 'var(--cap-grey)' }}>{t(lang, 'audit_loading')}</p>
  }
  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--cap-grey)' }}>{t(lang, 'audit_empty')}</p>
  }
  return (
    <div className="audit-log-groups">
      {groupAuditEntriesByDay(rows).map((group) => (
        <section key={group.day} className="audit-log-day">
          <h3 className="audit-log-day-head">{formatAuditDayHeading(group.day, lang)}</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>{t(lang, 'col_when')}</th>
                <th>{t(lang, 'col_who')}</th>
                <th>{t(lang, 'col_what')}</th>
                <th>{t(lang, 'col_before')}</th>
                <th>{t(lang, 'col_after')}</th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map((a, i) => (
                <tr key={`${a.pernr}-${a.date}-${a.demi}-${a.quand}-${i}`}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{auditEntryTime(a.quand)}</td>
                  <td>{a.qui}</td>
                  {/* "Quoi" synthétisé — collaborateur + créneau, sans colonnes en plus */}
                  <td>{`${a.pernr} · ${a.date} ${a.demi}`}</td>
                  <td>{a.avant}</td>
                  <td>{a.apres}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
