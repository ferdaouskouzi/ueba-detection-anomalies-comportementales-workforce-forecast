import { describe, expect, it } from 'vitest'
import { isoWeek1Monday, selfCheckIsoWeek1, toISODate } from './isoWeek'

// Cahier des charges §2.4 : "Cette règle est implémentée par calcul et jamais par table
// codée en dur ; elle est couverte par un test unitaire sur au moins trois années
// consécutives." §7.1 (critère d'acceptation) : "Le lundi de la semaine 1 est calculé
// correctement pour 2025, 2026 et 2027 (test unitaire)." Jusqu'ici, selfCheckIsoWeek1()
// n'était qu'un affichage sur l'écran admin — jamais une assertion automatisée. Dates de
// référence vérifiées indépendamment de l'implémentation (jour de semaine du 1er janvier) :
// - 2025 : 1er janvier = mercredi -> lundi de semaine 1 = 30/12/2024
// - 2026 : 1er janvier = jeudi (déjà dans la semaine 1) -> lundi de semaine 1 = 29/12/2025
// - 2027 : 1er janvier = vendredi -> lundi de semaine 1 = 04/01/2027 (le 4 janvier tombe déjà un lundi)
describe('isoWeek1Monday — §2.4/§7.1 : lundi de la semaine ISO 1, trois années consécutives', () => {
  it('2025 : le 30/12/2024', () => {
    expect(toISODate(isoWeek1Monday(2025))).toBe('2024-12-30')
  })

  it('2026 : le 29/12/2025 — exemple donné explicitement par le CDC', () => {
    expect(toISODate(isoWeek1Monday(2026))).toBe('2025-12-29')
  })

  it('2027 : le 04/01/2027', () => {
    expect(toISODate(isoWeek1Monday(2027))).toBe('2027-01-04')
  })
})

describe('selfCheckIsoWeek1 — la fonction affichée sur l\'écran admin correspond au calcul réel', () => {
  it('retourne les trois mêmes années et dates que isoWeek1Monday, pas un affichage isolé', () => {
    expect(selfCheckIsoWeek1()).toEqual([
      { year: 2025, monday: '2024-12-30' },
      { year: 2026, monday: '2025-12-29' },
      { year: 2027, monday: '2027-01-04' },
    ])
  })
})
