import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ForecastAuditEntry } from '../api/auditApi'
import ForecastAuditLog from './ForecastAuditLog'

// Journal d'audit de la page « Journaux ». Donnée fournie déjà résolue (le
// chargement récent ?depuis/?jusqua est dans LogsPage). On teste : regroupement
// par jour de `quand`, états vide / chargement / erreur.

const rows: ForecastAuditEntry[] = [
  { quand: '2026-08-24T07:15:00', qui: 'LEAD1', pernr: '0010001', date: '2026-08-21', demi: 'AM', avant: '—', apres: 'P/PRJ-001' },
  { quand: '2026-08-24T07:20:00', qui: 'LEAD1', pernr: '0010002', date: '2026-08-21', demi: 'PM', avant: 'CP', apres: '— (effacement)' },
  { quand: '2026-08-25T10:00:00', qui: 'LEAD2', pernr: '0010003', date: '2026-08-30', demi: 'AM', avant: '—', apres: 'BP' },
]

describe('ForecastAuditLog', () => {
  it('groupe par jour calendaire de `quand`, un en-tête daté par jour, jours récents en premier', () => {
    const html = renderToStaticMarkup(<ForecastAuditLog rows={rows} error={null} lang="FR" />)

    // 2 jours distincts -> 2 sections + 2 tableaux
    expect(html.match(/<section class="audit-log-day">/g)).toHaveLength(2)
    expect(html.match(/report-table/g)).toHaveLength(2)

    // en-têtes datés (français, ancrés UTC)
    expect(html).toContain('25 août 2026')
    expect(html).toContain('24 août 2026')
    // le 25 (plus récent) est rendu avant le 24
    expect(html.indexOf('25 août 2026')).toBeLessThan(html.indexOf('24 août 2026'))

    // "Quoi" synthétisé depuis pernr + date (jour du créneau) + demi
    expect(html).toContain('0010003 · 2026-08-30 AM')
    expect(html).toContain('0010001 · 2026-08-21 AM')

    // colonne "Quand" = heure murale HH:MM (le jour est déjà porté par l'en-tête)
    expect(html).toContain('<td style="font-variant-numeric:tabular-nums">07:15</td>')

    // le jour du 24 contient bien ses 2 écritures
    const jour24 = html.slice(html.indexOf('24 août 2026'))
    expect(jour24.match(/<tbody>[\s\S]*?<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(2)
  })

  it('état vide, sans hypothèse "depuis la connexion"', () => {
    const html = renderToStaticMarkup(<ForecastAuditLog rows={[]} error={null} lang="FR" />)
    expect(html).not.toContain('report-table')
    expect(html).toContain('Aucune écriture enregistrée')
    expect(html).not.toContain('depuis la connexion')
  })

  it('état de chargement tant que rows est null', () => {
    const html = renderToStaticMarkup(<ForecastAuditLog rows={null} error={null} lang="FR" />)
    expect(html).not.toContain('report-table')
    expect(html).toContain('Chargement…')
  })

  it('état d\'erreur et rien d\'autre', () => {
    const html = renderToStaticMarkup(
      <ForecastAuditLog rows={null} error="Impossible de charger le journal d'audit." lang="FR" />,
    )
    expect(html).toContain('form-error')
    expect(html).toContain('Impossible de charger le journal')
    expect(html).not.toContain('report-table')
  })
})
