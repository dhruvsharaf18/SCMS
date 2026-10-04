import type { AuthUser, LoginResponse } from './types'

const API_BASE = '/api/v1'

/**
 * In-memory JWT store.  The token is NEVER written to localStorage, sessionStorage,
 * a cookie, or any other persistent store (SRS S-21 / security item 5).
 * It is cleared on logout or on a 401 that arrives outside the login flow.
 */
let _accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

let onAuthFailureCallback: (() => void) | null = null

export function setOnAuthFailure(callback: () => void) {
  onAuthFailureCallback = callback
}

/**
 * Typed API Error matching SRS §6 envelope:
 * { "error": { "code": "...", "message": "...", "details": {...} } }
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Same shape as the server's error envelope, which is what pages read (`err.error.message`). */
  get error() {
    return { code: this.code, message: this.message, details: this.details }
  }
}

/**
 * Core HTTP request handler.
 * - Same-origin baseUrl: /api/v1 (forwarded by Vite dev proxy / nginx)
 * - Sends JWT as Authorization: Bearer when available (Part B).
 * - Credentials: 'include' so the HttpOnly session cookie also travels (belt-and-suspenders).
 * - A 401 outside login means the token/session is gone; the app drops back to signed-out.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`
  const headers = new Headers(options.headers)

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  // Attach JWT access token in memory (never read from storage).
  if (_accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${_accessToken}`)
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch (netErr: any) {
    throw new ApiError(0, 'NETWORK_ERROR', netErr?.message || 'Network connection error')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const code = body?.error?.code ?? `HTTP_${res.status}`
    const message = body?.error?.message ?? res.statusText
    const details = body?.error?.details
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/me')) {
      // Token expired or revoked — clear it and notify the app.
      _accessToken = null
      onAuthFailureCallback?.()
    }
    throw new ApiError(res.status, code, message, details)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json()
}

// ── Generic HTTP Methods ───────────────────────────────────────────────────
export const api = {
  get: <T>(path: string, options?: RequestInit) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

// ── Encrypted Login (feat/encrypted-login) ────────────────────────────────
/**
 * Fetch the server's RSA public key, encrypt {email, password, ts} with
 * RSA-OAEP / SHA-256 (SubtleCrypto — no external library), then POST
 * {key_id, data} to /auth/login.
 *
 * The Network tab will show only an opaque base64 blob — never plaintext
 * credentials.
 *
 * Security notes:
 *  - Uses the browser's native SubtleCrypto; zero new npm dependencies.
 *  - `ts` (Unix epoch seconds, float) protects against replay: the server
 *    rejects payloads older than 120 seconds.
 *  - email ≤ 120 chars, password ≤ 100 chars (server enforces 422 otherwise).
 */
export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  // 1. Fetch the current public key.
  const keyRes = await fetch(`${API_BASE}/auth/login-key`, { credentials: 'include' })
  if (!keyRes.ok) {
    const body = await keyRes.json().catch(() => null)
    throw new ApiError(keyRes.status, body?.error?.code ?? 'KEY_FETCH_ERROR', body?.error?.message ?? 'Failed to fetch login key')
  }
  const keyInfo: { key_id: string; public_key_spki_b64: string; expires_at: string } = await keyRes.json()

  // 2. Import the SPKI-DER public key into SubtleCrypto.
  const spkiDer = Uint8Array.from(atob(keyInfo.public_key_spki_b64), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    spkiDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )

  // 3. Encrypt {email, password, ts} with RSA-OAEP.
  const payload = JSON.stringify({ email, password, ts: Date.now() / 1000 })
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    cryptoKey,
    new TextEncoder().encode(payload),
  )
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)))

  // 4. POST the opaque blob.
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (_accessToken) headers.set('Authorization', `Bearer ${_accessToken}`)
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ key_id: keyInfo.key_id, data: dataB64 }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? res.statusText, body?.error?.details)
  }
  return res.json() as Promise<LoginResponse>
}


export async function logoutApi(): Promise<{ status: string }> {
  return api.post<{ status: string }>('/auth/logout')
}

export async function getMeApi(): Promise<AuthUser> {
  return api.get<AuthUser>('/auth/me')
}

export async function downloadPaymentsCsvApi(from?: string, to?: string): Promise<Blob> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const path = `/reports/payments.csv${params.toString() ? `?${params.toString()}` : ''}`
  const url = `${API_BASE}${path}`

  const headers: HeadersInit = {}
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  const res = await fetch(url, { credentials: 'include', headers })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? 'CSV export failed')
  }
  return res.blob()
}
