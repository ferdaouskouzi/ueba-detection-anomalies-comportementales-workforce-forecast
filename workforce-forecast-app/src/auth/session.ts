import type { AppUser } from '../types'
import type { BackendUser } from '../api/authApi'

const TOKEN_KEY = 'wf_access_token'

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function mapBackendUser(u: BackendUser): AppUser {
  return {
    id: String(u.id),
    nom: u.nom,
    role: u.role,
    directionId: u.direction_id ?? undefined,
    departmentId: u.department_id ?? undefined,
    pernr: u.pernr,
    mustChangePassword: u.must_change_password,
    departmentReady: u.department_ready ?? undefined,
  }
}