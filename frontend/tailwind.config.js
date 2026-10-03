/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Base Odoo palette tokens
        'brand-purple': '#875A7B',
        'surface-grey': '#8E8E8E',
        'accent-yellow': '#EAB14D',
        ink: '#141B2D',
        'on-purple': '#FFFFFF',

        // Derived shades
        'brand-purple-dark': '#714B67',
        'brand-purple-light': '#9C6E90',
        'surface-light': '#9E9E9E',
        'surface-dark': '#7E7E7E',
        'surface-input': '#FFFFFF',

        // Semantic surface mappings
        canvas: '#875A7B',     // Page background: brand-purple
        surface: '#8E8E8E',    // Cards, panels, tables, modals: surface-grey

        primary: {
          DEFAULT: '#EAB14D',  // accent-yellow
          hover: '#D99B35',
          light: '#FDF3DF',
          50: '#FDF3DF',
          100: '#FCE8C0',
          200: '#F9D68F',
          300: '#F6C45E',
          400: '#F0B849',
          500: '#EAB14D',      // primary button & key highlight
          600: '#D99B35',      // hover
          700: '#B87B1F',      // active/pressed
          800: '#8C5913',
          900: '#5A380A',
        },
        accent: {
          purple: '#875A7B',
          yellow: '#EAB14D',
          green: '#027A48',
          red: '#D92D20',
          teal: '#0E7490',
          orange: '#B54708',
          pink: '#C026D3',
        },
        text: {
          primary: '#141B2D',   // ink on grey surface
          secondary: '#141B2D', // ink (hierarchy via font weight/size)
          tertiary: '#141B2D',  // ink (darkened to meet contrast)
          muted: '#141B2D',
          inverse: '#FFFFFF',
          'on-purple': '#FFFFFF',
          'on-grey': '#141B2D',
          'on-yellow': '#141B2D',
        },
        border: {
          light: '#7E7E7E',     // visible border on surface-grey
          DEFAULT: '#7E7E7E',
          dark: '#141B2D',
          focus: '#FFFFFF',
        },
        status: {
          success: '#ECFDF3',
          'success-text': '#141B2D',
          'success-icon': '#027A48',
          warning: '#FFF7E6',
          'warning-text': '#141B2D',
          'warning-icon': '#B54708',
          error: '#FFF5F5',
          'error-text': '#141B2D',
          'error-icon': '#D92D20',
          info: '#F0F7FF',
          'info-text': '#141B2D',
          'info-icon': '#026AA2',
          pending: '#F9F5FF',
          'pending-text': '#141B2D',
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
