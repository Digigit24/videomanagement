/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {},
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'intro-glow': {
          '0%': { opacity: '0', transform: 'scale(0.8)', filter: 'blur(10px)' },
          '30%': { opacity: '1', transform: 'scale(1.05)', filter: 'blur(0px)' },
          '60%': { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)' },
          '100%': { opacity: '0', transform: 'scale(1.1)', filter: 'blur(5px)' },
        },
        'intro-line': {
          '0%': { width: '0', opacity: '0' },
          '20%': { opacity: '1' },
          '50%': { width: '80px' },
          '100%': { width: '80px', opacity: '0' },
        },
        'intro-subtitle': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '30%': { opacity: '1', transform: 'translateY(0)' },
          '70%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'intro-particles': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '50%': { opacity: '0.6' },
          '100%': { opacity: '0', transform: 'scale(2)' },
        },
        'skip-ripple': {
          '0%': { opacity: '0.5', transform: 'scale(0.8)' },
          '100%': { opacity: '0', transform: 'scale(1.5)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.4s ease-out',
        'fade-in-down': 'fade-in-down 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'bounce-subtle': 'bounce-subtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'intro-glow': 'intro-glow 3s ease-in-out forwards',
        'intro-line': 'intro-line 3s ease-in-out forwards',
        'intro-subtitle': 'intro-subtitle 3s ease-in-out forwards',
        'intro-particles': 'intro-particles 2s ease-out forwards',
        'skip-ripple': 'skip-ripple 0.6s ease-out forwards',
      },
    },
  },
  plugins: [],
}
