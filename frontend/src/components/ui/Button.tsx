import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Render as a rounded-full pill */
  pill?: boolean
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  children?: ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-500 text-ink hover:bg-primary-600 active:bg-primary-700 shadow-pill font-bold',
  secondary:
    'bg-transparent text-ink border-2 border-ink hover:bg-surface-light active:bg-surface-dark shadow-soft font-semibold',
  ghost:
    'text-ink hover:bg-surface-light active:bg-surface-dark font-medium',
  danger:
    'bg-status-error text-ink border border-accent-red hover:bg-red-100 active:bg-red-200 shadow-pill font-bold',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      pill = false,
      icon: Icon,
      iconRight: IconRight,
      loading,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          pill ? 'rounded-full' : 'rounded-xl',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        )}
        {children}
        {IconRight && !loading && (
          <IconRight size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        )}
      </button>
    )
  },
)

Button.displayName = 'Button'
