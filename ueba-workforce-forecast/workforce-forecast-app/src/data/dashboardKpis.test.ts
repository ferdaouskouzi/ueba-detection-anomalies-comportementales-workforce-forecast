import { describe, expect, it } from 'vitest'
import type { ActivityCode, Department, Employee, ForecastEntry, Project } from '../types'
import { computeDashboardKpis, computeEmployeeBreakdown, matchesClientProject, resolveActivityCode, resolveFamille } from './dashboardKpis'

// Scénario partagé : 2 collaborateurs dans DEP1, 1 dans DEP2 ; deux projets, chacun chez un
// client différent — de quoi vérifier que département/client/projet/période, cumulés,
// donnent un résultat distinct de chacun pris isolément (cahier des charges §2.6).
const employees: Employee[] = [
  { pernr: 'E1', nom: 'E1', managerPernr: null, statut: 'Active', departmentId: 'DEP1' },
  { pernr: 'E2', nom: 'E2', managerPernr: null, statut: 'Active', departmentId: 'DEP1' },
  { pernr: 'E3', nom: 'E3', managerPernr: null, statut: 'Active', departmentId: 'DEP2' },
]

const projects: Project[] = [
  { code: 'PRJ_A', nom: 'Projet A', client: 'ClientA', statut: 'actif' },
  { code: 'PRJ_B', nom: 'Projet B', client: 'ClientB', statut: 'actif' },
]

const activityCodes: ActivityCode[] = [
  { code: 'P', libelle: 'Production', famille: 'Production', projetObligatoire: true, couleur: '#000' },
  { code: 'CP', libelle: 'Congé payé', famille: 'Absence', projetObligatoire: false, couleur: '#000' },
]

function entry(pernr: string, date: string, code: string, projectCode: string | null): ForecastEntry {
  return { pernr, date, demiJournee: 'AM', code, projectCode, auteur: 'test', horodatage: '2026-01-01T00:00:00Z' }
}

const entries: Record<string, ForecastEntry> = {
  e1: entry('E1', '2026-01-05', 'P', 'PRJ_A'),
  e2: entry('E1', '2026-01-06', 'P', 'PRJ_B'),
  e3: entry('E2', '2026-01-05', 'P', 'PRJ_A'),
  e4: entry('E2', '2026-01-06', 'CP', null),
  e5: entry('E3', '2026-01-05', 'P', 'PRJ_A'),
}

const period = new Set(['2026-01-05', '2026-01-06'])

describe('computeDashboardKpis — filtres cumulables (§2.6)', () => {
  it('département seul (DEP1)', () => {
    const kpis = computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: ['DEP1'], clientFilter: '', projectFilter: '', periodDates: period,
    })
    expect(kpis.effectif).toBe(2)
    expect(kpis.tauxProd).toBe(38) // 3 P sur 2*2*2=8 créneaux
  })

  it('client seul (ClientA, toute la direction)', () => {
    const kpis = computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: ['DEP1', 'DEP2'], clientFilter: 'ClientA', projectFilter: '', periodDates: period,
    })
    expect(kpis.effectif).toBe(3) // E1, E2, E3 ont tous une entrée sur PRJ_A
    expect(kpis.tauxProd).toBe(25) // 3 P sur 3*2*2=12 créneaux
  })

  it('département + client cumulés donnent un résultat différent des deux filtres isolés', () => {
    const kpis = computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: ['DEP1'], clientFilter: 'ClientA', projectFilter: '', periodDates: period,
    })
    // Effectif : ni le "2" du département seul (E3 en moins n'a aucun effet ici puisqu'il
    // n'était pas dans DEP1) ni le "3" du client seul (E3 exclu par le département).
    expect(kpis.effectif).toBe(2)
    // Taux : ni 38 (département seul, incluait le PRJ_B de E1 et le CP de E2) ni 25 du
    // client seul sur toute la direction (dénominateur à 3 effectifs) — même valeur ici par
    // coïncidence arithmétique (2/8 = 3/12 = 25 %), donc on vérifie sur l'ETP par projet
    // pour trancher sans ambiguïté : PRJ_B doit avoir disparu (hors client A).
    expect(kpis.tauxProd).toBe(25)
    expect(kpis.etpData.map((p) => p.code)).toEqual(['PRJ_A'])
  })

  it('filtre projet : restreint effectif et calculs à ce projet précis', () => {
    const kpis = computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: ['DEP1', 'DEP2'], clientFilter: '', projectFilter: 'PRJ_B', periodDates: period,
    })
    expect(kpis.effectif).toBe(1) // seul E1 a une entrée sur PRJ_B
    expect(kpis.etpData).toEqual([{ code: 'PRJ_B', nom: 'Projet B', client: 'ClientB', etp: 0.25 }])
  })

  it('une période plus courte change le résultat sans changer le périmètre', () => {
    const narrowPeriod = new Set(['2026-01-05'])
    const kpis = computeDashboardKpis(entries, employees, projects, activityCodes, {
      departmentIds: ['DEP1'], clientFilter: '', projectFilter: '', periodDates: narrowPeriod,
    })
    expect(kpis.tauxProd).toBe(50) // 2 P (E1, E2 le 05) sur 2*1*2=4 créneaux
  })

  it('ETP par projet dérivé de projetObligatoire du référentiel, pas d\'un code "P" en dur : un second code obligatoire alimente aussi etpData (§2.3)', () => {
    const codesWithSecondMandatoryProject: ActivityCode[] = [
      ...activityCodes,
      { code: 'X2', libelle: 'Mission secondaire', famille: 'Production', projetObligatoire: true, couleur: '#000' },
    ]
    const entriesWithSecondCode: Record<string, ForecastEntry> = { a: entry('E1', '2026-01-05', 'X2', 'PRJ_A') }
    const kpis = computeDashboardKpis(entriesWithSecondCode, employees, projects, codesWithSecondMandatoryProject, {
      departmentIds: ['DEP1'], clientFilter: '', projectFilter: '', periodDates: period,
    })
    expect(kpis.etpData.map((p) => p.code)).toEqual(['PRJ_A'])
  })
})

describe('matchesClientProject', () => {
  it('laisse tout passer sans filtre', () => {
    expect(matchesClientProject(entry('E1', '2026-01-05', 'CP', null), projects, activityCodes, '', '')).toBe(true)
  })

  it('exclut un code sans projet obligatoire dès qu’un filtre client/projet est actif (règle R1 : pas de projet)', () => {
    expect(matchesClientProject(entry('E1', '2026-01-05', 'CP', null), projects, activityCodes, 'ClientA', '')).toBe(false)
  })

  it('exclut un P sur un autre projet que celui filtré', () => {
    expect(matchesClientProject(entry('E1', '2026-01-05', 'P', 'PRJ_B'), projects, activityCodes, '', 'PRJ_A')).toBe(false)
  })

  it('exclut un P dont le projet appartient à un autre client', () => {
    expect(matchesClientProject(entry('E1', '2026-01-05', 'P', 'PRJ_B'), projects, activityCodes, 'ClientA', '')).toBe(false)
  })

  it('dérive la condition "projet obligatoire" du référentiel, pas d\'un code "P" en dur : reconnaît un second code marqué projetObligatoire (§2.3)', () => {
    const codesWithSecondMandatoryProject: ActivityCode[] = [
      ...activityCodes,
      { code: 'X2', libelle: 'Mission secondaire', famille: 'Production', projetObligatoire: true, couleur: '#000' },
    ]
    expect(matchesClientProject(entry('E1', '2026-01-05', 'X2', 'PRJ_A'), projects, codesWithSecondMandatoryProject, 'ClientA', '')).toBe(true)
  })
})

describe('resolveFamille — code déjà masqué reçu par un Head of Direction (§4.2)', () => {
  it('reconnaît la famille Absence même quand le code exact (EL/MAT/SS/CP) a été remplacé par le libellé générique', () => {
    expect(resolveFamille(entry('E1', '2026-01-05', 'Absence', null), activityCodes)).toBe('Absence')
  })

  it('résout normalement un code exact du référentiel (cas EUM_EUD, non masqué)', () => {
    expect(resolveFamille(entry('E1', '2026-01-05', 'CP', null), activityCodes)).toBe('Absence')
    expect(resolveFamille(entry('E1', '2026-01-05', 'P', 'PRJ_A'), activityCodes)).toBe('Production')
  })

  it("code inconnu du référentiel (ni un code réel, ni le libellé masqué) : famille indéfinie", () => {
    expect(resolveFamille(entry('E1', '2026-01-05', 'ZZZ', null), activityCodes)).toBeUndefined()
  })
})

describe('resolveActivityCode — distingue le masquage RGPD (§4.2) d\'un code réellement inconnu du référentiel', () => {
  it('ne renvoie jamais le même repli pour "Absence" (masquage RGPD, état normal) et un code invalide sans rapport (ex. donnée corrompue)', () => {
    const masked = resolveActivityCode(entry('E1', '2026-01-05', 'Absence', null), activityCodes)
    const unknown = resolveActivityCode(entry('E1', '2026-01-05', 'ZZZ_INCONNU', null), activityCodes)

    expect(masked).not.toEqual(unknown)
    expect(masked.libelle).toBe('Masqué')
    expect(unknown.libelle).not.toBe('Masqué')
    expect(masked.couleur).not.toBe(unknown.couleur)
  })
})

describe('computeEmployeeBreakdown — feuille "par collaborateur" de l\'export XLSX (§2.7)', () => {
  const departments: Department[] = [
    { id: 'DEP1', nom: 'Powertrain Systems', directionId: 'DIR1', leadPernr: 'E1', leadTitre: 'EUM' },
    { id: 'DEP2', nom: 'ADAS & Perception', directionId: 'DIR1', leadPernr: 'E3', leadTitre: 'EUM' },
  ]

  it('une ligne par collaborateur scopé, avec département résolu et ETP/pourcentages cohérents avec computeDashboardKpis', () => {
    const rows = computeEmployeeBreakdown(entries, employees, departments, projects, activityCodes, {
      departmentIds: ['DEP1'], clientFilter: '', projectFilter: '', periodDates: period,
    })
    expect(rows.map((r) => r.pernr)).toEqual(['E1', 'E2']) // triés par nom, E3 hors DEP1
    const e1 = rows.find((r) => r.pernr === 'E1')!
    expect(e1.departement).toBe('Powertrain Systems')
    // E1 : 2 P sur 2 jours * 2 demi-journées = 4 créneaux -> 50 % production, ETP = 2/2/2 = 0.5
    expect(e1.tauxProd).toBe(50)
    expect(e1.etp).toBe(0.5)
  })

  it('filtre client/projet cumulé au département : ne garde que les collaborateurs réellement staffés', () => {
    const rows = computeEmployeeBreakdown(entries, employees, departments, projects, activityCodes, {
      departmentIds: ['DEP1', 'DEP2'], clientFilter: '', projectFilter: 'PRJ_B', periodDates: period,
    })
    expect(rows.map((r) => r.pernr)).toEqual(['E1']) // seul E1 a une entrée sur PRJ_B
  })

  it('RGPD (§4.2) : ne fournit jamais de colonne exposant un code d\'absence — un motif nominatif déjà masqué par le serveur en "Absence" (cas Head of Direction) alimente correctement le taux d\'absence agrégé', () => {
    const hodEntries: Record<string, ForecastEntry> = {
      a: entry('E1', '2026-01-05', 'P', 'PRJ_A'),
      b: entry('E1', '2026-01-06', 'Absence', null), // code déjà remplacé côté serveur (§4.2)
    }
    const rows = computeEmployeeBreakdown(hodEntries, employees, departments, projects, activityCodes, {
      departmentIds: ['DEP1'], clientFilter: '', projectFilter: '', periodDates: period,
    })
    const e1 = rows.find((r) => r.pernr === 'E1')!
    // Sans resolveFamille, cette entrée masquée serait invisible (0 % au lieu de 25 %) —
    // c'est justement le bug que resolveFamille corrige.
    expect(e1.tauxAbsence).toBe(25) // 1 sur 2*1*2=4 créneaux
    // Aucune valeur de la feuille ne doit jamais être un code nominatif individuel.
    const values = rows.flatMap((r) => Object.values(r))
    ;['EL', 'MAT', 'SS', 'CP'].forEach((code) => expect(values).not.toContain(code))
  })
})
