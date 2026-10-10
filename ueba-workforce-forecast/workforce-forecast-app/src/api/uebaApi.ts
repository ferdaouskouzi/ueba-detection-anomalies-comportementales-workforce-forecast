// Client de GET /ueba/anomalies — endpoint ADMIN uniquement (Depends(require_roles("ADMIN"))
// côté backend). Même style que api/referenceApi.ts : helper request<T> + mapping snake_case
// -> camelCase, aucune logique métier ici.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface AnomalieSignaux {
  volumeZscore: number
  heureZscore: number
  vitesseZscore: number
  horsDepartement: boolean
  scoreNouveaute: number
  noveltyZscore: number
}

export interface Anomalie {
  pernrLead: string
  nomLead: string | null
  jour: string // ISO yyyy-mm-dd
  estSuspect: boolean
  raisonAlerte: string | null // ex. "modele_isolation_forest,nouveaute_cible"
  scoreConfiance: number // decision_function : plus négatif = plus suspect
  signaux: AnomalieSignaux
  // signaux_fiables_seulement côté backend : target_pernrs / perimetre manquants sur
  // l'agrégat -> scoring sur 3 signaux au lieu de 5.
  signalPartiel: boolean
  calculeLe: string
}

interface BackendAnomalie {
  pernr_lead: string
  nom_lead: string | null
  jour: string
  est_suspect: boolean
  raison_alerte: string | null
  score_confiance: number
  signaux_calcules: {
    volume_zscore: number
    heure_zscore: number
    vitesse_zscore: number
    hors_departement: boolean
    score_nouveaute: number
    novelty_zscore: number
  }
  signaux_fiables_seulement: boolean
  calcule_le: string
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

function toFrontend(a: BackendAnomalie): Anomalie {
  return {
    pernrLead: a.pernr_lead,
    nomLead: a.nom_lead,
    jour: a.jour,
    estSuspect: a.est_suspect,
    raisonAlerte: a.raison_alerte,
    scoreConfiance: a.score_confiance,
    signaux: {
      volumeZscore: a.signaux_calcules.volume_zscore,
      heureZscore: a.signaux_calcules.heure_zscore,
      vitesseZscore: a.signaux_calcules.vitesse_zscore,
      horsDepartement: a.signaux_calcules.hors_departement,
      scoreNouveaute: a.signaux_calcules.score_nouveaute,
      noveltyZscore: a.signaux_calcules.novelty_zscore,
    },
    signalPartiel: a.signaux_fiables_seulement,
    calculeLe: a.calcule_le,
  }
}

export async function listAnomalies(
  token: string,
  opts: { suspectsSeulement?: boolean; depuis?: string } = {},
): Promise<Anomalie[]> {
  const qs = new URLSearchParams()
  if (opts.suspectsSeulement) qs.set('suspects_seulement', 'true')
  if (opts.depuis) qs.set('depuis', opts.depuis)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const rows = await request<BackendAnomalie[]>(token, `/ueba/anomalies${suffix}`)
  return rows.map(toFrontend)
}
