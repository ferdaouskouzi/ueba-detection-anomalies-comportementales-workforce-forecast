import { addDays, isoWeek1Monday, jouresOuvres, toISODate } from '../utils/isoWeek'

export function currentMonday(): Date {
  const today = new Date()
  const day = today.getUTCDay() || 7
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - (day - 1))
  return monday
}

export function entryKey(pernr: string, date: string, demi: 'AM' | 'PM') {
  return `${pernr}|${date}|${demi}`
}

// Période de reporting du tableau de bord Head of Direction (cahier des charges §2.6) :
// 4 semaines glissantes se terminant par la semaine courante incluse — pas "les 4 semaines
// précédentes" (qui exclurait la semaine en cours et masquerait toute saisie du jour tant
// qu'elle n'a pas vieilli de 4 semaines).
export function dashboardWindow(): Date[] {
  const monday = currentMonday()
  const start = addDays(monday, -21)
  return jouresOuvres(start, 4)
}

export { isoWeek1Monday }
