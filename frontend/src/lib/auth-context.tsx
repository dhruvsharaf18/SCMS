import React, {
  createContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react'
import type { Role, AuthUser } from '../api/types'
export type { Role } from '../api/types'
import {
  loginApi,
  logoutApi,
  refreshSession,
  setAccessToken,
  setOnAuthFailure,
  getAccessToken,
  ApiError,
} from '../api/client'
import { Trophy } from 'lucide-react'

// ── Context Types ──────────────────────────────────────────────────────────
export interface User extends AuthUser {}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  /** Dev-only: switch role instantly without a real API call. */
  switchRole: (role: Role) => void
}

// ── Mock users for dev role switcher only ───────────────────────────────────
const MOCK_USERS: Record<Role, User> = {
  OWNER: { id: 1, email: 'owner@club.test', full_name: 'Meera Iyer', role: 'OWNER', member_id: null },
  MANAGER: { id: 2, email: 'manager@club.test', full_name: 'Ravi Kumar', role: 'MANAGER', member_id: null },
  FRONT_DESK: { id: 3, email: 'desk@club.test', full_name: 'Arjun Singh', role: 'FRONT_DESK', member_id: null },
  BAR_STAFF: { id: 4, email: 'bar@club.test', full_name: 'Sana Mirza', role: 'BAR_STAFF', member_id: null },
  MEMBER: { id: 5, email: 'member1@club.test', full_name: 'Karan Shah', role: 'MEMBER', member_id: 1 },
}

// ── Context ────────────────────────────────────────────────────────────────
export const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On initial mount: restore session via HttpOnly refresh cookie (SRS 3.2.1 & 7)
  useEffect(() => {
    let isMounted = true

    // Register callback for when refresh token expires during normal API requests
    setOnAuthFailure(() => {
      setAccessToken(null)
      setUser(null)
    })

    async function restoreSession() {
      try {
        const data = await refreshSession()
        if (data && isMounted) {
          setUser(data.user)
          setAccessToken(data.access_token)
        } else if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true' && !getAccessToken()) {
          // Dev convenience: default to OWNER only if explicitly requested
          setUser(MOCK_USERS.OWNER)
        }
      } catch {
        if (isMounted) {
          setUser(null)
          setAccessToken(null)
        }
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

  // Real login API call
  const login = useCallback(async (email: string, password: string): Promise<User> => {
    try {
      const response = await loginApi(email.trim(), password)
      setAccessToken(response.access_token)
      setUser(response.user)
      return response.user
    } catch (err: any) {
      // In DEV mode, if backend is offline and mocks enabled, support dev fallback
      if (
        import.meta.env.DEV &&
        (import.meta.env.VITE_USE_MOCKS === 'true' || err?.code === 'NETWORK_ERROR')
      ) {
        const emailLower = email.trim().toLowerCase()
        const found = Object.values(MOCK_USERS).find((u) => u.email.toLowerCase() === emailLower)
        const mockUser = found || (emailLower.includes('member') ? MOCK_USERS.MEMBER : MOCK_USERS.OWNER)
        setAccessToken('dev-mock-jwt-token')
        setUser(mockUser)
        return mockUser
      }
      throw err
    }
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

  // Dev role switcher (strictly gated by DEV mode)
  const switchRole = useCallback((role: Role) => {
    if (import.meta.env.DEV) {
      setUser(MOCK_USERS[role])
      setAccessToken('dev-mock-jwt-token')
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      switchRole,
    }),
    [user, isLoading, login, logout, switchRole],
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
