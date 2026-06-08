/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6C63FF', accent: '#43CFFF', secondary: '#FF6584', success: '#00D4AA', warning: '#FFB347', danger: '#FF4757'
      },
      boxShadow: { glass: '0 8px 32px rgba(108,99,255,0.20)' },
      fontFamily: { ui: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
      keyframes: { shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } }, spinAngle: { '0%': { '--angle': '0deg' }, '100%': { '--angle': '360deg' } } },
      animation: { shimmer: 'shimmer 2s linear infinite', spinAngle: 'spinAngle 3s linear infinite' }
    }
  },
  plugins: []
};
