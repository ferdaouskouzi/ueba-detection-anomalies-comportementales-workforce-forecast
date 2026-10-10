import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppUser, ForecastEntry } from '../types'
import { entryKey, currentMonday } from '../data/seedForecast'
import { toISODate } from '../utils/isoWeek'
import { FAMILY_ORDER } from '../constants/families'
import ForecastGrid from './ForecastGrid'

// ForecastGrid ne reçoit normalement jamais un code déjà masqué en "Absence" (seul un Head
// of Direction, qui ne monte jamais ce composant, cf. §4.2) — mais lignes 238/274/522
// faisaient le même lookup direct activityCodes.find(...) que celui qui sous-comptait déjà
// silencieusement le taux d'absence du dashboard Direction. Même défense ici, par cohérence.
vi.mock('../context/ReferenceDataContext', () => ({
  useReferenceData: () => ({
    directions: [],
    departments: [{ id: 'DEP1', nom: 'Powertrain Systems', directionId: 'DIR1', leadPernr: 'E1', leadTitre: 'EUM' }],
    employees: [{ pernr: 'E1', nom: 'Lead Test', managerPernr: null, statut: 'Active', departmentId: 'DEP1' }],
    projects: [],
    activityCodes: [{ code: 'P', libelle: 'Production', famille: 'Production', projetObligatoire: true, couleur: '#0070AD' }],
    loading: false,
    refetchEmployees: async () => {},
    refetchProjects: async () => {},
  }),
}))

const user: AppUser = { id: 'u1', nom: 'Lead Test', role: 'EUM_EUD', departmentId: 'DEP1', pernr: 'E1' }

describe('ForecastGrid — code déjà masqué "Absence" (§4.2), même défense que dashboardKpis/dashboardAggregates', () => {
  it('classe l\'entrée en famille Absence dans le KPI d\'en-tête et le ruban de capacité, et ne rend pas la cellule comme "non renseigné"', () => {
    const dateISO = toISODate(currentMonday())
    const entries: Record<string, ForecastEntry> = {
      [entryKey('E1', dateISO, 'AM')]: {
        pernr: 'E1', date: dateISO, demiJournee: 'AM', code: 'Absence', projectCode: null, auteur: 'test', horodatage: '2026-01-01T00:00:00Z',
      },
    }

    const html = renderToStaticMarkup(<ForecastGrid user={user} entries={entries} onPaint={vi.fn()} lang="FR" />)

    // KPI d'en-tête : effectif / %Prod / %Bench / %Absence / non-renseigné, dans cet ordre.
    // 1 collaborateur * 10 jours (horizon 2 semaines) * 2 demi-journées = 20 créneaux, 1 seul
    // marqué "Absence" -> 5 %. Sans la correction, ce créneau est invisible -> 0 %.
    const infoValues = [...html.matchAll(/class="info-bar-value">([^<]*)</g)].map((m) => m[1])
    expect(infoValues[3]).toBe('5%')

    // Ruban de capacité : même dénominateur (20 créneaux), même résultat attendu pour Absence.
    const ribbonPcts = [...html.matchAll(/class="ribbon-family-pct">([^<]*)</g)].map((m) => m[1])
    expect(ribbonPcts[FAMILY_ORDER.indexOf('Absence')]).toBe('5%')

    // Cellule de grille : le repli resolveActivityCode() doit s'appliquer — infobulle
    // "Masqué" et fond coloré — au lieu de retomber sur le style d'une case réellement vide.
    const cellTag = html.match(new RegExp(`<td id="fg-cell-E1-${dateISO}-AM"[^>]*>`))
    expect(cellTag).toBeTruthy()
    expect(cellTag![0]).toContain('title="Masqué"')
    expect(cellTag![0]).toContain('style="background')
    expect(cellTag![0]).not.toContain('title="Non renseigné"')
  })

  it('un code réellement inconnu du référentiel (anomalie, sans rapport avec le masquage RGPD) est rendu différemment du code masqué "Absence"', () => {
    const dateISO = toISODate(currentMonday())
    const entries: Record<string, ForecastEntry> = {
      [entryKey('E1', dateISO, 'AM')]: {
        pernr: 'E1', date: dateISO, demiJournee: 'AM', code: 'ZZZ_INCONNU', projectCode: null, auteur: 'test', horodatage: '2026-01-01T00:00:00Z',
      },
    }

    const html = renderToStaticMarkup(<ForecastGrid user={user} entries={entries} onPaint={vi.fn()} lang="FR" />)
    const cellTag = html.match(new RegExp(`<td id="fg-cell-E1-${dateISO}-AM"[^>]*>`))
    expect(cellTag).toBeTruthy()

    // Infobulle distincte du cas masqué : "Code inconnu", jamais "Masqué".
    expect(cellTag![0]).toContain('title="Code inconnu"')
    expect(cellTag![0]).not.toContain('title="Masqué"')

    // Couleur d'alerte distincte de la couleur neutre du masquage RGPD (#9AA5B1).
    expect(cellTag![0]).toContain('style="background')
    expect(cellTag![0]).not.toContain('rgba(154, 165, 177') // #9AA5B1 (hexToRgba), réservée au cas masqué
  })
})
