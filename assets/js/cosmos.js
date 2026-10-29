// Scène « Éclipse » : toute l'histoire est une fonction du scroll p ∈ [0, 1],
// donc on peut remonter / redescendre sans état à rejouer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const IMG = 'assets/img/cosmos/';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = innerWidth < 768;

// ---------- Outils ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const smooth = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
console.assert(seg(.5, 0, 1) === .5 && seg(2, 0, 1) === 1 && seg(-1, 0, 1) === 0, 'seg');

// Bruit de valeur 3D (JS) pour sculpter les roches
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
    const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
    return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
                lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm3(x, y, z, oct) { let s = 0, a = .5; for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= .5; } return s; }

// Bruit GLSL partagé (anneaux de la supernova)
const GLSL_NOISE = `
    float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= .5; } return s; }`;

const ACTS = [['terre', 0], ['decollage', .08], ['ballet', .25], ['collision', .4], ['supernova', .55], ['vide', .66], ['residus', .78], ['retour', .9]];
let currentAct = '';
// Accroche pour le son plus tard : appelé à chaque changement d'acte.
function onAct(name) {}

// ---------- Rendu ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06070d);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .05, 2000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .8, .6, .55);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// Grain de pellicule + vignettage, pour la texture « cinéma »
const film = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
        float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
        c.rgb += (rand(vUv * 900. + fract(uTime)) - .5) * .05;
        c.rgb *= smoothstep(1.15, .35, length(vUv - .5) * 1.4);
        gl_FragColor = c; }`,
});
composer.addPass(film);

// Texture facultative : la scène marche avec les couleurs de repli tant que l'image n'existe pas.
const loader = new THREE.TextureLoader();
function tex(file, onLoad) {
    loader.load(IMG + file, t => { t.colorSpace = THREE.SRGBColorSpace; onLoad(t); }, undefined, () => {});
}

function glowTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, inner);
    grd.addColorStop(.25, outer);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
}
const dot = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,.5)');
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const glowSprite = (map, color, scale) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, ...additive }));
    s.scale.setScalar(scale);
    return s;
};

// Faisceau conique qui s'estompe vers la pointe et sur les bords (jets de la supernova)
function beamMat(rgb) {
    return new THREE.ShaderMaterial({
        uniforms: { uAlpha: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying float vF;
            void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.);
            vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uAlpha; varying vec2 vUv; varying float vF;
            void main(){ float a = pow(1. - vUv.y, 2.) * pow(vF, 2.) * uAlpha; gl_FragColor = vec4(vec3(${rgb.map(v => v.toFixed(2))}) * a, a); }`,
        side: THREE.DoubleSide, ...additive,
    });
}

// Répartit n points dans une coquille sphérique [r0, r1]
function shell(n, r0, r1) {
    const a = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) v.randomDirection().multiplyScalar(lerp(r0, r1, Math.random())).toArray(a, i * 3);
    return a;
}

// Traînée de particules le long d'une trajectoire path(u) : tête en u, queue en u - len
class Trail {
    constructor(n, rgb, size) {
        this.n = n;
        this.k = Float32Array.from({ length: n }, (_, i) => i / (n - 1));
        this.jit = shell(n, 0, 1);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        g.setAttribute('k', new THREE.BufferAttribute(this.k, 1));
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uAlpha: { value: 0 }, uHead: { value: 1 } },
            vertexShader: `attribute float k; uniform float uHead; varying float vA;
                void main(){ vA = pow(1. - k, 1.6) * step(k, uHead); vec4 mv = modelViewMatrix * vec4(position, 1.);
                gl_PointSize = ${size.toFixed(1)} * (1. - k * .6) * 300. / -mv.z; gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `uniform float uAlpha; varying float vA;
                void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA * uAlpha;
                gl_FragColor = vec4(vec3(${rgb.map(v => v.toFixed(2))}) * a, a); }`,
            ...additive,
        });
        this.points = new THREE.Points(g, this.mat);
        this.points.frustumCulled = false;
        scene.add(this.points);
    }
    update(path, head, len, spread, alpha) {
        const pos = this.points.geometry.attributes.position, v = new THREE.Vector3();
        // uHead masque les points qui seraient avant le départ de la trajectoire
        this.mat.uniforms.uHead.value = head / len;
        for (let i = 0; i < this.n; i++) {
            const k = this.k[i];
            path(Math.max(0, head - k * len), v);
            v.x += this.jit[i * 3] * spread * k; v.y += this.jit[i * 3 + 1] * spread * k; v.z += this.jit[i * 3 + 2] * spread * k;
            v.toArray(pos.array, i * 3);
        }
        pos.needsUpdate = true;
        this.mat.uniforms.uAlpha.value = alpha;
        this.points.visible = alpha > 0;
    }
}

// Panache de gaz incandescent : tube 3D qui enveloppe la Lune et suit sa trajectoire path(u).
// Transparence selon l'angle de vue (cœur dense, bords diaphanes) et bruit qui s'écoule vers la queue.
class Plume {
    constructor(n, m = 20) {
        // m + 1 sommets par anneau : la couture est doublée, sinon les UV rebouclent sur une seule facette (stries)
        this.n = n; this.m = m; const M = m + 1;
        this.p = Array.from({ length: n }, () => new THREE.Vector3());
        const uv = new Float32Array(n * M * 2), idx = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) {
            uv.set([i / (n - 1), j / m], (i * M + j) * 2);
            if (i < n - 1 && j < m) {
                const a = i * M + j;
                idx.push(a, a + M, a + 1, a + 1, a + M, a + M + 1);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * M * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * M * 3), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(idx);
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uAlpha: { value: 0 }, uHead: { value: 1 }, uTime: { value: 0 }, uStart: { value: 0 } },
            vertexShader: `varying vec2 vUv; varying float vF;
                void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.);
                vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `uniform float uAlpha, uHead, uTime, uStart; varying vec2 vUv; varying float vF; ${GLSL_NOISE}
                void main(){
                    float k = vUv.x;
                    if (k > uHead) discard;
                    vec2 ring = vec2(cos(vUv.y * 6.2832), sin(vUv.y * 6.2832));
                    // Grosses poches + volutes moyennes : densité irrégulière, avec des trous
                    float n1 = fbm(vec2(k * 6. - uTime * .7, 0.) + ring * .9);
                    float n2 = fbm(vec2(k * 22. - uTime * 2., k * 5.) + ring * 1.6);
                    float n3 = fbm(vec2(k * 55. - uTime * 3.5, 3.) + ring * 2.5);
                    float dens = smoothstep(.4, .85, .55 * n1 + .65 * n2) * (.55 + .9 * n3);
                    // Gaz arraché au ras de la Lune : plus dense et plus chaud
                    float head = exp(-max(k - uStart, 0.) * 22.);
                    float a = ((.25 * vF + pow(vF, 3.)) * dens * pow(1. - k, 1.3) + head * pow(vF, 2.) * .2)
                        * smoothstep(uStart, uStart + .015, k) * .6 * uAlpha;
                    vec3 c = mix(vec3(1.25, .8, .35), vec3(.95, .48, .12), smoothstep(0., .25, k));
                    c = mix(c, vec3(.35, .11, .03), smoothstep(.3, .85, k));
                    gl_FragColor = vec4(c * a, a);
                }`,
            side: THREE.DoubleSide, ...additive,
        });
        this.mesh = new THREE.Mesh(g, this.mat);
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }
    // radius : rayon en tête (celui de la Lune), le tube s'évase vers la queue
    update(path, head, len, radius, alpha, time) {
        const { n, m, p } = this, geo = this.mesh.geometry, pos = geo.attributes.position, nor = geo.attributes.normal;
        const t = new THREE.Vector3(), N = new THREE.Vector3(1, 0, 0), B = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
        for (let i = 0; i < n; i++) path(Math.max(0, head - i / (n - 1) * len), p[i]);
        for (let i = 0; i < n; i++) {
            t.subVectors(p[Math.max(i - 1, 0)], p[Math.min(i + 1, n - 1)]);
            // Points confondus au départ de la trajectoire : on garde le repère précédent
            if (t.lengthSq() > 1e-10) { N.crossVectors(t, UP).normalize(); B.crossVectors(N, t).normalize(); }
            // Plus étroit que la Lune en tête : le gaz sort de derrière son disque, collé à elle
            const r = radius * (.7 + 2.8 * (i / (n - 1)) ** .8);
            for (let j = 0; j <= m; j++) {
                const a = j / m * Math.PI * 2, o = (i * (m + 1) + j) * 3;
                d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
                d.toArray(nor.array, o);
                d.multiplyScalar(r).add(p[i]).toArray(pos.array, o);
            }
        }
        pos.needsUpdate = nor.needsUpdate = true;
        // Le gaz naît au bord arrière de la Lune, pas devant elle (sinon voile sur sa face)
        let s = 0;
        while (s < n - 1 && p[s].distanceTo(p[0]) < radius * .3) s++;
        this.mat.uniforms.uStart.value = s / (n - 1);
        this.mat.uniforms.uHead.value = head / len;
        this.mat.uniforms.uTime.value = time;
        this.mat.uniforms.uAlpha.value = alpha;
        this.mesh.visible = alpha > 0;
    }
}

// Tirage à graine fixe (Park-Miller) : la même scène à chaque chargement
const seededRandom = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;

// Roche sculptée : relief fbm + cratères avec rebord. Sphère indexée → pas de fissures entre triangles.
function rockGeometry(w, seed) {
    const g = new THREE.SphereGeometry(1, w, Math.round(w * .66)), pos = g.attributes.position, v = new THREE.Vector3();
    const rand = seededRandom(Math.round(seed * 1000));
    const craters = Array.from({ length: 12 }, () => ({ dir: V(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(), r: .12 + rand() * .4, depth: .03 + rand() * .09 }));
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        let r = 1 + .9 * (fbm3(v.x * .9 + seed, v.y * .9, v.z * .9, 3) - .5) + .25 * (fbm3(v.x * 2.6 + seed, v.y * 2.6, v.z * 2.6, 3) - .5) + .07 * (fbm3(v.x * 8 + seed, v.y * 8, v.z * 8, 2) - .5);
        for (const c of craters) {
            const t = v.distanceTo(c.dir) / c.r;
            if (t < 1) r -= c.depth * (1 - t * t);
            r += c.depth * .45 * Math.exp(-(((t - 1) * 5) ** 2));
        }
        v.multiplyScalar(r).toArray(pos.array, i * 3);
    }
    g.computeVertexNormals();
    return g;
}

// ---------- Astres ----------
const SUN_R = 5, ORBIT = 40, MOON_ORBIT = 6;

const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, .55) });
const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 32), sunMat);
tex('sun-map.webp', t => { t.wrapS = THREE.RepeatWrapping; sunMat.map = t; sunMat.color.setRGB(1.5, 1.25, 1); sunMat.needsUpdate = true; });
const halo = glowSprite(glowTexture('rgba(255,224,138,.55)', 'rgba(236,178,60,.22)'), 0xffffff, 34);
sun.add(halo);
const corona = glowSprite(glowTexture('rgba(255,190,90,.5)', 'rgba(200,110,30,.12)'), 0xffffff, 80);
sun.add(corona);

const flareGlow = glowTexture('rgba(255,240,200,1)', 'rgba(255,200,120,.2)');
const flare = new Lensflare();
flare.addElement(new LensflareElement(flareGlow, 220, 0, new THREE.Color(1, .85, .6)));
sun.add(flare);
scene.add(sun);

const sunLight = new THREE.PointLight(0xffe2a0, 3, 0, 0);
scene.add(sunLight);
const ambient = new THREE.AmbientLight(0x8a7a5a, .04);
scene.add(ambient);

// Position du Soleil en repère caméra, partagée par les shaders qui dépendent du côté jour / nuit
const sunView = { value: new THREE.Vector3() };
// 1 tant que le Soleil existe : après la supernova, plus de côté jour (villes allumées partout, atmosphère éteinte)
const sunAlive = { value: 1 };

// transparent : la Terre s'efface pendant que l'horizon dessiné monte, à la fin
const earthMat = new THREE.MeshStandardMaterial({ color: 0x1c2a44, roughness: .8, metalness: 0, emissive: 0xffc070, emissiveIntensity: 0, transparent: true });
const earth = new THREE.Mesh(new THREE.SphereGeometry(1.2, 96, 48), earthMat);
tex('earth-day.webp', t => { earthMat.map = t; earthMat.color.set(0xffffff); earthMat.needsUpdate = true; });
// Océans lisses : reflet du Soleil sur l'eau, continents mats
tex('earth-rough.webp', t => { t.colorSpace = THREE.NoColorSpace; earthMat.roughnessMap = t; earthMat.roughness = 1; earthMat.needsUpdate = true; });
// Lumières des villes, uniquement côté nuit (s'éteignent au terminateur)
tex('earth-lights.webp', t => { earthMat.emissiveMap = t; earthMat.needsUpdate = true; });
earthMat.onBeforeCompile = sh => {
    sh.uniforms.uSunView = sunView;
    sh.uniforms.uSunAlive = sunAlive;
    sh.fragmentShader = 'uniform vec3 uSunView; uniform float uSunAlive;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 1. - uSunAlive * smoothstep(-.15, .2, dot(normal, normalize(uSunView + vViewPosition)));`);
};
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.2 * 1.01, 96, 48), cloudMat);
tex('earth-clouds.webp', t => { t.colorSpace = THREE.NoColorSpace; cloudMat.alphaMap = t; cloudMat.userData.ready = true; cloudMat.needsUpdate = true; });
earth.add(clouds);
// Atmosphère : liseré fin éclairé par le Soleil, bleu côté jour, orangé au terminateur, éteint côté nuit
const earthAtmo = new THREE.Mesh(new THREE.SphereGeometry(1.2 * 1.015, 96, 48), new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 1 }, uSunView: sunView },
    vertexShader: `varying vec3 vN, vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uAlpha; uniform vec3 uSunView; varying vec3 vN, vV;
        void main(){
            float f = pow(1. - abs(dot(vN, normalize(-vV))), 4.);
            float d = dot(vN, normalize(uSunView - vV));
            vec3 c = mix(vec3(1.3, .5, .15), vec3(.35, .6, 1.25), smoothstep(-.05, .4, d));
            float a = f * smoothstep(-.3, .3, d) * uAlpha;
            gl_FragColor = vec4(c * a, a);
        }`,
    ...additive,
}));
earth.add(earthAtmo);
scene.add(earth);

const moonMat = new THREE.MeshStandardMaterial({ color: 0xb7c1d6, roughness: 1, emissive: 0x000000 });
const moon = new THREE.Mesh(new THREE.SphereGeometry(.4, 48, 24), moonMat);
// Clair de Terre : la face nocturne garde ses cratères quand la Lune passe devant le Soleil
// Relief : la texture sert aussi de carte de bosses, les cratères accrochent la lumière rasante
tex('moon-map.webp', t => { moonMat.map = moonMat.emissiveMap = moonMat.bumpMap = t; moonMat.bumpScale = 3; moonMat.color.set(0xffffff); moonMat.emissive.set(0x9fb0d0); moonMat.emissiveIntensity = EARTHSHINE; moonMat.needsUpdate = true; });
scene.add(moon);
const EARTHSHINE = .1, MOON_COLD = new THREE.Color(0x9fb0d0), MOON_HOT = new THREE.Color(0xff8a1c);

const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(shell(mobile ? 2000 : 4000, 500, 700), 3)),
    new THREE.PointsMaterial({ map: dot, color: 0xffffff, size: 2.5, sizeAttenuation: false, transparent: true, depthWrite: false })
);
scene.add(stars);

// ---------- Collision ----------
// Point d'impact sur le bord gauche du Soleil, vu de profil par la caméra
const IMPACT = V(-SUN_R, .6, 0);
const moonPlume = new Plume(mobile ? 80 : 140);
const impactGlow = glowSprite(flareGlow, 0xffc070, 0);
impactGlow.position.copy(IMPACT);
scene.add(impactGlow);

// ---------- Supernova : anneau perlé + deux arceaux + jets (façon SN 1987A) ----------
const remnant = new THREE.Group();
remnant.rotation.set(-1.05, .25, .3);
// L'anneau fait face à la Terre (position finale θ = 3.2, cf. placeEarth) : on le voit comme depuis +z
const remnantYaw = new THREE.Group();
remnantYaw.rotation.y = Math.atan2(Math.cos(3.2), Math.sin(3.2));
remnantYaw.add(remnant);
scene.add(remnantYaw);

function ringMat(inner, outer, width, seed) {
    return new THREE.ShaderMaterial({
        uniforms: { uAlpha: { value: 0 } },
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform float uAlpha; varying vec2 vP; ${GLSL_NOISE}
            void main(){
                float r = length(vP); vec2 d = vP / max(r, 1e-4);
                float n = fbm(d * 3. + r * 5. + ${seed.toFixed(1)});
                float beads = smoothstep(.42, .78, fbm(d * 9. + ${(seed * 2).toFixed(1)}));
                float band = exp(-pow((r - .6 - (n - .5) * .1) / ${width.toFixed(3)}, 2.));
                float haze = smoothstep(.62, .05, r) * fbm(d * 2.5 + r * 7. - ${seed.toFixed(1)}) * .07;
                float a = (band * (.2 + .8 * beads) + haze) * uAlpha;
                vec3 c = mix(vec3(${outer.map(v => v.toFixed(2))}), vec3(${inner.map(v => v.toFixed(2))}), clamp(band * beads * 1.5, 0., 1.));
                gl_FragColor = vec4(c * a, a);
            }`,
        side: THREE.DoubleSide, ...additive,
    });
}
const ringGeo = new THREE.PlaneGeometry(2, 2);
const mainRing = new THREE.Mesh(ringGeo, ringMat([1.25, 1.05, .8], [.7, .26, .06], .03, 3.1));
const arcA = new THREE.Mesh(ringGeo, ringMat([1.1, .85, .6], [.5, .2, .06], .014, 7.7));
const arcB = new THREE.Mesh(ringGeo, ringMat([1.1, .85, .6], [.5, .2, .06], .014, 12.4));
remnant.add(mainRing, arcA, arcB);

const jetGeo = new THREE.ConeGeometry(.08, 1, 24, 1, true).translate(0, .5, 0).rotateX(Math.PI / 2);
const jets = [1, -1].map(s => {
    const j = new THREE.Mesh(jetGeo, beamMat([1.2, 1.3, 1.6]));
    j.scale.z = s;
    remnant.add(j);
    return j;
});

// Éclats : surtout dans le plan de l'anneau, quelques-uns en coquille
const N_BLAST = mobile ? 5000 : 12000;
const blastDir = new Float32Array(N_BLAST * 3), blastSpeed = new Float32Array(N_BLAST);
for (let i = 0; i < N_BLAST; i++) {
    const inDisk = Math.random() < .75, a = Math.random() * Math.PI * 2;
    const v = inDisk ? V(Math.cos(a), Math.sin(a), (Math.random() - .5) * .12).normalize() : V(0, 0, 0).randomDirection();
    v.toArray(blastDir, i * 3);
    // Les éclats hors disque suivent l'onde de choc (rayon ≈ 1.6 R)
    blastSpeed[i] = inDisk ? .75 + Math.random() * .3 : 1.2 + Math.random() * .5;
}
const blastGeo = new THREE.BufferGeometry();
blastGeo.setAttribute('position', new THREE.BufferAttribute(blastDir, 3));
blastGeo.setAttribute('speed', new THREE.BufferAttribute(blastSpeed, 1));
const blastMat = new THREE.ShaderMaterial({
    uniforms: { uR: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: `attribute float speed; uniform float uR; varying float vS;
        void main(){ vS = speed; vec4 mv = modelViewMatrix * vec4(position * (1.5 + speed * uR), 1.);
        gl_PointSize = (1. + speed * 2.) * 80. / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uAlpha; varying float vS;
        void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * uAlpha * (.3 + vS);
        gl_FragColor = vec4(mix(vec3(1.2, .45, .12), vec3(1.6, 1.35, 1.), vS) * a, a); }`,
    ...additive,
});
const blast = new THREE.Points(blastGeo, blastMat);
remnant.add(blast);

// Explosion concentrée : cœur blanc-or et son halo, avant que l'anneau ne se forme
const core = glowSprite(flareGlow, 0xffe2b0, 0);
const burstHalo = glowSprite(glowTexture('rgba(255,200,120,.6)', 'rgba(236,140,40,.15)'), 0xffffff, 0);
scene.add(core, burstHalo);

// Après l'explosion : une étoile à neutrons qui pulse dans le noir
const pulsar = glowSprite(dot, 0xbfd4ff, 1.4);
scene.add(pulsar);

// ---------- Résidus ----------
const dust = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(shell(mobile ? 1000 : 2500, 60, 350), 3)),
    new THREE.PointsMaterial({ map: dot, color: 0xecbc3c, size: 2.5, sizeAttenuation: false, opacity: 0, ...additive })
);
scene.add(dust);

// Les veines d'or de la texture d'astéroïde brillent légèrement (emissiveMap)
const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: .9, metalness: .15, emissive: 0xffffff, emissiveIntensity: 0 });
tex('asteroid-map.webp', t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); rockMat.map = rockMat.emissiveMap = t; rockMat.color.set(0xffffff); rockMat.emissiveIntensity = .25; rockMat.needsUpdate = true; });

const SHARDS = 80;
const shards = new THREE.InstancedMesh(rockGeometry(20, 4.2), rockMat, SHARDS);
const srand = seededRandom(7);
const shardData = Array.from({ length: SHARDS }, () => ({
    pos: V(srand() * 2 - 1, srand() * 2 - 1, srand() * 2 - 1).normalize().multiplyScalar(30 + srand() * 120),
    rot: new THREE.Euler(srand() * 6, srand() * 6, 0),
    size: .2 + srand() ** 3 * 1.4,
}));
scene.add(shards);

// ---------- Retour : un astéroïde majeur + quelques météores ----------
const asteroid = new THREE.Mesh(rockGeometry(mobile ? 64 : 112, 9.3), rockMat);
scene.add(asteroid);
const rimLight = new THREE.DirectionalLight(0xffc27a, 0);
scene.add(rimLight, rimLight.target);

// Deux météores au loin, puis un au premier plan qui frôle la caméra en plongeant vers le sol
const meteors = [
    { start: .9, d: 110, to: [.15, .03], size: .8 },
    { start: .925, d: 90, to: [-.5, .05], size: .8 },
    { start: .95, d: 14, to: [.45, -.12], size: 1.4 },
].map(m => ({ ...m, trail: new Trail(80, [1.8, 1.3, .8], m.size) }));
// Radiant : les météores jaillissent du fond, de la direction d'où arrive l'astéroïde
const RADIANT = [-.28, .12], RADIANT_D = 220;

// ---------- Mouvement des astres (fonctions de p) ----------
const UP = V(0, 1, 0);
const E = new THREE.Vector3(), toSun = new THREE.Vector3(), side = new THREE.Vector3();

function placeEarth(p) {
    const theta = .6 + 2.6 * smooth(seg(p, .22, .5));
    E.set(Math.cos(theta) * ORBIT, 0, Math.sin(theta) * ORBIT);
    toSun.copy(E).negate().normalize();
    side.crossVectors(toSun, UP).normalize();
    earth.position.copy(E);
}

// Ouverture en opposition : la Lune d'un côté de l'écran (à gauche, derrière le nom), le Soleil de l'autre.
// L'écart dépend du cadrage : sur un écran étroit, le Soleil est coupé par le bord plutôt que collé à la Lune.
let sunYaw = 0, moonPhi0 = .25;
function frameOpening() {
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(45 / 2)) * camera.aspect);
    sunYaw = -Math.min(.26, half * .9);
    // Angle vu depuis la caméra (posée à 1,25 du centre de la Terre) → angle sur l'orbite
    const theta = sunYaw - Math.min(.3, half * .75);
    moonPhi0 = theta - Math.asin(1.25 / MOON_ORBIT * Math.sin(theta));
}

function moonOrbit(p, out) {
    // Fin d'orbite côté Soleil et de biais : la Lune ne repasse pas devant la Terre au décrochage
    const phi = lerp(moonPhi0, 7.15, smooth(seg(p, .2, .4)));
    // Au départ, la Lune au-dessus de l'horizon du Soleil : les deux astres en diagonale, puis elle se cale pour le ballet
    return out.copy(E).addScaledVector(toSun, Math.cos(phi) * MOON_ORBIT).addScaledVector(side, Math.sin(phi) * MOON_ORBIT).addScaledVector(UP, lerp(.7, .4, smooth(seg(p, 0, .25))));
}

// Chute de la Lune : courbe de Bézier de son orbite jusqu'au bord du Soleil
const fallStart = new THREE.Vector3(), fallC1 = V(-26, 3, 10), fallC2 = V(-13, 1.6, 4), fallEnd = IMPACT.clone().add(V(-.3, 0, 0));
const bez = new THREE.CubicBezierCurve3(fallStart, fallC1, fallC2, fallEnd);
const fallPath = (u, out) => bez.getPoint(u, out);

// Repère « vu du sol » à la fin : avant (vers l'ancien Soleil), droite, haut
function groundFrame(d, x, y, out) {
    return out.copy(E).addScaledVector(toSun, 1.25 + d).addScaledVector(side, x * d).addScaledVector(UP, y * d);
}

// ---------- Caméra : courbe continue (Catmull-Rom) à travers des positions-clés dynamiques ----------
const ORIGIN = V(0, 0, 0);
const ground = () => [E.clone().addScaledVector(toSun, 1.25), V(0, -3, 0).addScaledVector(side, (ORBIT - 1.25) * Math.tan(sunYaw))];
// Même cadrage que ground, mais au sommet de la Terre : on y arrive par-dessus, sans la traverser
const landing = () => [E.clone().addScaledVector(UP, 1.25), V(0, -7, 0)];
const KEYS = [
    [0, ground],
    // On quitte la Terre sans lâcher le Soleil des yeux : on s'élève, puis on passe derrière elle
    [.15, () => [E.clone().addScaledVector(toSun, .5).addScaledVector(UP, 2.5).addScaledVector(side, 2), ORIGIN]],
    [.25, () => [E.clone().addScaledVector(toSun, -5).addScaledVector(UP, 1.5).addScaledVector(side, 2.5), ORIGIN]],
    [.37, () => [V(0, 40, 85), ORIGIN]],
    // Le Soleil reste au centre : la Lune et son panache entrent par la gauche et plongent vers lui
    [.44, () => [V(-4, 5, 38), V(-6, 0, 4)]],
    // Plus près et de biais, en trois quarts avant : la Lune devant, son panache fuit en profondeur, le Soleil à droite
    [.51, () => [V(-3, 3, 10), V(-7, .8, 1.5)]],
    // Collision filmée de profil : le bord du Soleil au centre
    [.535, () => [V(-11, 1.6, 14), V(-5.5, .6, 0)]],
    [.552, () => [V(-13, 2.2, 19), V(-4, .4, 0)]],
    // Recul brutal puis caméra quasi fixe : l'anneau grandit à l'écran.
    // Filmé depuis l'axe Soleil-Terre (un peu décalé : la Terre ne masque pas l'explosion), pour un retour en travelling avant.
    [.58, () => [toSun.clone().multiplyScalar(-150).addScaledVector(UP, 35).addScaledVector(side, 25), ORIGIN]],
    [.7, () => [toSun.clone().multiplyScalar(-160).addScaledVector(UP, 30).addScaledVector(side, 22), ORIGIN]],
    [.79, () => [toSun.clone().multiplyScalar(-175).addScaledVector(UP, 22).addScaledVector(side, 15), ORIGIN]],
    // Retour : travelling avant jusqu'à la Terre, on passe au-dessus d'elle et on se pose à son sommet,
    // regard vers le rémanent : son limbe devient l'horizon, puis on retrouve le cadre du début
    [.87, () => [E.clone().addScaledVector(toSun, -8).addScaledVector(UP, 3), ORIGIN]],
    [.93, () => [E.clone().addScaledVector(toSun, -1).addScaledVector(UP, 2.4), ORIGIN]],
    [.955, landing],
    [1, landing],
];
const moonTan = new THREE.Vector3();
const camCurve = new THREE.CatmullRomCurve3(KEYS.map(() => V(0, 0, 0)), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map(() => V(0, 0, 0)), false, 'centripetal');
const lookTarget = new THREE.Vector3();

function placeCamera(p) {
    KEYS.forEach(([, f], i) => { const [a, b] = f(); camCurve.points[i].copy(a); lookCurve.points[i].copy(b); });
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
    const u = (i + seg(p, KEYS[i][0], KEYS[i + 1][0])) / (KEYS.length - 1);
    camCurve.getPoint(u, camera.position);
    lookCurve.getPoint(u, lookTarget);
    camera.lookAt(lookTarget);
}

// ---------- Boucle ----------
const flash = document.getElementById('flash');
const hint = document.getElementById('hint');
const horizonNight = document.getElementById('horizon-night');
const horizonAfter = document.getElementById('horizon-after');
for (const img of document.querySelectorAll('.horizon img')) {
    const fail = () => { img.parentElement.classList.add('noimg'); img.remove(); };
    if (img.complete && !img.naturalWidth) fail(); else img.addEventListener('error', fail);
}

// Chaque chapitre du portfolio fixe le moment de l'histoire (data-p) où son haut atteint le haut de l'écran :
// l'histoire reste calée sur le contenu, quelle que soit sa hauteur (mobile, images chargées…)
const anchors = [...document.querySelectorAll('[data-p]')];
let marks = [];
const measure = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    marks = anchors.map(el => [Math.min(el.getBoundingClientRect().top + scrollY, max), +el.dataset.p]).concat([[max, 1]]);
    console.assert(marks.every((m, i) => !i || m[1] >= marks[i - 1][1]), 'data-p croissants');
};
const storyAt = y => {
    const i = Math.max(0, marks.findLastIndex(([my]) => y >= my));
    if (i === marks.length - 1) return 1;
    return lerp(marks[i][1], marks[i + 1][1], seg(y, marks[i][0], marks[i + 1][0]));
};

let target = 0, p = 0;
const readScroll = () => { target = storyAt(scrollY); };
addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    frameOpening();
});
frameOpening();
new ResizeObserver(() => { measure(); readScroll(); }).observe(document.body);
measure();
readScroll();
p = target;

const dummy = new THREE.Object3D(), clock = new THREE.Clock(), tmp2 = new THREE.Vector3();

function frame() {
    const dt = Math.min(clock.getDelta(), .1), time = clock.elapsedTime;
    // Lissage indépendant du nombre d'images par seconde
    p += (target - p) * (1 - Math.exp(-dt * 4));

    const act = ACTS.findLast(([, start]) => p >= start)[0];
    if (act !== currentAct) { currentAct = act; onAct(act); }
    hint.style.opacity = p < .01 ? .6 : 0;

    placeEarth(p);

    // Lune : orbite, puis chute vers le Soleil en se désagrégeant (placée avant la caméra qui la suit)
    const fall = seg(p, .38, .53), u = fall ** 1.8;
    moonOrbit(Math.min(p, .38), fallStart);
    bez.getPoint(u, moon.position);
    moon.visible = p < .53;
    moon.scale.setScalar(1 + 1.2 * smooth(seg(p, .38, .46)));
    // Étirement par les forces de marée dans la direction du mouvement
    bez.getTangent(Math.min(u, .999), moonTan);
    moon.lookAt(tmp2.copy(moon.position).add(moonTan));
    moon.scale.z *= 1 + .2 * seg(u, .7, 1) ** 2;
    // La Lune chauffe en approchant du Soleil : le clair de Terre s'éteint, puis elle rougeoie
    // (pas de fondu bleu → orange, qui passe par du mauve)
    const cool = 1 - seg(u, .3, .5), glow = seg(u, .5, 1);
    if (moonMat.map) { moonMat.emissive.copy(cool > 0 ? MOON_COLD : MOON_HOT); moonMat.emissiveIntensity = cool > 0 ? EARTHSHINE * cool : 1.4 * glow * glow; }

    placeCamera(p);
    const shred = seg(u, .15, 1), gone = 1 - seg(p, .535, .56);
    moonPlume.update(fallPath, u, .6, .42 * moon.scale.x * (1 + .4 * shred), smooth(seg(u, .03, .35)) * gone, time);
    earth.rotation.y = time * .05;
    clouds.rotation.y = time * .012;
    // Masquée au sol (début et fin) : l'horizon dessiné prend le relais.
    // Pendant la supernova, elle ferait une tache noire devant l'explosion
    // Fondu pendant la montée de l'horizon (même plage que `back`), sinon elle dépasse au-dessus des dunes
    const earthFade = 1 - seg(p, .9, .93);
    earth.visible = p > .01 && earthFade > 0 && (p < .556 || p > .8);
    earthMat.opacity = earthFade;
    cloudMat.opacity = cloudMat.userData.ready ? .9 * earthFade : 0;
    // Lueurs fortes de près, discrètes de loin
    const near = 1 - seg(camera.position.distanceTo(E), 6, 40);
    earthMat.emissiveIntensity = earthMat.emissiveMap ? .6 + .8 * near : 0;
    sunAlive.value = sun.visible ? 1 : 0;
    earthAtmo.material.uniforms.uAlpha.value = (.5 + .7 * near) * sunAlive.value * earthFade;


    // Impact puis effondrement du Soleil
    const hit = seg(p, .528, .545);
    impactGlow.scale.setScalar(16 * Math.sin(hit * Math.PI) + 4 * seg(p, .528, .53) * (1 - seg(p, .545, .555)));
    const strain = seg(p, .5, .553);
    const tremble = Math.sin(time * 45) * .02 * strain;
    sun.visible = p < .556;
    sun.scale.setScalar(1 + tremble - .18 * seg(p, .535, .553) ** 2);
    sun.rotation.y = time * .03;
    if (sunMat.map) sunMat.map.offset.x = time * .004;
    corona.scale.setScalar(80 + Math.sin(time * .8) * 4 + 50 * strain);
    flare.visible = p < .36;
    sunLight.intensity = sun.visible ? 3 * (1 + strain) : 0;

    // Écran blanc tenu (la caméra recule dedans), puis explosion concentrée,
    // puis l'anneau qui se répand en expulsant les éclats
    const flashA = seg(p, .548, .556) * (1 - seg(p, .57, .6));
    flash.style.opacity = flashA * (reduced ? .6 : 1);
    const burst = seg(p, .556, .64);
    const k = seg(p, .585, .8), R = 2 + 62 * k ** .8;
    const fade = seg(p, .585, .61) * (1 - seg(p, .74, .82));
    const burstA = seg(burst, 0, .1) * (1 - seg(burst, .55, 1));
    core.visible = burstHalo.visible = burstA > 0;
    core.scale.setScalar(6 + 30 * easeOut(burst));
    core.material.opacity = burstA * .5;
    burstHalo.scale.setScalar(20 + 90 * easeOut(burst));
    burstHalo.material.opacity = burstA * .35;
    mainRing.scale.setScalar(R / .6);
    mainRing.material.uniforms.uAlpha.value = fade;
    for (const [arc, s] of [[arcA, 1], [arcB, -1]]) {
        arc.scale.setScalar(R * .8 / .6);
        arc.position.z = s * R * .45;
        arc.material.uniforms.uAlpha.value = fade * .55;
    }
    for (const j of jets) {
        j.scale.x = j.scale.y = 1 + R * .02;
        j.scale.z = Math.sign(j.scale.z) * R * 1.3;
        j.material.uniforms.uAlpha.value = fade * (1 - seg(p, .66, .76)) * .9;
    }
    remnant.visible = burst > 0 && p < .82;
    // Éclats : boule compacte pendant l'explosion, puis projetés au-delà de l'anneau
    blastMat.uniforms.uR.value = 3 * easeOut(burst) + 1.3 * R;
    // Apparition progressive : compactés, les 12 000 points additifs saturent le bloom (halo carré)
    blastMat.uniforms.uAlpha.value = seg(burst, .2, .6) * (1 - seg(p, .74, .82)) * .5;
    remnant.rotation.z = .3 + time * .01;

    // Le blanc vient du calque #flash : un bloom trop fort fait des halos carrés
    bloom.strength = .8 + strain * .8 + 1.5 * flashA - .3 * fade;

    // Le vide : presque plus rien, une étoile à neutrons qui pulse
    pulsar.material.opacity = seg(p, .6, .66) * (1 - seg(p, .8, .88)) * (.35 + .65 * Math.sin(time * 9) ** 8);
    const residue = seg(p, .78, .9);
    stars.material.opacity = (1 - seg(p, .56, .64)) + .5 * residue;

    // Résidus
    dust.visible = residue > 0;
    dust.material.opacity = residue * .35;
    dust.rotation.y = time * .006;
    ambient.intensity = .04 + residue * .25;
    // Les débris restent jusqu'au bout, même hors champ : l'astéroïde majeur est l'un d'eux
    const debris = residue;
    shards.visible = debris > 0;
    if (shards.visible) {
        shardData.forEach((s, i) => {
            dummy.position.copy(s.pos);
            dummy.rotation.set(s.rot.x + time * .1, s.rot.y + time * .07, 0);
            dummy.scale.setScalar(s.size * debris);
            dummy.updateMatrix();
            shards.setMatrixAt(i, dummy.matrix);
        });
        shards.instanceMatrix.needsUpdate = true;
    }

    // Malaise de la collision : tremblement, roulis, effet vertigo (FOV qui se resserre)
    const unease = seg(p, .48, .553) * (1 - seg(p, .556, .6));
    if (!reduced && unease > 0) {
        camera.position.x += (Math.random() - .5) * unease * .25;
        camera.position.y += (Math.random() - .5) * unease * .25;
        camera.rotateZ(Math.sin(time * 1.3) * unease * .12);
    }
    camera.fov = 45 - 14 * unease;
    camera.updateProjectionMatrix();

    // Retour sur Terre : nouvel horizon, astéroïde majeur, météores
    const back = seg(p, .9, .93);
    const ta = seg(p, .92, 1);
    const astPath = (s, out) => groundFrame(lerp(130, 40, easeOut(s)), lerp(-.25, .12, s), lerp(.1, -.03, s), out);
    // Il flotte parmi les débris dès qu'ils apparaissent, puis se détache du champ vers la Terre
    asteroid.visible = residue > 0;
    if (asteroid.visible) {
        astPath(ta, asteroid.position);
        asteroid.scale.set(6, 3.8, 4.4).multiplyScalar(residue);
        asteroid.rotation.set(time * .05, time * .08, .4);
        rimLight.target.position.copy(asteroid.position);
        // Lumière rasante de côté : le terminateur révèle le relief et les cratères
        rimLight.position.copy(asteroid.position).addScaledVector(toSun, 8).addScaledVector(UP, 12).addScaledVector(side, -30);
    }
    rimLight.intensity = 5 * back;
    for (const m of meteors) {
        const t = seg(p, m.start, m.start + .04);
        const path = (s, out) => groundFrame(lerp(RADIANT_D, m.d, s), lerp(RADIANT[0], m.to[0], s), lerp(RADIANT[1], m.to[1], s), out);
        m.trail.update(path, t, .35, .15, t > 0 && t < 1 ? seg(t, 0, .25) * (1 - t * t) : 0);
    }

    // Le décollage commence dès le premier cran de défilement : le sol s'enfonce, la caméra s'élève
    const night = 1 - seg(p, .005, .12);
    horizonNight.style.opacity = night;
    horizonNight.style.transform = `translateY(${(1 - night) * 60}%)`;
    horizonAfter.style.opacity = back;
    horizonAfter.style.transform = `translateY(${(1 - back) * 60}%)`;

    camera.updateMatrixWorld();
    sunView.value.setFromMatrixPosition(sun.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    film.uniforms.uTime.value = time;
    composer.render();
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
