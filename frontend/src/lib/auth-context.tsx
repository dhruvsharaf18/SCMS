import React, {
  createContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react'
import type { AuthUser } from '../api/types'
export type { Role } from '../api/types'
import { getMeApi, loginApi, logoutApi, setOnAuthFailure, setAccessToken } from '../api/client'
import { Trophy } from 'lucide-react'

// ── Context Types ──────────────────────────────────────────────────────────
export interface User extends AuthUser {}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

// ── Context ────────────────────────────────────────────────────────────────
export const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On initial mount: the HttpOnly session cookie survives a reload, so ask who it belongs to.
  useEffect(() => {
    let isMounted = true

    // A 401 on any later request means the session ended (logout elsewhere, expiry, deactivation).
    setOnAuthFailure(() => {
      setAccessToken(null)
      setUser(null)
    })

    async function restoreSession() {
      try {
        const me = await getMeApi()
        if (isMounted) setUser(me)
      } catch {
        if (isMounted) setUser(null)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      isMounted = false
    }
  }, [])

  // The role always comes from the server's answer to a real email + password check.
  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await loginApi(email.trim(), password)
    // Store JWT in memory only — never in storage (security item 5).
    if (response.access_token) {
      setAccessToken(response.access_token)
    }
    setUser(response.user)
    return response.user
  }, [])

  // Real logout API call
  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // Ignore network errors on logout
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  )

  // Show a smooth loading screen while checking session on reload (no login page flash)
  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-pill">
            <Trophy size={28} className="stroke-[2.2]" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-extrabold text-text-primary">Champions Club</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Restoring session...</p>
          </div>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
