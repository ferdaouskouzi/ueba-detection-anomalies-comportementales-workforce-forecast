export type Statut = 'Active' | 'Unpaid Leave' | 'Terminated' | 'Inactive'
export type Famille = 'Production' | 'Bench' | 'Management' | 'Formation' | 'Alternance' | 'Absence'
export type DemiJournee = 'AM' | 'PM'
export type Role = 'EUM_EUD' | 'HEAD_OF_DIRECTION' | 'ADMIN'
export type Lang = 'FR' | 'EN'

export interface ActivityCode {
  code: string
  libelle: string
  famille: Famille
  projetObligatoire: boolean
  couleur: string
}

export interface Direction {
  id: string
  nom: string
}

export interface Department {
  id: string
  nom: string
  directionId: string
  leadPernr: string
  leadTitre: 'EUM' | 'EUD'
}

export interface Employee {
  pernr: string
  nom: string
  managerPernr: string | null
  statut: Statut
  grade?: string
  directionId?: string
  departmentId?: string
}

export interface Project {
  code: string
  nom: string
  client: string
  statut: 'actif' | 'clôturé'
}

export interface ForecastEntry {
  pernr: string
  date: string // ISO yyyy-mm-dd
  demiJournee: DemiJournee
  code: string
  projectCode: string | null
  auteur: string
  horodatage: string
}

export interface AppUser {
  id: string
  nom: string
  role: Role
  directionId?: string
  departmentId?: string
  pernr?: string
  mustChangePassword?: boolean
  // Pertinent seulement pour un EUM_EUD (undefined sinon) — référentiel importé pour son
  // département ? Calculé côté serveur (voir backend/app/readiness.py), jamais recalculé ici.
  departmentReady?: boolean
}

export interface ImportReportRow {
  feuille: string
  ligne: number
  statut: 'accepté' | 'rejeté'
  motif?: string
  detail: string
}