import { businessDaysBetween, formatFrDate, toISODate } from '../utils/isoWeek'
import { dashboardWindow } from './seedForecast'

export type PeriodPreset = '4w' | '12m' | 'custom'

export interface PeriodFilter {
  preset: PeriodPreset
  customStart: string // ISO date, utilisé seulement si preset === 'custom'
  customEnd: string
}

export const DEFAULT_PERIOD: PeriodFilter = { preset: '12m', customStart: '', customEnd: '' }

// 12 mois calendaires glissants, mois courant inclus — même ancrage que le graphique
// d'évolution mensuelle (cahier des charges §2.6), mais exprimé en jours ouvrés pour servir
// aussi de dénominateur ETP/KPI quand ce préréglage est choisi comme période du dashboard.
function last12MonthsDays(): Date[] {
  const today = new Date()
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1))
  return businessDaysBetween(toISODate(start), toISODate(today))
}

// Résout un filtre "Période" en jours ouvrés effectifs — source unique pour tous les KPI,
// l'ETP par projet, le comparatif départements et les deux courbes mensuelles : le filtre
// s'applique à l'ensemble du dashboard, jamais à un seul graphique.
export function resolvePeriodDays(period: PeriodFilter): Date[] {
  if (period.preset === '4w') return dashboardWindow()
  if (period.preset === '12m') return last12MonthsDays()
  if (!period.customStart || !period.customEnd) return []
  return businessDaysBetween(period.customStart, period.customEnd)
}

// Bornes (incluses) de la période active, au format attendu par GET /forecast-entries
// (?start=&end=) — pour que le serveur ne renvoie que les saisies de la fenêtre demandée
// au lieu de tout l'historique filtré ensuite en JS (cahier des charges : le filtrage de
// périmètre ne doit jamais être uniquement côté client). null si la période est vide
// (ex. "Personnalisé" sans dates renseignées) : dans ce cas, ne rien charger.
export function periodDateRange(period: PeriodFilter): { start: string; end: string } | null {
  const days = resolvePeriodDays(period)
  if (days.length === 0) return null
  return { start: toISODate(days[0]), end: toISODate(days[days.length - 1]) }
}

// Libellé humain de la période active — utilisé par l'export PPTX (sous-titre de couverture,
// jamais affiché dans l'UI web où le select porte déjà son propre libellé i18n). Toujours en
// français, comme le reste des exports (cf. exportXlsx.ts/exportPptx.ts, non traduits).
export function periodLabel(period: PeriodFilter): string {
  if (period.preset === '4w') return '4 dernières semaines'
  if (period.preset === '12m') return '12 derniers mois'
  const days = resolvePeriodDays(period)
  if (days.length === 0) return 'Période non définie'
  return `${formatFrDate(toISODate(days[0]))} → ${formatFrDate(toISODate(days[days.length - 1]))}`
}
