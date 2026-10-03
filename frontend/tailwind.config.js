/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: '#E8ECF3',
        surface: '#FFFFFF',
        primary: {
          DEFAULT: '#3B82F6',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        accent: {
          purple: '#8B5CF6',
          green: '#22C55E',
          yellow: '#F59E0B',
          red: '#EF4444',
          teal: '#14B8A6',
          orange: '#F97316',
          pink: '#EC4899',
        },
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
          tertiary: '#94A3B8',
          inverse: '#FFFFFF',
        },
        border: {
          light: '#E2E8F0',
          DEFAULT: '#CBD5E1',
          focus: '#3B82F6',
        },
        status: {
          success: '#DCFCE7',
          'success-text': '#166534',
          warning: '#FEF9C3',
          'warning-text': '#854D0E',
          error: '#FEE2E2',
          'error-text': '#991B1B',
          info: '#DBEAFE',
          'info-text': '#1E40AF',
          pending: '#F3E8FF',
          'pending-text': '#6B21A8',
        },
      },
      borderRadius: {
        'shell': '32px',
        '4xl': '2rem',
      },
      boxShadow: {
        'soft': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        'card': '0 2px 8px -2px rgba(0, 0, 0, 0.06), 0 4px 16px -4px rgba(0, 0, 0, 0.04)',
        'raised': '0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.06)',
        'modal': '0 8px 32px -4px rgba(0, 0, 0, 0.12), 0 16px 48px -8px rgba(0, 0, 0, 0.08)',
        'rail': '0 2px 16px -4px rgba(0, 0, 0, 0.08)',
        'pill': '0 1px 4px 0 rgba(0, 0, 0, 0.06)',
      },
      spacing: {
        'rail': '4.5rem',     // 72px — icon rail width
        'topbar': '4rem',     // 64px — top bar height
        'bottombar': '4rem',  // 64px — mobile bottom bar
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-right': 'slideRight 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
        'toast-in': 'toastIn 0.3s ease-out',
        'toast-out': 'toastOut 0.3s ease-in forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        toastIn: {
          '0%': { opacity: '0', transform: 'translateY(-12px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        toastOut: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-12px) scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
}
