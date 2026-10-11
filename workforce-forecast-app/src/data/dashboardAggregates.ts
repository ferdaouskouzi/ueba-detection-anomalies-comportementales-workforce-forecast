import type { ActivityCode, ForecastEntry } from '../types'
import { resolveFamille } from './dashboardKpis'

const MONTH_LABELS_FR = ['Janv', 'Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

function formatMonthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-')
  const idx = Number(m) - 1
  return `${MONTH_LABELS_FR[idx] ?? m} ${y.slice(2)}`
}

// Les mois calendaires couverts par la période active, dans l'ordre — dérivés du même
// ensemble de jours ouvrés que les KPI/ETP (cf. dashboardPeriod.ts), pour que la courbe
// mensuelle reflète exactement le filtre "Période" sélectionné, jamais un historique fixe.
function monthsIn(periodDates: Set<string>): string[] {
  return Array.from(new Set(Array.from(periodDates, (d) => d.slice(0, 7)))).sort()
}

// Évolution mensuelle du taux de production — calculée sur les vraies saisies persistées
// (cahier des charges §2.6), sur la période active. Tous les mois de la période sont
// affichés (0% s'il n'y a aucune saisie), pour un axe identique quel que soit le
// département/projet/client filtrés — seule la période en change l'étendue.
export function monthlyProductionSeries(
  entries: Record<string, ForecastEntry>,
  scopedPernrs: Set<string>,
  activityCodes: ActivityCode[],
  periodDates: Set<string>,
): { mois: string; tauxProduction: number }[] {
  const months = monthsIn(periodDates)
  const buckets: Record<string, { prod: number; total: number }> = {}
  Object.values(entries).forEach((e) => {
    if (!scopedPernrs.has(e.pernr)) return
    if (!periodDates.has(e.date)) return
    const month = e.date.slice(0, 7)
    const bucket = (buckets[month] ??= { prod: 0, total: 0 })
    bucket.total++
    if (resolveFamille(e, activityCodes) === 'Production') bucket.prod++
  })
  return months.map((month) => {
    const b = buckets[month]
    return { mois: formatMonthLabel(month), tauxProduction: b?.total ? Math.round((b.prod / b.total) * 100) : 0 }
  })
}

const FAMILIES = ['Production', 'Bench', 'Management', 'Formation', 'Alternance', 'Absence'] as const

// Répartition par famille d'activité dans le temps — même principe, sur la période active.
// Les 6 familles du référentiel (§2.3) sont toutes représentées : une famille absente d'un
// mois donné vaut 0%, jamais omise — sinon la somme affichée ne correspond plus au total réel.
export function familyOverTimeSeries(
  entries: Record<string, ForecastEntry>,
  scopedPernrs: Set<string>,
  activityCodes: ActivityCode[],
  periodDates: Set<string>,
): { mois: string; Production: number; Bench: number; Management: number; Formation: number; Alternance: number; Absence: number }[] {
  const months = monthsIn(periodDates)
  const buckets: Record<string, { total: number; counts: Record<string, number> }> = {}
  Object.values(entries).forEach((e) => {
    if (!scopedPernrs.has(e.pernr)) return
    if (!periodDates.has(e.date)) return
    const month = e.date.slice(0, 7)
    const bucket = (buckets[month] ??= { total: 0, counts: {} })
    bucket.total++
    const fam = resolveFamille(e, activityCodes)
    if (fam) bucket.counts[fam] = (bucket.counts[fam] ?? 0) + 1
  })
  return months.map((month) => {
    const b = buckets[month]
    const pct = (fam: string) => (b?.total ? Math.round(((b.counts[fam] ?? 0) / b.total) * 100) : 0)
    return {
      mois: formatMonthLabel(month),
      ...Object.fromEntries(FAMILIES.map((f) => [f, pct(f)])) as Record<(typeof FAMILIES)[number], number>,
    }
  })
}
