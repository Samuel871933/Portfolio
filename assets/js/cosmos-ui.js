// Interface du portfolio « Éclipse » : trajectoire de navigation, fondus au défilement, machine à écrire.
// La scène 3D est gérée à part (cosmos.js).
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x) => Math.min(1, Math.max(0, x));

// ---------- Machine à écrire ----------
const typed = document.getElementById('typed');
const words = JSON.parse(typed.dataset.words);
if (reduced) typed.textContent = words[0];
else {
    let w = 0, c = 0, deleting = false;
    const type = () => {
        c += deleting ? -1 : 1;
        typed.textContent = words[w].substring(0, c);
        let delay = deleting ? 45 : 95;
        if (!deleting && c === words[w].length) { delay = 2000; deleting = true; }
        else if (deleting && c === 0) { deleting = false; w = (w + 1) % words.length; delay = 400; }
        setTimeout(type, delay);
    };
    type();
}

document.getElementById('year').textContent = new Date().getFullYear();

// ---------- Trajectoire : chapitre actif et remplissage jusqu'à lui ----------
const railLinks = [...document.querySelectorAll('.rail a')];
const chapters = railLinks.map((a) => document.querySelector(a.getAttribute('href')));
const rail = document.querySelector('.rail');

// ---------- Entrées : titres qui se lèvent, filets qui se dessinent (une seule fois) ----------
const seen = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); }
}, { threshold: .2 });
document.querySelectorAll('.line, .label').forEach((el) => seen.observe(el));
// Les titres masqués (clip-path) n'ont pas de surface visible : l'observateur ne les verrait jamais entrer
let rises = [...document.querySelectorAll('.rise')];

// ---------- Parcours : la trajectoire se trace au défilement et allume les étapes atteintes ----------
const path = document.querySelector('.path');
const steps = [...path.children];

// ---------- Fondus : chaque élément apparaît en entrant par le bas et s'efface en sortant par le haut ----------
const fx = [...document.querySelectorAll('.fx')];

function update() {
    const vh = innerHeight, mid = scrollY + vh / 2;
    const tops = chapters.map((el) => el.getBoundingClientRect().top + scrollY);
    let i = Math.max(0, tops.findLastIndex((t) => mid >= t));
    // Entre deux chapitres, la ligne avance au prorata du défilement
    const next = tops[i + 1];
    const within = next === undefined ? 0 : clamp((mid - tops[i]) / (next - tops[i]));
    rail.style.setProperty('--fill', ((i + within) / (chapters.length - 1)).toFixed(4));
    railLinks.forEach((a, k) => { a.classList.toggle('active', k === i); a.classList.toggle('passed', k < i); });

    rises = rises.filter((el) => el.getBoundingClientRect().top < vh * .88 ? (el.classList.add('in'), false) : true);

    // Le trait suit une ligne aux deux tiers de l'écran
    const pr = path.getBoundingClientRect(), reach = vh * .66;
    path.style.setProperty('--draw', reduced ? 1 : clamp((reach - pr.top) / pr.height).toFixed(4));
    for (const li of steps) li.classList.toggle('reached', li.getBoundingClientRect().top < reach);

    if (reduced) return;
    for (const el of fx) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -50 || r.top > vh + 50) continue;
        const enter = clamp((vh - r.top) / (vh * .22));
        const leave = clamp((r.bottom - vh * .06) / (vh * .2));
        const o = Math.min(enter, leave);
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateY(${((1 - enter) * 40).toFixed(1)}px)`;
    }
}

// ---------- Projets : la capture survolée s'affiche au centre de l'écran, cliquable ----------
// Élément unique hors de <main> : les lignes ont un transform (fondus), qui casserait un position: fixed
const preview = document.querySelector('.work-preview');
const previewImg = preview.querySelector('img');
const previewShot = preview.querySelector('.work-preview-shot');
const previewLinks = preview.querySelector('.work-links');
let hideTimer = 0;
const hidePreview = () => { hideTimer = setTimeout(() => preview.classList.remove('on'), 80); };
for (const work of document.querySelectorAll('.work')) {
    const show = () => {
        clearTimeout(hideTimer);
        const img = work.querySelector('.work-shot img');
        previewImg.src = img.currentSrc || img.src;
        previewShot.href = work.querySelector('.work-main').href;
        // Les liens du projet sous la capture : l'aperçu masque ceux de la ligne
        previewLinks.replaceChildren(...[...work.querySelectorAll('.work-links a')].map((a) => {
            const copy = a.cloneNode(true);
            copy.tabIndex = -1;
            return copy;
        }));
        preview.classList.add('on');
    };
    work.addEventListener('mouseenter', show);
    work.addEventListener('focusin', show);
    work.addEventListener('mouseleave', hidePreview);
    work.addEventListener('focusout', hidePreview);
}
preview.addEventListener('mouseenter', () => clearTimeout(hideTimer));
preview.addEventListener('mouseleave', hidePreview);
// On défile : l'aperçu ne reste que si la souris est encore sur un projet
addEventListener('scroll', () => { if (!document.querySelector('.work:hover')) preview.classList.remove('on'); }, { passive: true });

let queued = 0;
const queue = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; update(); }); };
addEventListener('scroll', queue, { passive: true });
addEventListener('resize', queue);
update();
