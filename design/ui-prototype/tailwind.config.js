const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    containers: { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' },
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), sunken: c('sunken'), line: c('line'),
        ink: c('ink'), ink2: c('ink-2'), ink3: c('ink-3'),
        brand: c('brand'), brandink: c('brand-ink'),
        ok: c('ok'), warn: c('warn'), bad: c('bad'), info: c('info'),
      },
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      opacity: { 8: '.08', 12: '.12', 15: '.15', 35: '.35', 45: '.45', 85: '.85' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 1px rgb(var(--shadow) / 0.04)',
        pop: '0 12px 32px -8px rgb(var(--shadow) / 0.22), 0 4px 10px -4px rgb(var(--shadow) / 0.12)',
      },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        sheet: { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        pop: { '0%': { transform: 'scale(.6)', opacity: 0 }, '60%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
      },
      animation: {
        rise: 'rise .28s cubic-bezier(.2,.7,.2,1) both', fade: 'fade .2s ease both',
        sheet: 'sheet .28s cubic-bezier(.2,.8,.2,1) both', pop: 'pop .45s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [require('@tailwindcss/container-queries')],
};
