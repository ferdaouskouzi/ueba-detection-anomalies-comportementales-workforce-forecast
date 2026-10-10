import type { Employee } from '../types'

export function findEmployee(employees: Employee[], pernr: string): Employee | undefined {
  return employees.find((e) => e.pernr === pernr)
}

// Résolution du nom du people manager par recherche du PERNR — jamais stocké en arbre.
export function managerName(employees: Employee[], pernr: string | null): string {
  if (!pernr) return '—'
  const m = findEmployee(employees, pernr)
  return m ? m.nom : `PERNR ${pernr} introuvable`
}

export function isPeopleManager(employees: Employee[], pernr: string): boolean {
  return employees.some((e) => e.managerPernr === pernr)
}

export function directDirectReports(employees: Employee[], pernr: string): Employee[] {
  return employees.filter((e) => e.managerPernr === pernr)
}
