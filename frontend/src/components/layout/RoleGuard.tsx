import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { Role } from '../../lib/auth-context'

export interface RoleGuardProps {
  /** Allowed roles. If empty, any authenticated user is allowed. */
  allowed?: Role[]
  children: ReactNode
}

/**
 * Guards a route tree by role.
 * - Not authenticated → redirect to /login
 * - Authenticated but wrong role → redirect to home for that role
 */
export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (allowed && allowed.length > 0 && !allowed.includes(user.role)) {
    // Send to the appropriate home for their role
    const home = user.role === 'MEMBER' ? '/portal' : '/staff'
    return <Navigate to={home} replace />
  }

  return <>{children}</>
}
