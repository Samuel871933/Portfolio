// Navigation : fond au scroll + lien actif
const nav = document.getElementById('nav');
const links = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('main section[id]');

const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);

    let current = '';
    sections.forEach((section) => {
        if (window.scrollY >= section.offsetTop - 120) current = section.id;
    });
    links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
};
// Au plus un calcul par image affichée, quel que soit le nombre d'événements scroll
let navFrame = 0;
window.addEventListener('scroll', () => {
    if (navFrame) return;
    navFrame = requestAnimationFrame(() => { navFrame = 0; onScroll(); });
}, { passive: true });
onScroll();

// Menu mobile
const menuBtn = document.getElementById('menu-btn');
const toggleMenu = (open) => {
    nav.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
};
menuBtn.addEventListener('click', () => toggleMenu(!nav.classList.contains('menu-open')));
document.querySelectorAll('.mobile-link').forEach((link) => link.addEventListener('click', () => toggleMenu(false)));

// Texte animé (machine à écrire)
const typed = document.getElementById('typed');
const words = JSON.parse(typed.dataset.words);
let wordIndex = 0;
let charIndex = 0;
let deleting = false;

const type = () => {
    const word = words[wordIndex];
    charIndex += deleting ? -1 : 1;
    typed.textContent = word.substring(0, charIndex);

    let delay = deleting ? 50 : 100;
    if (!deleting && charIndex === word.length) {
        delay = 2000;
        deleting = true;
    } else if (deleting && charIndex === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        delay = 400;
    }
    setTimeout(type, delay);
};
// Animations réduites demandées : premier mot affiché d'un coup, sans boucle
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) typed.textContent = words[0];
else type();

// Apparition au scroll
const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
    });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// Année du footer
document.getElementById('year').textContent = new Date().getFullYear();

// Bascule Soleil / Lune : la lumière (ou l'ombre) se propage depuis le bouton
const root = document.documentElement;
const themeBtn = document.getElementById('theme-btn');
const themeColor = document.querySelector('meta[name="theme-color"]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Ambiance au défilement : l'accent glisse entre l'or et l'argent.
// Lune : crépuscule (or en haut → lune en bas). Soleil : aube (lune en haut → or en bas).
const SHADES = [300, 400, 500, 600];
let palette = null;
let lastSunAmount = -1;

const readRgb = (styles, name) => styles.getPropertyValue(name).trim().split(/\s+/).map(Number);
const readPalette = (el) => {
    const styles = getComputedStyle(el);
    return {
        sun: SHADES.map((s) => readRgb(styles, `--sun-${s}`)),
        moon: SHADES.map((s) => readRgb(styles, `--moon-${s}`)),
        onSun: readRgb(styles, '--on-sun'),
        background: readRgb(styles, '--bg-sun'),
        bgSun: readRgb(styles, '--bg-sun'),
        bgMoon: readRgb(styles, '--bg-moon'),
    };
};
const luminance = (rgb) => rgb
    .map((c) => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
// Texte posé sur l'accent : encre « soleil » ou couleur du fond, selon le plus lisible
const onColor = (bg, { onSun, background }) => (contrast(bg, onSun) >= contrast(bg, background) ? onSun : background);

const setAccent = (amount) => {
    const mixed = SHADES.map((_, i) => palette.moon[i].map((m, c) => Math.round(m + (palette.sun[i][c] - m) * amount)));
    SHADES.forEach((s, i) => root.style.setProperty(`--accent-${s}`, mixed[i].join(' ')));
    root.style.setProperty('--on-accent', onColor(mixed[2], palette).join(' '));
};

const updateAmbience = (force = false) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const progress = max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0;
    const eased = progress * progress * (3 - 2 * progress);
    const sunAmount = root.dataset.theme === 'day' ? eased : 1 - eased;
    if (!force && Math.abs(sunAmount - lastSunAmount) < 0.004) return;
    lastSunAmount = sunAmount;

    setAccent(sunAmount);
    // Halos, étoiles et teinte du fond découlent de --sun-amt (voir style.css)
    root.style.setProperty('--sun-amt', sunAmount.toFixed(3));
    root.style.setProperty('--night', palette.bgMoon.map((m, c) => Math.round(m + (palette.bgSun[c] - m) * sunAmount)).join(' '));
};

let ambienceFrame = 0;
const queueAmbience = () => {
    if (ambienceFrame) return;
    ambienceFrame = requestAnimationFrame(() => { ambienceFrame = 0; updateAmbience(); });
};
window.addEventListener('scroll', queueAmbience, { passive: true });
window.addEventListener('resize', queueAmbience, { passive: true });

const applyTheme = (theme) => {
    root.dataset.theme = theme;
    themeBtn.setAttribute('aria-label', theme === 'day' ? 'Passer au thème Lune' : 'Passer au thème Soleil');
    themeColor.setAttribute('content', theme === 'day' ? '#f6f1e6' : '#06070d');
    try { localStorage.setItem('theme', theme); } catch (e) {}
    palette = readPalette(root);
    updateAmbience(true);
};
applyTheme(root.dataset.theme === 'day' ? 'day' : 'night');

themeBtn.addEventListener('click', () => {
    const next = root.dataset.theme === 'day' ? 'night' : 'day';
    if (!document.startViewTransition || reducedMotion.matches) return applyTheme(next);

    const { left, top, width, height } = themeBtn.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    document.startViewTransition(() => applyTheme(next)).ready.then(() => {
        root.animate(
            { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 900, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' },
        );
    });
});

// Halo de lumière qui suit le pointeur sur les cartes
document.querySelectorAll('.lit').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
    el.addEventListener('pointerleave', () => {
        el.style.removeProperty('--mx');
        el.style.removeProperty('--my');
    });
});
