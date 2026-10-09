// Config Tailwind du portfolio : génère assets/css/tailwind.css (fichier statique servi par GitHub Pages).
// À relancer après avoir ajouté ou modifié des classes Tailwind dans index.html :
//   npx tailwindcss@3.4.17 -o assets/css/tailwind.css --minify

// Couleurs branchées sur les variables CSS du thème (Lune / Soleil), voir style.css
const tone = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
    content: ['./index.html', './assets/js/**/*.js'],
    theme: {
        extend: {
            colors: {
                white: tone('--ink'),
                onsun: tone('--on-accent'),
                space: { 950: tone('--night'), 900: tone('--night-900'), 800: tone('--night-800'), 700: tone('--night-700') },
                gold: { 300: tone('--accent-300'), 400: tone('--accent-400'), 500: tone('--accent-500'), 600: tone('--accent-600') },
                moon: { 300: tone('--moon-300'), 400: tone('--moon-400'), 500: tone('--moon-500') },
            },
            fontFamily: {
                display: ['Roboto', 'system-ui', 'sans-serif'],
                sans: ['Roboto', 'system-ui', 'sans-serif'],
            },
        },
    },
};
