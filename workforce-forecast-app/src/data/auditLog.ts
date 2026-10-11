import type { Lang } from '../types'
import { addDays, toISODate } from '../utils/isoWeek'
import type { ForecastAuditEntry } from '../api/auditApi'

// Logique pure du journal d'audit forecast_entry (page « Journaux », rôle ADMIN) :
//   - fenêtre glissante récente -> bornes ?depuis / ?jusqua envoyées au serveur
//     (jamais un filtrage JS sur un gros lot déjà chargé) ;
//   - regroupement de l'affichage par jour calendaire de `quand` (l'horodatage
//     réel de l'écriture), à ne pas confondre avec `date` (jour du créneau de
//     prévision modifié).
// Isolé ici pour être testable sans DOM, comme data/dashboardPeriod.ts.

export const AUDIT_WINDOW_DAYS = 7

export interface AuditWindow {
  start: string // jour ISO, borne basse INCLUSE (?depuis)
  end: string // jour ISO, borne haute INCLUSE (?jusqua)
}

function atUtcMidnight(dayISO: string): Date {
  return new Date(`${dayISO}T00:00:00Z`)
}

// Fenêtre de `days` jours calendaires se terminant à `anchorISO` (inclus).
// anchor = 2026-08-27, days = 7  ->  { start: 2026-08-21, end: 2026-08-27 }
export function recentAuditWindow(anchorISO: string, days: number = AUDIT_WINDOW_DAYS): AuditWindow {
  return {
    start: toISODate(addDays(atUtcMidnight(anchorISO), -(days - 1))),
    end: anchorISO,
  }
}

// Décale l'ancre de `byDays` jours, sans jamais dépasser `maxAnchorISO`
// (typiquement « aujourd'hui » : la fenêtre ne va pas dans le futur).
export function shiftAuditAnchor(anchorISO: string, byDays: number, maxAnchorISO: string): string {
  const next = toISODate(addDays(atUtcMidnight(anchorISO), byDays))
  return next > maxAnchorISO ? maxAnchorISO : next
}

export interface AuditDayGroup {
  day: string // jour calendaire de `quand` (yyyy-mm-dd)
  entries: ForecastAuditEntry[] // les plus récentes d'abord
}

// Regroupe par jour de `quand` ; jours les plus récents d'abord, et à
// l'intérieur d'un jour, écritures les plus récentes d'abord. Le découpage se
// fait sur la chaîne ISO (`quand.slice(0, 10)`), pas via `new Date(...)` : pas
// de dérive de fuseau, l'heure murale enregistrée par le serveur fait foi.
export function groupAuditEntriesByDay(entries: ForecastAuditEntry[]): AuditDayGroup[] {
  const byDay = new Map<string, ForecastAuditEntry[]>()
  for (const e of entries) {
    const day = e.quand.slice(0, 10)
    const bucket = byDay.get(day)
    if (bucket) bucket.push(e)
    else byDay.set(day, [e])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, es]) => ({
      day,
      entries: [...es].sort((x, y) => (x.quand < y.quand ? 1 : x.quand > y.quand ? -1 : 0)),
    }))
}

// En-tête lisible d'un groupe : « jeudi 27 août 2026 ». Ancré en UTC pour rester
// stable quel que soit le fuseau de la machine (tests inclus).
export function formatAuditDayHeading(dayISO: string, lang: Lang): string {
  return atUtcMidnight(dayISO).toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

// Heure murale « HH:MM » de l'écriture, telle qu'enregistrée (pas de conversion
// de fuseau) — la colonne « Quand » à l'intérieur d'un groupe déjà daté.
export function auditEntryTime(quand: string): string {
  return quand.slice(11, 16)
}
