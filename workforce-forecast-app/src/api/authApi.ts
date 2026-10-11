// Client HTTP pour le backend d'authentification réel (FastAPI).
// URL configurable via la variable d'environnement Vite VITE_API_URL (voir .env.example).

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface LoginStepResponse {
  needs_totp_setup: boolean
  temp_token: string
  otpauth_uri: string | null
  qr_code_base64: string | null
}

export interface BackendUser {
  id: number
  pernr: string
  nom: string
  role: 'EUM_EUD' | 'HEAD_OF_DIRECTION' | 'ADMIN'
  direction_id: string | null
  department_id: string | null
  must_change_password: boolean
  department_ready: boolean | null
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: BackendUser
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    })
  } catch {
    throw new ApiError(0, "Impossible de joindre le serveur d'authentification. Vérifiez qu'il est démarré.")
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`
    try {
      const body = await res.json()
      message = body.detail || message
    } catch {
      /* réponse non-JSON, on garde le message générique */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

// Étape 1 — PERNR + mot de passe
export function loginStep1(pernr: string, password: string) {
  return request<LoginStepResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ pernr, password }),
  })
}

// Étape 2 — code TOTP à 6 chiffres, obligatoire (setup ou vérification selon needs_totp_setup).
// expected_role : rôle sélectionné sur l'écran de départ, revérifié côté serveur (défense en
// profondeur) contre le rôle réel du compte avant toute émission de token.
export function verifyTotp(tempToken: string, code: string, expectedRole: BackendUser['role']) {
  return request<TokenResponse>('/auth/verify-totp', {
    method: 'POST',
    body: JSON.stringify({ temp_token: tempToken, code, expected_role: expectedRole }),
  })
}

export function fetchMe(accessToken: string) {
  return request<BackendUser>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function logout(accessToken: string) {
  return request<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function changePassword(accessToken: string, currentPassword: string, newPassword: string) {
  return request<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}
