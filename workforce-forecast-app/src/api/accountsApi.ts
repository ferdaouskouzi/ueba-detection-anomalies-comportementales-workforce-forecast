import type { Role } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface BackendAccount {
  id: number
  pernr: string
  nom: string
  role: Role
  direction_id: string | null
  department_id: string | null
  is_active: boolean
  locked: boolean
  must_change_password: boolean
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

export function listAccounts(token: string): Promise<BackendAccount[]> {
  return request<BackendAccount[]>(token, '/admin/accounts')
}

export function resetAccountPassword(token: string, pernr: string): Promise<{ temporary_password: string }> {
  return request<{ temporary_password: string }>(token, `/admin/accounts/${encodeURIComponent(pernr)}/reset-password`, {
    method: 'POST',
  })
}
