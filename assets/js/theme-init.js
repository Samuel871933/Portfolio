// Thème mémorisé appliqué avant le premier rendu (pas de flash).
// Chargé de façon bloquante dans le <head> ; fichier séparé pour respecter la CSP (pas de script inline).
try { document.documentElement.dataset.theme = localStorage.getItem('theme') === 'day' ? 'day' : 'night'; } catch (e) {}
