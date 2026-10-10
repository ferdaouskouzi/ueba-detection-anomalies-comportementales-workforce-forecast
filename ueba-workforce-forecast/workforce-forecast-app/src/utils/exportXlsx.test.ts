import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { Direction } from '../types'
import type { EmployeeBreakdown } from '../data/dashboardKpis'
import { buildDashboardWorkbook, type DashboardXlsxPayload } from './exportXlsx'

const direction: Direction = { id: 'D1', nom: 'Ingénierie Automobile' }

const employeeBreakdown: EmployeeBreakdown[] = [
  { pernr: '0010001', nom: 'Léa Cherkaoui', departement: 'Powertrain Systems', tauxProd: 75, tauxBench: 0, tauxAbsence: 25, etp: 0.75 },
  { pernr: '0010002', nom: 'Nadia Amrani', departement: 'ADAS & Perception', tauxProd: 100, tauxBench: 0, tauxAbsence: 0, etp: 1 },
]

function basePayload(overrides: Partial<DashboardXlsxPayload> = {}): DashboardXlsxPayload {
  return {
    direction,
    kpis: { effectif: 2, tauxProd: 88, tauxBench: 0, tauxAbsence: 12, etpTotal: 1.75, etpData: [] },
    deptComparison: [],
    monthly: [],
    employeeBreakdown,
    ...overrides,
  }
}

describe('buildDashboardWorkbook — feuille "Par collaborateur" (cahier des charges §2.7)', () => {
  it('existe, aux côtés de "Par projet" et "Par département"', () => {
    const wb = buildDashboardWorkbook(basePayload())
    expect(wb.SheetNames).toContain('Par collaborateur')
    expect(wb.SheetNames).toContain('Par projet')
    expect(wb.SheetNames).toContain('Par département')
  })

  it('contient les colonnes attendues, une ligne par collaborateur', () => {
    const wb = buildDashboardWorkbook(basePayload())
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Par collaborateur'])
    expect(rows).toEqual([
      { PERNR: '0010001', Nom: 'Léa Cherkaoui', Département: 'Powertrain Systems', '% Production': 75, '% Bench': 0, '% Absence': 25, ETP: 0.75 },
      { PERNR: '0010002', Nom: 'Nadia Amrani', Département: 'ADAS & Perception', '% Production': 100, '% Bench': 0, '% Absence': 0, ETP: 1 },
    ])
  })

  it('le PERNR est stocké en texte, jamais en nombre (les zéros de tête ne doivent pas disparaître)', () => {
    const wb = buildDashboardWorkbook(basePayload())
    const sheet = wb.Sheets['Par collaborateur']
    // Ligne 1 = en-têtes, la première ligne de données est donc A2.
    expect(sheet['A2'].t).toBe('s')
    expect(sheet['A2'].v).toBe('0010001')
  })

  it('RGPD (§4.2) — un export généré pour un Head of Direction (motifs déjà masqués en "Absence" par le serveur) n\'inclut aucun code d\'absence individuel dans cette feuille', () => {
    // Reproduit ce qu'un HOD reçoit réellement de GET /forecast-entries (cf.
    // test_hod_receives_aggregated_absence_never_the_nominative_code côté backend) : plus
    // aucune trace de EL/MAT/SS/CP, seulement des taux agrégés.
    const hodBreakdown: EmployeeBreakdown[] = [
      { pernr: '0010001', nom: 'Léa Cherkaoui', departement: 'Powertrain Systems', tauxProd: 50, tauxBench: 0, tauxAbsence: 50, etp: 0.5 },
    ]
    const wb = buildDashboardWorkbook(basePayload({ employeeBreakdown: hodBreakdown }))
    const sheet = wb.Sheets['Par collaborateur']
    const allCellValues = Object.keys(sheet)
      .filter((key) => !key.startsWith('!'))
      .map((key) => sheet[key].v)

    ;['EL', 'MAT', 'SS', 'CP'].forEach((code) => expect(allCellValues).not.toContain(code))
    // Seules des colonnes agrégées existent — jamais de colonne "code" ou "motif".
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[]
    expect(headers).toEqual(['PERNR', 'Nom', 'Département', '% Production', '% Bench', '% Absence', 'ETP'])
  })
})
