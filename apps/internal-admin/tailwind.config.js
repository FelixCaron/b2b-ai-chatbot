/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Kept as the near-black "ink" scale for text/icons on the new white
        // theme (dorafi rebrand) — these hex values used to be the app's dark
        // backgrounds, but were never used for text, so repurposing them here
        // is collision-free. Use `text-dark-900/700/600` for body/muted text.
        dark: {
          900: '#0b0f19',
          800: '#111827',
          700: '#1f2937',
          600: '#374151'
        },
        // Light backgrounds/surfaces for the white theme, replacing the old
        // `bg-dark-*` background usages (white → light gray, by "depth").
        surface: {
          50: '#ffffff',
          100: '#f7f8fb',
          200: '#eef0f5',
          300: '#e1e5ed',
          400: '#c9cfdb'
        },
        // dorafi's mark is monochrome ink-on-white, so `brand` is a navy ramp
        // (no more indigo) — mirrors apps/admin/tailwind.config.js exactly.
        brand: {
          50: '#eef2f9',
          100: '#dbe3f0',
          200: '#b3c1dc',
          300: '#8296c2',
          400: '#5870a3',
          500: '#3c5484',
          600: '#293f68',
          700: '#1e2f4f',
          800: '#16233b',
          900: '#101a2c',
          950: '#0a111c'
        }
      }
    },
  },
  plugins: [],
}
