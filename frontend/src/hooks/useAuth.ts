import { useContext } from 'react'
import { AuthContext, type AuthState } from '../lib/auth-context'

/**
 * Access the current auth state. The user and role come from the server-side session;
 * changing role means logging out and signing in as a different account.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
