import type { DemiJournee, ForecastEntry } from '../types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface BackendForecastEntry {
  pernr: string
  date: string
  demi_journee: DemiJournee
  code: string
  project_code: string | null
  auteur: string
  horodatage: string
}

interface ForecastPaintResponse {
  updated: BackendForecastEntry[]
  deleted: { pernr: string; date: string; demi: DemiJournee }[]
}

function toFrontend(e: BackendForecastEntry): ForecastEntry {
  return {
    pernr: e.pernr,
    date: e.date,
    demiJournee: e.demi_journee,
    code: e.code,
    projectCode: e.project_code,
    auteur: e.auteur,
    horodatage: e.horodatage,
  }
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

export async function listForecastEntries(token: string, start?: string, end?: string): Promise<ForecastEntry[]> {
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const qs = params.toString()
  const rows = await request<BackendForecastEntry[]>(token, `/forecast-entries${qs ? `?${qs}` : ''}`)
  return rows.map(toFrontend)
}

export async function paintForecast(
  token: string,
  updates: { pernr: string; date: string; demi: DemiJournee }[],
  code: string,
  projectCode: string | null,
): Promise<{ updated: ForecastEntry[]; deleted: { pernr: string; date: string; demi: DemiJournee }[] }> {
  const res = await request<ForecastPaintResponse>(token, '/forecast-entries/paint', {
    method: 'POST',
    body: JSON.stringify({ updates, code, project_code: projectCode }),
  })
  return { updated: res.updated.map(toFrontend), deleted: res.deleted }
}
