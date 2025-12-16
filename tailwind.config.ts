import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000', // True Black
        surface: '#121212', // Darker Surface
        surfaceHover: '#1E1E1E',
        border: '#27272A', // Zinc 800
        primary: '#EC4899', // Pink 500 (Neon Pink)
        primaryHover: '#DB2777', // Pink 600
        secondary: '#A1A1AA', // Zinc 400
        accent: '#F472B6', // Pink 400
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 25px -5px rgba(236, 72, 153, 0.3)', // Pink glow
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.3s ease-out forwards',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        }
      }
    },
  },
  plugins: [],
};
export default config;