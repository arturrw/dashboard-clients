/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-faint)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        gold: 'var(--gold)',
        'gold-soft': 'var(--gold-soft)',
        clay: 'var(--clay)',
        'clay-soft': 'var(--clay-soft)',
        steel: 'var(--steel)',
        'steel-soft': 'var(--steel-soft)',
        'flag-high': 'var(--flag-high)',
        'flag-high-soft': 'var(--flag-high-soft)',
        'flag-vip': 'var(--flag-vip)',
        'flag-vip-soft': 'var(--flag-vip-soft)'
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
      boxShadow: {
        card: '0 1px 2px rgba(28,26,23,.04), 0 1px 1px rgba(28,26,23,.03)',
        pop: '0 12px 32px -8px rgba(28,26,23,.18), 0 2px 8px rgba(28,26,23,.06)',
        drag: '0 18px 40px -10px rgba(28,26,23,.32)'
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(2px)' }, to: { opacity: 1, transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(.97)' }, to: { opacity: 1, transform: 'none' } }
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'scale-in': 'scale-in 140ms cubic-bezier(.16,1,.3,1)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
