import * as XLSX from 'xlsx'
import type { Direction } from '../types'
import type { EmployeeBreakdown } from '../data/dashboardKpis'

export interface DashboardXlsxPayload {
  direction: Direction
  kpis: { effectif: number; tauxProd: number; tauxBench: number; tauxAbsence: number; etpTotal: number; etpData: { code: string; nom: string; client: string; etp: number }[] }
  deptComparison: { departement: string; tauxProduction: number }[]
  monthly: { mois: string; tauxProduction: number }[]
  employeeBreakdown: EmployeeBreakdown[]
}

// Construction pure du classeur, séparée de l'écriture sur disque — testable sans
// déclencher un téléchargement (cf. exportDashboardXlsx ci-dessous, qui l'enveloppe).
export function buildDashboardWorkbook(payload: DashboardXlsxPayload): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const kpiSheet = XLSX.utils.json_to_sheet([
    { indicateur: 'Effectif', valeur: payload.kpis.effectif },
    { indicateur: 'Taux de production (%)', valeur: payload.kpis.tauxProd },
    { indicateur: 'Taux de bench (%)', valeur: payload.kpis.tauxBench },
    { indicateur: "Taux d'absence (%)", valeur: payload.kpis.tauxAbsence },
    { indicateur: 'ETP total engagé', valeur: payload.kpis.etpTotal },
  ])
  XLSX.utils.book_append_sheet(wb, kpiSheet, 'KPI Direction')

  // Feuille "par collaborateur" (cahier des charges §2.7 : une feuille par axe —
  // collaborateur, projet, département). Jamais de code d'absence individuel ici, seulement
  // le taux "Absence" agrégé (§4.2) — computeEmployeeBreakdown ne fournit que ça.
  const collabSheet = XLSX.utils.json_to_sheet(
    payload.employeeBreakdown.map((e) => ({
      PERNR: e.pernr,
      Nom: e.nom,
      Département: e.departement,
      '% Production': e.tauxProd,
      '% Bench': e.tauxBench,
      '% Absence': e.tauxAbsence,
      ETP: e.etp,
    })),
  )
  // PERNR toujours en texte : un PERNR tout en chiffres (ex. "0010001") perdrait ses zéros
  // de tête si Excel le réinterprétait en nombre — même exigence que le reste du fichier.
  const collabRange = XLSX.utils.decode_range(collabSheet['!ref'] ?? 'A1:A1')
  for (let r = 1; r <= collabRange.e.r; r++) {
    const cell = collabSheet[XLSX.utils.encode_cell({ r, c: 0 })]
    if (cell) { cell.t = 's'; cell.z = '@' }
  }
  XLSX.utils.book_append_sheet(wb, collabSheet, 'Par collaborateur')

  const projetSheet = XLSX.utils.json_to_sheet(
    payload.kpis.etpData.map((p) => ({ 'Code projet': p.code, Projet: p.nom, Client: p.client, ETP: p.etp })),
  )
  XLSX.utils.book_append_sheet(wb, projetSheet, 'Par projet')

  const deptSheet = XLSX.utils.json_to_sheet(
    payload.deptComparison.map((d) => ({ Département: d.departement, 'Taux de production (%)': d.tauxProduction })),
  )
  XLSX.utils.book_append_sheet(wb, deptSheet, 'Par département')

  const moisSheet = XLSX.utils.json_to_sheet(
    payload.monthly.map((m) => ({ Mois: m.mois, 'Taux de production (%)': m.tauxProduction })),
  )
  XLSX.utils.book_append_sheet(wb, moisSheet, 'Évolution mensuelle')

  return wb
}

export async function exportDashboardXlsx(payload: DashboardXlsxPayload) {
  const wb = buildDashboardWorkbook(payload)
  const filename = `Workforce-Forecast_${payload.direction.nom.replace(/\s+/g, '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
