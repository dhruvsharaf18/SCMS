import type { AuthUser, TokenResponse } from './types'

const API_BASE = '/api/v1'

/**
 * In-memory access token storage (SRS §7, S-02).
 * NEVER persisted to localStorage or sessionStorage.
 */
let inMemoryAccessToken: string | null = null
let onAuthFailureCallback: (() => void) | null = null

export function getAccessToken(): string | null {
  return inMemoryAccessToken
}

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token
}

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
}

/**
 * Single in-flight refresh promise so parallel requests share one refresh cycle.
 */
let refreshPromise: Promise<TokenResponse | null> | null = null

export async function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        })

        if (!res.ok) {
          setAccessToken(null)
          return null
        }

        const data: TokenResponse = await res.json()
        setAccessToken(data.access_token)
        return data
      } catch {
        setAccessToken(null)
        return null
      } finally {
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

/**
 * Core HTTP request handler.
 * - Same-origin baseUrl: /api/v1 (forwarded by Vite dev proxy / nginx)
 * - Credentials: 'include' for HttpOnly refresh cookie
 * - In-memory access token attached via Authorization header
 * - Automatic 401 TOKEN_EXPIRED refresh & retry (single retry, no loops)
 */
async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const url = `${API_BASE}${path}`
  const headers = new Headers(options.headers)

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  // Attach in-memory JWT if available
  const token = getAccessToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
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

  // Handle 401 TOKEN_EXPIRED with single refresh & retry
  if (res.status === 401 && !isRetry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshSession()
    if (refreshed) {
      return request<T>(path, options, true)
    } else {
      onAuthFailureCallback?.()
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please sign in again.')
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const code = body?.error?.code ?? `HTTP_${res.status}`
    const message = body?.error?.message ?? res.statusText
    const details = body?.error?.details
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

// ── Real Auth API Endpoints (SRS §3.2.1) ────────────────────────────────────
export async function loginApi(email: string, password: string): Promise<TokenResponse> {
  return api.post<TokenResponse>('/auth/login', { email, password })
}

export async function refreshApi(): Promise<TokenResponse> {
  return api.post<TokenResponse>('/auth/refresh')
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
  const token = getAccessToken()
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { headers, credentials: 'include' })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? 'CSV export failed')
  }
  return res.blob()
}
