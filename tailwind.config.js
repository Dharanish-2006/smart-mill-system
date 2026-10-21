/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: {
          950: '#14171a',
          900: '#1c2024',
          800: '#252a30',
          700: '#2f353c',
          600: '#3b424a',
          500: '#59626c',
          400: '#8a949f',
          300: '#b4bcc4',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
