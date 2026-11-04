/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        // Extracted from the Jamaa Fast Food logo: deep red, golden yellow, warm charcoal.
        brand: {
          50: "#FFF3F3",
          100: "#FFE2E1",
          200: "#FFC7C6",
          300: "#F79C9B",
          400: "#E86262",
          500: "#D33A38",
          600: "#B91C23",
          700: "#95151C",
          800: "#7A1419",
          900: "#5F1115",
        },
        gold: {
          50: "#FFFAE8",
          100: "#FFF1C2",
          200: "#FFE28A",
          300: "#FFD24D",
          400: "#F2C230",
          500: "#E2A812",
          600: "#B9820C",
          700: "#8C600A",
        },
        ink: {
          50: "#F6F3F2",
          100: "#EBE4E3",
          200: "#D6CAC8",
          300: "#B0A19F",
          400: "#847472",
          500: "#5F5150",
          600: "#453838",
          700: "#332829",
          800: "#241A1B",
          900: "#170F10",
        },
        cream: "#FFF7F0",
        sand: "#F6E7D7",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque Variable"', "Plus Jakarta Sans Variable", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.75rem",
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgb(36 26 27 / 0.08), 0 12px 32px -12px rgb(36 26 27 / 0.12)",
        lift: "0 18px 45px -18px rgb(36 26 27 / 0.28)",
        glow: "0 16px 40px -16px rgb(185 28 35 / 0.55)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.6)", opacity: "0.9" },
          "80%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.4s ease both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        marquee: "marquee 26s linear infinite",
      },
    },
  },
  plugins: [],
};
