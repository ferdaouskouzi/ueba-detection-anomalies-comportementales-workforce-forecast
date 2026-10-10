import type { ActivityCode, Department, Direction, Employee, Famille, ImportReportRow, Project, Statut } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface DepartmentImportSummary {
  department_id: string
  department_nom: string
  collaborateurs: number
  pret: boolean
}

export interface ImportReport {
  kind: 'employees' | 'projects'
  total_lignes: number
  acceptees: number
  rejetees: number
  rapport: ImportReportRow[]
  par_departement: DepartmentImportSummary[]
}

interface BackendDirection {
  id: string
  nom: string
  head_pernr: string | null
}

interface BackendDepartment {
  id: string
  nom: string
  direction_id: string
  lead_pernr: string
  lead_titre: string
}

interface BackendEmployee {
  pernr: string
  nom: string
  manager_pernr: string | null
  statut: string
  grade: string | null
  direction_id: string | null
  department_id: string | null
}

interface BackendProject {
  code: string
  nom: string
  client: string
  statut: string
}

interface BackendActivityCode {
  code: string
  libelle: string
  famille: string
  projet_obligatoire: boolean
  couleur: string
}

async function request<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try { message = (await res.json()).detail || message } catch { /* réponse non-JSON */ }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function listDirections(token: string): Promise<Direction[]> {
  const rows = await request<BackendDirection[]>(token, '/directions')
  return rows.map((d) => ({ id: d.id, nom: d.nom }))
}

export async function listDepartments(token: string): Promise<Department[]> {
  const rows = await request<BackendDepartment[]>(token, '/departments')
  return rows.map((d) => ({
    id: d.id, nom: d.nom, directionId: d.direction_id,
    leadPernr: d.lead_pernr, leadTitre: d.lead_titre as 'EUM' | 'EUD',
  }))
}

export async function listEmployees(token: string): Promise<Employee[]> {
  const rows = await request<BackendEmployee[]>(token, '/employees')
  return rows.map((e) => ({
    pernr: e.pernr, nom: e.nom, managerPernr: e.manager_pernr, statut: e.statut as Statut,
    grade: e.grade ?? undefined, directionId: e.direction_id ?? undefined, departmentId: e.department_id ?? undefined,
  }))
}

export async function listProjects(token: string, statut?: string): Promise<Project[]> {
  const qs = statut ? `?statut=${encodeURIComponent(statut)}` : ''
  const rows = await request<BackendProject[]>(token, `/projects${qs}`)
  return rows.map((p) => ({ code: p.code, nom: p.nom, client: p.client, statut: p.statut as 'actif' | 'clôturé' }))
}

export async function listActivityCodes(token: string): Promise<ActivityCode[]> {
  const rows = await request<BackendActivityCode[]>(token, '/activity-codes')
  return rows.map((c) => ({
    code: c.code, libelle: c.libelle, famille: c.famille as Famille,
    projetObligatoire: c.projet_obligatoire, couleur: c.couleur,
  }))
}

async function upload<T>(token: string, path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }, // pas de Content-Type : le navigateur pose le boundary multipart
    body: form,
  })
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try { message = (await res.json()).detail || message } catch { /* réponse non-JSON */ }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function importEmployees(token: string, file: File): Promise<ImportReport> {
  return upload<ImportReport>(token, '/admin/import/employees', file)
}

export function importProjects(token: string, file: File): Promise<ImportReport> {
  return upload<ImportReport>(token, '/admin/import/projects', file)
}
