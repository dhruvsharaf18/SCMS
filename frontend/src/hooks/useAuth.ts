import { useContext } from 'react'
import { AuthContext, type AuthState } from '../lib/auth-context'

/**
 * Access the current auth state.
 *
 * In dev mode this exposes `switchRole()` to quickly change the active role
 * without logging in. In production the real JWT flow will replace the mock.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
