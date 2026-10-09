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
window.addEventListener('scroll', onScroll, { passive: true });
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
type();

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
