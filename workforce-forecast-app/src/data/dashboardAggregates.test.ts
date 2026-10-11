import { describe, expect, it } from 'vitest'
import type { ActivityCode, ForecastEntry } from '../types'
import { familyOverTimeSeries, monthlyProductionSeries } from './dashboardAggregates'

const activityCodes: ActivityCode[] = [
  { code: 'P', libelle: 'Production', famille: 'Production', projetObligatoire: true, couleur: '#000' },
  { code: 'CP', libelle: 'Congé payé', famille: 'Absence', projetObligatoire: false, couleur: '#000' },
]

function entry(pernr: string, date: string, code: string): ForecastEntry {
  return { pernr, date, demiJournee: 'AM', code, projectCode: null, auteur: 'test', horodatage: '2026-01-01T00:00:00Z' }
}

describe('monthlyProductionSeries', () => {
  it("n'affiche que les mois couverts par la période, pas tout l'historique", () => {
    const entries = {
      a: entry('E1', '2026-01-10', 'P'),
      b: entry('E1', '2025-06-10', 'P'), // hors période -> ne doit jamais apparaître
    }
    const period = new Set(['2026-01-10'])
    const result = monthlyProductionSeries(entries, new Set(['E1']), activityCodes, period)
    expect(result).toEqual([{ mois: 'Janv 26', tauxProduction: 100 }])
  })
})

describe('familyOverTimeSeries', () => {
  it('représente les 6 familles, à 0% quand absentes du mois', () => {
    const entries = { a: entry('E1', '2026-01-10', 'P') }
    const period = new Set(['2026-01-10'])
    const result = familyOverTimeSeries(entries, new Set(['E1']), activityCodes, period)
    expect(result).toEqual([{
      mois: 'Janv 26', Production: 100, Bench: 0, Management: 0, Formation: 0, Alternance: 0, Absence: 0,
    }])
  })

  it('compte correctement un motif d\'absence déjà masqué en "Absence" par le serveur pour un Head of Direction (§4.2), au lieu de le sous-compter silencieusement', () => {
    const entries = {
      a: entry('E1', '2026-01-10', 'P'),
      b: entry('E1', '2026-01-11', 'Absence'), // code exact (EL/MAT/SS/CP) déjà remplacé
    }
    const period = new Set(['2026-01-10', '2026-01-11'])
    const result = familyOverTimeSeries(entries, new Set(['E1']), activityCodes, period)
    expect(result).toEqual([{
      mois: 'Janv 26', Production: 50, Bench: 0, Management: 0, Formation: 0, Alternance: 0, Absence: 50,
    }])
  })
})
