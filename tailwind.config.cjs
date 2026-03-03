/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./App.{js,ts,jsx,tsx}",
    "./index.{js,ts,jsx,tsx}",

    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};