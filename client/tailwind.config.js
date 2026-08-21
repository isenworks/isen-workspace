/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f2ff',
          100: '#e0e6ff',
          200: '#bfd0ff',
          300: '#94b0ff',
          400: '#6a8cff',
          500: '#4b63f0',
          600: '#3a48c9',
          700: '#2f39a3',
          800: '#262e82',
          900: '#1e2466',
          950: '#121640'
        },
        ink: {
          50:  '#f7f8f8',
          100: '#ebedec',
          200: '#d4d9d8',
          300: '#b3bab8',
          400: '#8a9491',
          500: '#667370',
          700: '#3d4a47',
          900: '#0f1f1c'
        },
        surface: {
          base: '#f3f5f4',
          card: '#ffffff',
          soft: '#f7f9f8'
        },
        accent: {
          orange: '#f97316',
          red:    '#ef4444',
          amber:  '#f59e0b',
          green:  '#22c55e',
          blue:   '#4b63f0',
          gray:   '#9ca3af',
          pink:   '#f9a8a8'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card:  '0 1px 2px rgba(15,31,28,0.04), 0 4px 16px rgba(15,31,28,0.06)',
        cardL: '0 2px 6px rgba(15,31,28,0.06), 0 8px 32px rgba(15,31,28,0.08)'
      }
    }
  },
  plugins: []
};
