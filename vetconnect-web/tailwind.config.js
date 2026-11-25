/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Golos Text", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        // Paleta cálida: café oscuro + coral sobre crema
        espresso: { DEFAULT: "#3C2219", light: "#4B332B" },
        coral: { DEFAULT: "#F38660", dark: "#E06E47", soft: "#FCE3D9" },
        cream: { DEFAULT: "#FDF6EE", deep: "#F8EEE2" },
        muted: { DEFAULT: "#897770", light: "#B29C94" },
        line: "#E3D6D1",
      },
      borderRadius: { "4xl": "2rem" },
    },
  },
  plugins: [],
};
