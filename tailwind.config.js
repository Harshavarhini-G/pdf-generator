/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: '#1b2540',
        paper: '#eef4fe',
        rule: '#d9deea',
        brand: { DEFAULT: '#2f5bea', dark: '#2147c4', soft: '#e8eefe' },
        margin: '#c73e3e',
      },
    },
  },
  plugins: [],
}
