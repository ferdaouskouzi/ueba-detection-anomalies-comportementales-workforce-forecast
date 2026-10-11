// Calcule le lundi de la semaine ISO 8601 n°1 pour une année donnée.
// Règle : la semaine 1 est celle qui contient le premier jeudi de l'année.
export function isoWeek1Monday(year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4)) // le 4 janvier est toujours en semaine 1
  const dayOfWeek = jan4.getUTCDay() || 7 // lundi=1 ... dimanche=7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1))
  return monday
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function formatFrDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

// Génère les jours ouvrés (lundi-vendredi) à partir d'un lundi de départ, sur N semaines.
export function jouresOuvres(startMonday: Date, weeks: number): Date[] {
  const days: Date[] = []
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 5; d++) {
      days.push(addDays(startMonday, w * 7 + d))
    }
  }
  return days
}

// Jours ouvrés (lundi-vendredi) entre deux dates ISO incluses, sans alignement sur un
// lundi de départ — utilisé pour une période arbitraire (filtre "Personnalisé" du
// dashboard Direction). Pas de calendrier de jours fériés (cf. ADR à trancher).
export function businessDaysBetween(startISO: string, endISO: string): Date[] {
  const start = new Date(`${startISO}T00:00:00Z`)
  const end = new Date(`${endISO}T00:00:00Z`)
  const days: Date[] = []
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return days
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
    const dow = cur.getUTCDay()
    if (dow !== 0 && dow !== 6) days.push(cur)
  }
  return days
}

// Vérification automatique (équivalent du test unitaire du cahier des charges §2.4)
// pour au moins trois années consécutives.
export function selfCheckIsoWeek1(): { year: number; monday: string }[] {
  return [2025, 2026, 2027].map((year) => ({ year, monday: toISODate(isoWeek1Monday(year)) }))
}
