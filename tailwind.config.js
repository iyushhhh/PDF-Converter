// /** @type {import('tailwindcss').Config} */
// module.exports = {
//   content: [],
//   theme: {
//     extend: {},
//   },
//   plugins: [],
// }

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
    "./views/**/*.{html,js,ejs}",
    "./*.html",
    "./js/**/*.js"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}