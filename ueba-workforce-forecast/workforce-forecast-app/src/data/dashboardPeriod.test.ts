import { describe, expect, it } from 'vitest'
import { toISODate } from '../utils/isoWeek'
import { periodDateRange, periodLabel, resolvePeriodDays } from './dashboardPeriod'

function isBusinessDay(d: Date) {
  const dow = d.getUTCDay()
  return dow !== 0 && dow !== 6
}

describe('resolvePeriodDays', () => {
  it('4w : 4 semaines de jours ouvrés (20 jours), semaine courante incluse', () => {
    const days = resolvePeriodDays({ preset: '4w', customStart: '', customEnd: '' })
    expect(days).toHaveLength(20)
    expect(days.every(isBusinessDay)).toBe(true)
  })

  it('12m : couvre le mois courant et les 11 précédents, jamais au-delà d’aujourd’hui', () => {
    const days = resolvePeriodDays({ preset: '12m', customStart: '', customEnd: '' })
    const today = toISODate(new Date())
    expect(days.length).toBeGreaterThan(200) // ~12 mois de jours ouvrés
    expect(days.every(isBusinessDay)).toBe(true)
    expect(toISODate(days[days.length - 1]) <= today).toBe(true)
  })

  it('custom : jours ouvrés entre deux dates incluses, week-ends exclus', () => {
    // 2026-01-05 (lundi) -> 2026-01-11 (dimanche) : 5 jours ouvrés attendus
    const days = resolvePeriodDays({ preset: 'custom', customStart: '2026-01-05', customEnd: '2026-01-11' })
    expect(days.map(toISODate)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'])
  })

  it('custom sans dates renseignées : période vide, pas une erreur', () => {
    expect(resolvePeriodDays({ preset: 'custom', customStart: '', customEnd: '' })).toEqual([])
  })
})

describe('periodDateRange', () => {
  it('custom : bornes = premier et dernier jour ouvré, pour ?start=&end= côté serveur', () => {
    expect(periodDateRange({ preset: 'custom', customStart: '2026-01-05', customEnd: '2026-01-11' }))
      .toEqual({ start: '2026-01-05', end: '2026-01-09' })
  })

  it('custom sans dates renseignées : null, pour ne rien charger plutôt que tout charger', () => {
    expect(periodDateRange({ preset: 'custom', customStart: '', customEnd: '' })).toBeNull()
  })
})

// Sous-titre de la slide de couverture PPTX (exportPptx.ts) — toujours en français, comme le
// reste des exports.
describe('periodLabel', () => {
  it('4w', () => {
    expect(periodLabel({ preset: '4w', customStart: '', customEnd: '' })).toBe('4 dernières semaines')
  })

  it('12m', () => {
    expect(periodLabel({ preset: '12m', customStart: '', customEnd: '' })).toBe('12 derniers mois')
  })

  it('custom : plage jj/mm/aa → jj/mm/aa', () => {
    expect(periodLabel({ preset: 'custom', customStart: '2026-01-05', customEnd: '2026-01-11' }))
      .toBe('05/01/26 → 09/01/26') // bornée aux jours ouvrés, comme resolvePeriodDays
  })

  it('custom sans dates renseignées : libellé explicite, jamais une chaîne vide', () => {
    expect(periodLabel({ preset: 'custom', customStart: '', customEnd: '' })).toBe('Période non définie')
  })
})
