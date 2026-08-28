/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* iOS Blue 知力主色 */
        brand: {
          50:  '#F0F6FF',
          100: '#DCEBFF',
          200: '#B5D4FF',
          300: '#84B5FF',
          400: '#4F90FF',
          500: '#007AFF',
          600: '#0062CC',
          700: '#004FA3',
          800: '#003E80',
          900: '#002E5E',
          950: '#001C3D'
        },
        ink: {
          50:  '#f7f8f8',
          100: '#ebedec',
          200: '#d4d9d8',
          300: '#b3bab8',
          400: '#8a9491',
          500: '#667370',
          600: '#4d5a57',
          700: '#3d4a47',
          800: '#2a3431',
          900: '#0f1f1c'
        },
        surface: {
          base: '#f3f5f4',
          card: '#ffffff',
          soft: '#f7f9f8'
        },
        /* iOS System Colors — 统一五维度主题色 + 状态色
         * DEFAULT 让 text-accent-green / bg-accent-green/10 无后缀类也能工作
         * -500/-600/... 让 text-accent-green-500 等 scale 类也能工作 */
        accent: {
          /* 精力 Green */
          green: {
            DEFAULT: '#34C759',
            50:  '#EDFAF1',
            100: '#D5F2DF',
            200: '#ADE5C2',
            300: '#7ED6A0',
            400: '#5BC886',
            500: '#34C759',
            600: '#2DB24E',
            700: '#238E3F',
            800: '#1B6E31',
            900: '#134F24',
            950: '#0B2F15'
          },
          /* 工作 Red */
          red: {
            DEFAULT: '#FF3B30',
            50:  '#FFEEED',
            100: '#FFD9D6',
            200: '#FFB5AF',
            300: '#FF8E85',
            400: '#FF695D',
            500: '#FF3B30',
            600: '#E6352B',
            700: '#B82A22',
            800: '#8E201B',
            900: '#661713',
            950: '#3D0E0B'
          },
          /* 能力 Orange */
          orange: {
            DEFAULT: '#FF9500',
            50:  '#FFF3E8',
            100: '#FFE4CC',
            200: '#FFC899',
            300: '#FFAE66',
            400: '#FFB84D',
            500: '#FF9500',
            600: '#E68600',
            700: '#B36900',
            800: '#804B00',
            900: '#4D2D00',
            950: '#1F1200'
          },
          /* 能力 Amber (别名) */
          amber: {
            DEFAULT: '#FF9500',
            500: '#FF9500',
            600: '#E68600',
            700: '#B36900',
          },
          /* 知力 Blue */
          blue: {
            DEFAULT: '#007AFF',
            50:  '#F0F6FF',
            100: '#DCEBFF',
            200: '#B5D4FF',
            300: '#84B5FF',
            400: '#4F90FF',
            500: '#007AFF',
            600: '#0062CC',
            700: '#004FA3',
            800: '#003E80',
            900: '#002E5E',
            950: '#001C3D'
          },
          /* 生活 Purple */
          purple: {
            DEFAULT: '#AF52DE',
            50:  '#F6EEFB',
            100: '#ECDDF7',
            200: '#D8BBEF',
            300: '#C498E7',
            400: '#B77FE3',
            500: '#AF52DE',
            600: '#9C48C7',
            700: '#7D3AA0',
            800: '#5F2C7A',
            900: '#431F55',
            950: '#251130'
          },
          gray:   '#8E8E93',
          pink:   '#F9A8A8'
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
