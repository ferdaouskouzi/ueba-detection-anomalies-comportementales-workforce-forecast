// Client de GET /audit/forecast-entries — endpoint ADMIN uniquement
// (Depends(require_roles("ADMIN")) côté backend). Même style que api/uebaApi.ts :
// helper request<T> + mapping snake_case -> camelCase, aucune logique métier ici.
//
// Le backend renvoie déjà une réponse structurée (jamais la chaîne `detail` brute) :
// { quand, qui, pernr, date, demi, avant, apres }. Ici les clés sont juste alignées
// sur le camelCase du front ; `quand`/`qui` sont déjà en un seul mot.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface ForecastAuditEntry {
  quand: string // ISO datetime (AuditLog.quand)
  qui: string // PERNR de l'auteur de la saisie
  pernr: string // collaborateur dont le créneau a été peint
  date: string // jour ISO du créneau (yyyy-mm-dd)
  demi: 'AM' | 'PM'
  avant: string // état avant ("—" si le créneau était vide)
  apres: string // état après ("—" si vidé ; "— (effacement)" pour un effacement)
}

interface BackendForecastAuditEntry {
  quand: string
  qui: string
  pernr: string
  date: string
  demi: string
  avant: string
  apres: string
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

function toFrontend(e: BackendForecastAuditEntry): ForecastAuditEntry {
  return {
    quand: e.quand,
    qui: e.qui,
    pernr: e.pernr,
    date: e.date,
    demi: e.demi === 'PM' ? 'PM' : 'AM',
    avant: e.avant,
    apres: e.apres,
  }
}

// `depuis` / `jusqua` : jour ISO, bornes INCLUSES, filtre serveur sur le jour réel
// de l'écriture (AuditLog.quand). Même sémantique que le `depuis` de listAnomalies.
export async function listForecastAuditEntries(
  token: string,
  opts: { depuis?: string; jusqua?: string; limite?: number } = {},
): Promise<ForecastAuditEntry[]> {
  const qs = new URLSearchParams()
  if (opts.depuis) qs.set('depuis', opts.depuis)
  if (opts.jusqua) qs.set('jusqua', opts.jusqua)
  if (opts.limite) qs.set('limite', String(opts.limite))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const rows = await request<BackendForecastAuditEntry[]>(token, `/audit/forecast-entries${suffix}`)
  return rows.map(toFrontend)
}
