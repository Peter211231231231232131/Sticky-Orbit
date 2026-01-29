const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const finalLeapsEl = document.getElementById('final-leaps');
const startBtn = document.getElementById('start-button');
const restartBtn = document.getElementById('restart-button');

// Game State
let score = 0;
let bestScore = localStorage.getItem('sticky-orbit-best') || 0;
let leaps = 0;
let isGameActive = false;
let cameraY = 0;
let targetCameraY = 0;
let screenShake = 0;
let comboTimer = 0;
let combo = 0;
let planetsGenerated = 0;
let gameMode = 'classic';
let chasingSun = null;

let moon = {
    x: 0,
    y: 0,
    radius: 8,
    angle: 0,
    orbitDist: 60,
    orbitSpeed: 0.05,
    state: 'orbiting',
    vx: 0,
    vy: 0,
    currentPlanet: null,
    lastPlanet: null,
    trail: [],
    flyTime: 0
};

let planets = [];
let particles = [];
let asteroids = [];
let fallingAsteroids = [];
let stars = [];
let collectibles = [];
const PLANET_TYPES = ['terran', 'gas', 'crater', 'lava'];
let blackHoles = [];

class ChasingSun {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height + 500;
        this.radius = 300; // 2x larger
        this.speed = 0.6;  // 1.5x faster
        this.consumeRadius = 350;
        this.coronaAngle = 0;
    }

    update() {
        // Rise toward player (moving up = decreasing Y)
        this.y -= this.speed;
        // Accelerate over time
        this.speed = Math.min(3.0, this.speed + 0.0003);
        this.coronaAngle += 0.03;

        // Pull the closest planet toward sun
        let closestPlanet = null;
        let closestDist = Infinity;
        for (const p of planets) {
            const dist = this.y - p.y;
            if (dist > 0 && dist < closestDist) {
                closestDist = dist;
                closestPlanet = p;
            }
        }
        if (closestPlanet && closestDist < 600) {
            const pullStrength = (600 - closestDist) * 0.012;
            closestPlanet.y += pullStrength;
        }

        // Consume planets
        for (let i = planets.length - 1; i >= 0; i--) {
            const p = planets[i];
            if (p.y > this.y - this.consumeRadius) {
                // Consume!
                createParticles(p.x, p.y, '#f97316', 25);
                createParticles(p.x, p.y, '#fbbf24', 20);
                createParticles(p.x, p.y, '#dc2626', 15);
                screenShake = 10;
                planets.splice(i, 1);
            }
        }
    }

    draw() {
        const drawY = this.y - cameraY;

        // Outer danger glow
        ctx.save();
        const dangerGrad = ctx.createRadialGradient(this.x, drawY, this.radius, this.x, drawY, this.radius * 3);
        dangerGrad.addColorStop(0, 'rgba(220, 38, 38, 0.3)');
        dangerGrad.addColorStop(0.5, 'rgba(249, 115, 22, 0.1)');
        dangerGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = dangerGrad;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.radius * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Corona rays (more intense)
        ctx.save();
        ctx.translate(this.x, drawY);
        ctx.rotate(this.coronaAngle);
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const len = this.radius * 2 + Math.sin(this.coronaAngle * 4 + i) * 50;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
            ctx.strokeStyle = `rgba(251, 191, 36, ${0.3 + Math.sin(this.coronaAngle * 2 + i) * 0.2})`;
            ctx.lineWidth = 25;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        ctx.restore();

        // Main sun body
        ctx.save();
        ctx.shadowBlur = 120;
        ctx.shadowColor = '#ef4444';
        const sunGrad = ctx.createRadialGradient(this.x, drawY, 0, this.x, drawY, this.radius);
        sunGrad.addColorStop(0, '#fff7ed');
        sunGrad.addColorStop(0.2, '#fef08a');
        sunGrad.addColorStop(0.5, '#fbbf24');
        sunGrad.addColorStop(0.75, '#f97316');
        sunGrad.addColorStop(1, '#dc2626');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    checkPlayerCollision() {
        // Player caught if they are below the sun's top edge
        const sunTop = this.y - this.radius;
        if (moon.y > sunTop - moon.radius) {
            return true;
        }
        return false;
    }
}

class BlackHole {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 25;
        this.gravityRadius = 150;
        this.angle = 0;
    }

    update() {
        this.angle += 0.1;
    }

    draw() {
        const drawY = this.y - cameraY;

        // Accretion Disk
        ctx.save();
        ctx.translate(this.x, drawY);
        ctx.rotate(this.angle);
        const grad = ctx.createRadialGradient(0, 0, 15, 0, 0, 50);
        grad.addColorStop(0, '#000');
        grad.addColorStop(0.5, '#7c3aed');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 55, 0, Math.PI * 2);
        ctx.fill();

        // Event Horizon
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();

        // Border glow
        ctx.strokeStyle = '#c4b5fd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}


class Planet {
    constructor(x, y, radius, orbitSpeed, moving = false) {
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.radius = radius;
        this.gravityRadius = radius * 2.8;
        this.orbitSpeed = orbitSpeed;
        this.type = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)];
        this.pulse = 0;
        this.rotation = Math.random() * Math.PI * 2;
        this.seed = Math.random();

        // Visual properties
        this.colors = this.getColors(this.type);
        this.hasRing = (this.type === 'gas' && Math.random() > 0.5);
        this.moving = moving;
        this.movePhase = Math.random() * Math.PI * 2;
        this.moveSpeed = 0.02 + Math.random() * 0.02;
        this.moveRange = 60 + Math.random() * 40;

        // Generate static texture data
        this.textureData = this.generateTexture();
    }

    getColors(type) {
        switch (type) {
            case 'terran': return { main: '#3b82f6', detail: '#10b981', atmosphere: '#60a5fa' }; // Blue/Green
            case 'gas': return { main: '#a855f7', detail: '#e879f9', atmosphere: '#c084fc' }; // Purple/Pink
            case 'crater': return { main: '#94a3b8', detail: '#64748b', atmosphere: '#cbd5e1' }; // Grey
            case 'lava': return { main: '#ef4444', detail: '#f97316', atmosphere: '#fca5a5' }; // Red/Orange
            case 'sun': return { main: '#f59e0b', detail: '#fcd34d', atmosphere: '#fbbf24' }; // Yellow/Gold
            default: return { main: '#fff', detail: '#ccc', atmosphere: '#fff' };
        }
    }

    generateTexture() {
        const details = [];
        if (this.type === 'sun') {
            // Sun spots
            for (let i = 0; i < 10; i++) {
                details.push({
                    x: (Math.random() - 0.5) * 2,
                    y: (Math.random() - 0.5) * 2,
                    r: Math.random() * 0.3 + 0.1
                });
            }
            return details;
        }

        if (this.type === 'terran') {
            // Continents
            for (let i = 0; i < 5; i++) {
                details.push({
                    x: (Math.random() - 0.5) * 2,
                    y: (Math.random() - 0.5) * 2,
                    r: Math.random() * 0.5 + 0.2
                });
            }
        } else if (this.type === 'gas') {
            // Stripes
            for (let i = 0; i < 5; i++) {
                details.push({
                    y: (Math.random() - 0.5) * 1.8,
                    h: Math.random() * 0.3 + 0.1
                });
            }
        } else if (this.type === 'crater') {
            // Craters
            for (let i = 0; i < 6; i++) {
                details.push({
                    x: (Math.random() - 0.5) * 1.5,
                    y: (Math.random() - 0.5) * 1.5,
                    r: Math.random() * 0.2 + 0.05
                });
            }
        } else if (this.type === 'lava') {
            // Cracks
            for (let i = 0; i < 8; i++) {
                details.push({
                    x: (Math.random() - 0.5) * 1.8,
                    y: (Math.random() - 0.5) * 1.8,
                    w: Math.random() * 0.8 + 0.2
                });
            }
        }
        return details;
    }

    update() {
        this.rotation += 0.005;
        if (this.pulse > 0) this.pulse -= 0.03;

        if (this.moving) {
            this.movePhase += this.moveSpeed;
            this.x = this.baseX + Math.sin(this.movePhase) * this.moveRange;
        }
    }

    draw() {
        const drawY = this.y - cameraY;

        // Gravity Field
        ctx.save();
        const fieldPulse = 1 + Math.sin(Date.now() * 0.003) * 0.05;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.gravityRadius * fieldPulse, 0, Math.PI * 2);
        ctx.strokeStyle = this.colors.main + '22';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 20]);
        ctx.stroke();
        ctx.restore();

        // Ring Back
        if (this.hasRing) {
            this.drawRing(drawY, false);
        }

        // Atmosphere Glow
        ctx.save();
        ctx.shadowBlur = 30 + this.pulse * 20;
        ctx.shadowColor = this.colors.atmosphere;
        ctx.fillStyle = this.colors.main;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.radius + this.pulse * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Planet Masking for Texture
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.radius, 0, Math.PI * 2);
        ctx.clip();

        // Base
        ctx.fillStyle = this.colors.main;
        ctx.fillRect(this.x - this.radius, drawY - this.radius, this.radius * 2, this.radius * 2);

        // Texture Details
        ctx.fillStyle = this.colors.detail;
        if (this.type === 'terran' || this.type === 'crater') {
            this.textureData.forEach(d => {
                // Simple parallax rotation effect
                let dx = d.x * this.radius + Math.sin(this.rotation) * 20;
                let dy = d.y * this.radius; // + Math.cos(this.rotation) * 5;

                // Wrap around logic roughly
                if (dx > this.radius) dx -= this.radius * 2;

                ctx.beginPath();
                ctx.arc(this.x + dx, drawY + dy, d.r * this.radius, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (this.type === 'gas') {
            this.textureData.forEach(d => {
                ctx.fillRect(this.x - this.radius, drawY + d.y * this.radius, this.radius * 2, d.h * this.radius);
            });
        } else if (this.type === 'lava') {
            ctx.fillStyle = '#7f1d1d'; // Dark patches
            this.textureData.forEach(d => {
                let dx = d.x * this.radius + Math.cos(this.rotation + d.x) * 10;
                let dy = d.y * this.radius;
                ctx.beginPath();
                ctx.arc(this.x + dx, drawY + dy, d.w * 10, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (this.type === 'sun') {
            ctx.fillStyle = '#b45309'; // Darker orange/brown spots
            this.textureData.forEach(d => {
                // Slower rotation for sun spots
                let dx = d.x * this.radius + Math.sin(this.rotation * 0.5) * 10;
                let dy = d.y * this.radius;
                ctx.beginPath();
                ctx.arc(this.x + dx, drawY + dy, d.r * this.radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Shadow/Shading (Day/Night cycle)
        const grad = ctx.createRadialGradient(
            this.x - this.radius * 0.4, drawY - this.radius * 0.4, 0,
            this.x, drawY, this.radius
        );
        grad.addColorStop(0, 'rgba(255,255,255,0.1)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');

        ctx.fillStyle = grad;
        ctx.fillRect(this.x - this.radius, drawY - this.radius, this.radius * 2, this.radius * 2);

        ctx.restore();

        // Ring Front
        if (this.hasRing) {
            this.drawRing(drawY, true);
        }
    }

    drawRing(drawY, isFront) {
        ctx.save();
        ctx.translate(this.x, drawY);
        ctx.rotate(-0.4);
        ctx.scale(1.5, 0.4);

        ctx.beginPath();
        if (isFront) {
            ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI, false);
        } else {
            ctx.arc(0, 0, this.radius * 1.5, Math.PI, 0, false);
        }

        ctx.strokeStyle = this.colors.detail + '88';
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.restore();
    }
}

class Asteroid {
    constructor(planet) {
        this.planet = planet;
        this.angle = Math.random() * Math.PI * 2;
        this.distance = planet.gravityRadius * 0.8 + Math.random() * 20;
        this.speed = (0.02 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1);
        this.size = 6 + Math.random() * 6;
        this.points = [];
        // Generate jagged shape
        const verts = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < verts; i++) {
            this.points.push(0.7 + Math.random() * 0.6);
        }
    }

    update() {
        this.angle += this.speed;
    }

    draw() {
        if (!this.planet) return;
        const cx = this.planet.x + Math.cos(this.angle) * this.distance;
        const cy = (this.planet.y - cameraY) + Math.sin(this.angle) * this.distance;

        // Save position for collision check
        this.worldX = cx;
        this.worldY = this.planet.y + Math.sin(this.angle) * this.distance;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle * 2);
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        this.points.forEach((r, i) => {
            const theta = (i / this.points.length) * Math.PI * 2;
            const x = Math.cos(theta) * this.size * r;
            const y = Math.sin(theta) * this.size * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

class Collectible {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 8;
        this.collected = false;
        this.pulse = 0;
        this.rotation = 0;
    }
    update() {
        this.pulse = Math.sin(Date.now() * 0.005) * 0.3;
        this.rotation += 0.02;
    }
    draw() {
        if (this.collected) return;
        const drawY = this.y - cameraY;
        ctx.save();
        ctx.translate(this.x, drawY);
        ctx.rotate(this.rotation);
        ctx.fillStyle = '#fbbf24';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#fbbf24';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
            const outerR = this.radius * (1 + this.pulse);
            const innerR = this.radius * 0.4;
            ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
            const innerAngle = angle + Math.PI / 5;
            ctx.lineTo(Math.cos(innerAngle) * innerR, Math.sin(innerAngle) * innerR);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// Initialization
function init() {
    resize();
    bestEl.textContent = bestScore + 'm';

    // Background Stars (more coverage)
    for (let i = 0; i < 500; i++) {
        const depth = Math.random();
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * 10000 - 5000, // Much wider range
            size: 0.5 + depth * 2,
            opacity: 0.2 + depth * 0.8,
            depth: 0.05 + depth * 0.2
        });
    }

    window.addEventListener('resize', resize);

    // Fixed click handlers
    const survivalBtn = document.getElementById('survival-button');
    startBtn.addEventListener('click', (e) => { e.stopPropagation(); startGame('classic'); });
    survivalBtn.addEventListener('click', (e) => { e.stopPropagation(); startGame('survival'); });
    restartBtn.addEventListener('click', (e) => { e.stopPropagation(); startGame(gameMode); });
    window.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'BUTTON') handleJump(); });
    window.addEventListener('touchstart', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            handleJump();
            e.preventDefault();
        }
    }, { passive: false });

    // Keyboard Controls
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            if (!isGameActive) {
                startGame('classic');
            } else {
                handleJump();
            }
        }
    });

    requestAnimationFrame(gameLoop);
}

class FallingAsteroid {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 20; // Big!
        this.speed = 4 + Math.random() * 3; // Fast!
        this.rotation = 0;
        this.rotSpeed = (Math.random() - 0.5) * 0.2;
        this.id = Math.random();

        // Shape
        this.points = [];
        const verts = 7 + Math.floor(Math.random() * 4);
        for (let i = 0; i < verts; i++) {
            this.points.push(0.8 + Math.random() * 0.4);
        }
    }

    update() {
        this.y += this.speed;
        this.rotation += this.rotSpeed;
    }

    draw() {
        const drawY = this.y - cameraY;
        ctx.save();
        ctx.translate(this.x, drawY);
        ctx.rotate(this.rotation);

        // Trail effect
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#fca5a5';

        ctx.fillStyle = '#7f1d1d'; // Dark red/brown
        ctx.beginPath();
        this.points.forEach((r, i) => {
            const theta = (i / this.points.length) * Math.PI * 2;
            const x = Math.cos(theta) * this.radius * r;
            const y = Math.sin(theta) * this.radius * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();

        // Inner "core" heat
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

function handleJump() {
    if (!isGameActive) return;
    if (moon.state === 'orbiting') {
        moon.state = 'flying';
        moon.flyTime = 0;
        leaps++;

        // Tangent Launch
        const speed = 13;
        const direction = moon.currentPlanet.orbitSpeed > 0 ? 1 : -1;
        moon.vx = Math.cos(moon.angle + Math.PI / 2 * direction) * speed;
        moon.vy = Math.sin(moon.angle + Math.PI / 2 * direction) * speed;

        moon.lastPlanet = moon.currentPlanet;

        if (moon.currentPlanet) {
            moon.currentPlanet.pulse = 0.8;
            createParticles(moon.x, moon.y, moon.currentPlanet.colors.main, 10);
        }
        moon.currentPlanet = null;
        comboTimer = 150;
    }
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function startGame(mode = 'classic') {
    gameMode = mode;
    score = 0;
    leaps = 0;
    combo = 0;
    cameraY = 0;
    targetCameraY = 0;
    isGameActive = true;
    planetsGenerated = 0;

    planets = [];
    asteroids = [];
    fallingAsteroids = [];
    blackHoles = [];
    collectibles = [];
    particles = [];

    // Survival mode: create chasing sun
    if (gameMode === 'survival') {
        chasingSun = new ChasingSun();
    } else {
        chasingSun = null;
    }

    // First Planet (Safe)
    const firstPlanet = new Planet(canvas.width / 2, canvas.height * 0.7, 45, 0.04, false);
    planets.push(firstPlanet);

    moon.currentPlanet = firstPlanet;
    moon.lastPlanet = null;
    moon.state = 'orbiting';
    moon.orbitDist = 75;
    moon.angle = -Math.PI / 2;
    moon.trail = [];
    moon.flyTime = 0;
    moon.x = firstPlanet.x;
    moon.y = firstPlanet.y - 75;

    spawnPlanets();

    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    updateUI();
}

function spawnPlanets() {
    let lastY = planets.length > 0 ? planets[planets.length - 1].y : canvas.height;
    while (planets.length < 15) {
        planetsGenerated++;
        const isBoss = (planetsGenerated % 20 === 0); // Every 20 planets

        let x, y, radius, speed, moving, typeOverride = null;

        if (isBoss) {
            // BOSS ENCOUNTER: Sun + Cluster
            y = lastY - 400; // Big gap
            x = canvas.width / 2;
            radius = 90; // HUGE
            speed = 0;
            moving = false;
            typeOverride = 'sun';

            // Spawn Cluster Orbiting Sun
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const dist = 220;
                // Small orbiting planets
                const pSmall = new Planet(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, 25, 0.05, false);
                planets.push(pSmall);
            }

            // Falling Asteroids Rain
            for (let i = 0; i < 4; i++) {
                fallingAsteroids.push(new FallingAsteroid(
                    100 + Math.random() * (canvas.width - 200),
                    y - 800 - Math.random() * 400
                ));
            }

            createTextParticle(x, y - 200, "⚠️ SOLAR FLARE ⚠️", "#fbbf24");

        } else {
            // Normal Generation
            x = 100 + Math.random() * (canvas.width - 200);
            y = lastY - (180 + Math.random() * 120);
            radius = 30 + Math.random() * 30;
            speed = (0.03 + Math.random() * 0.05 * (1 + (Math.min(1, Math.abs(y) / 10000)))) * (Math.random() > 0.5 ? 1 : -1);
            moving = (Math.min(1, Math.abs(y) / 10000)) > 0.2 && Math.random() > 0.6;
        }

        const difficulty = Math.min(1, Math.abs(y) / 10000);

        const p = new Planet(x, y, radius, speed, moving);
        if (typeOverride) p.type = typeOverride; // Force sun type
        // Recalculate visuals for type override
        if (typeOverride) {
            p.colors = p.getColors(p.type);
            p.textureData = p.generateTexture();
            p.gravityRadius = radius * 3.5; // Stronger gravity
        }

        planets.push(p);

        // Spawn Asteroids
        if (difficulty > 0.1 && Math.random() > 0.5) {
            const count = 1 + Math.floor(Math.random() * 3 * difficulty);
            for (let i = 0; i < count; i++) {
                asteroids.push(new Asteroid(p));
            }
        }

        // Spawn Coins
        if (Math.random() > 0.4) {
            collectibles.push(new Collectible(
                x + (Math.random() - 0.5) * 150,
                y - 100
            ));
        }

        // Spawn Black Holes (Rare)
        if (difficulty > 0.15 && Math.random() > 0.85) {
            const bx = 100 + Math.random() * (canvas.width - 200);
            const by = y - 300; // Between planet layers
            blackHoles.push(new BlackHole(bx, by));
        }


        lastY = y;
    }
}

function endGame() {
    isGameActive = false;
    createParticles(moon.x, moon.y, '#fff', 30);
    screenShake = 20;

    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('sticky-orbit-best', bestScore);
        bestEl.textContent = bestScore + 'm';
    }
    setTimeout(() => {
        gameOverScreen.classList.add('active');
        finalScoreEl.textContent = score + 'm';
        finalLeapsEl.textContent = leaps;
    }, 500);
}

function updateUI() {
    scoreEl.textContent = score + 'm';
}

function drawStars() {
    stars.forEach(s => {
        const parallaxY = (s.y - cameraY * s.depth) % (canvas.height + 500);
        const finalY = parallaxY < -100 ? parallaxY + canvas.height + 500 : parallaxY;
        ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
        ctx.beginPath();
        ctx.arc(s.x, finalY, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawTrajectory() {
    if (moon.state !== 'orbiting' || !moon.currentPlanet) return;
    const speed = 13;
    const direction = moon.currentPlanet.orbitSpeed > 0 ? 1 : -1;
    const vx = Math.cos(moon.angle + Math.PI / 2 * direction) * speed;
    const vy = Math.sin(moon.angle + Math.PI / 2 * direction) * speed;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 10]);
    ctx.beginPath();
    ctx.moveTo(moon.x, moon.y - cameraY);
    let px = moon.x;
    let py = moon.y;
    for (let i = 0; i < 25; i++) {
        px += vx;
        py += vy;
        ctx.lineTo(px, py - cameraY);
    }
    ctx.stroke();
    ctx.restore();
}

function gameLoop() {
    // Screen Shake
    ctx.save();
    if (screenShake > 0.5) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
        screenShake *= 0.85; // Smoother decay
    } else {
        screenShake = 0;
    }

    ctx.clearRect(-50, -50, canvas.width + 100, canvas.height + 100);

    drawStars();

    if (isGameActive) {
        if (comboTimer > 0) comboTimer--; else combo = 0;

        // Camera Logic
        const moonScreenY = moon.y - cameraY;
        // Follow Up
        if (moonScreenY < canvas.height * 0.4) {
            targetCameraY = moon.y - canvas.height * 0.4;
        }
        // Follow Down
        else if (moonScreenY > canvas.height * 0.7) {
            targetCameraY = moon.y - canvas.height * 0.7;
        }
        cameraY += (targetCameraY - cameraY) * 0.08; // Smoother tracking

        // Score
        const altScore = Math.floor((canvas.height * 0.7 - moon.y) / 10);
        if (altScore > score) {
            score = altScore;
            updateUI();
        }

        // Survival Mode: Chasing Sun
        if (chasingSun) {
            chasingSun.update();
            if (chasingSun.checkPlayerCollision()) {
                createParticles(moon.x, moon.y, '#fbbf24', 40);
                endGame();
            }
        }

        // Falling Asteroids Logic
        for (let i = fallingAsteroids.length - 1; i >= 0; i--) {
            const fa = fallingAsteroids[i];
            fa.update();

            // Collision with Moon
            const dx = moon.x - fa.x;
            const dy = moon.y - fa.y;
            if (Math.sqrt(dx * dx + dy * dy) < moon.radius + fa.radius) {
                createParticles(moon.x, moon.y, '#ef4444', 30);
                endGame();
            }

            // Cleanup off-screen
            if (fa.y - cameraY > canvas.height + 400) {
                fallingAsteroids.splice(i, 1);
            }
        }

        // --- Physics ---
        if (moon.state === 'orbiting' && moon.currentPlanet) {
            moon.angle += moon.currentPlanet.orbitSpeed;
            moon.x = moon.currentPlanet.x + Math.cos(moon.angle) * moon.orbitDist;
            moon.y = moon.currentPlanet.y + Math.sin(moon.angle) * moon.orbitDist;
        } else if (moon.state === 'flying') {
            moon.x += moon.vx;
            moon.y += moon.vy;
            moon.flyTime++;

            if (moon.flyTime > 120) { // 2 seconds
                createParticles(moon.x, moon.y, '#fff', 20);
                endGame();
            }

            // Planet Collision (Orbit Capture)
            let closestP = null;
            let minDst = Infinity;

            for (const p of planets) {
                const dx = moon.x - p.x;
                const dy = moon.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Track closest valid planet
                if (p !== moon.lastPlanet && dist < minDst) {
                    minDst = dist;
                    closestP = p;
                }

                if (moon.lastPlanet === p && dist > p.gravityRadius) moon.lastPlanet = null;

                if (dist < p.gravityRadius && p !== moon.lastPlanet) {
                    moon.state = 'orbiting';
                    moon.flyTime = 0;
                    moon.currentPlanet = p;
                    moon.orbitDist = Math.max(p.radius + 20, dist);
                    moon.angle = Math.atan2(dy, dx);
                    p.pulse = 1;
                    screenShake = 5;
                    createParticles(moon.x, moon.y, p.colors.atmosphere, 15);

                    if (comboTimer > 0) {
                        combo++;
                        score += combo * 10;
                        // Color progression: green -> yellow -> orange -> red
                        const comboColors = ['#4ade80', '#facc15', '#f97316', '#ef4444'];
                        const colorIdx = Math.min(combo - 1, comboColors.length - 1);
                        createTextParticle(moon.x, moon.y, `+${combo * 10}`, comboColors[colorIdx]);
                    }

                    // Destroy overlapping asteroids (Shield Bash)
                    for (let i = asteroids.length - 1; i >= 0; i--) {
                        const a = asteroids[i];
                        if (a.planet === p) {
                            const adx = moon.x - a.worldX;
                            const ady = moon.y - a.worldY;
                            if (Math.sqrt(adx * adx + ady * ady) < moon.radius + a.size + 40) {
                                asteroids.splice(i, 1);
                                // Easter Egg: Mini Cloud Explosion
                                createParticles(a.worldX, a.worldY, '#64748b', 15); // Dark debris
                                createParticles(a.worldX, a.worldY, '#f1f5f9', 12); // White dust puff
                                createTextParticle(a.worldX, a.worldY, 'BOOM!', '#e2e8f0');
                                p.pulse = 1.5; // Planet reacts too
                            }
                        }
                    }
                    break;
                }
            }

            // Apply gravity from closest planet only
            if (closestP && minDst < 300) {
                const dx = moon.x - closestP.x;
                const dy = moon.y - closestP.y;
                const pull = 0.035; // Weaker pull
                moon.vx -= (dx / minDst) * pull;
                moon.vy -= (dy / minDst) * pull;
            }

            // Asteroid Collision (Smash!)
            if (moon.state === 'flying') {
                for (let i = asteroids.length - 1; i >= 0; i--) {
                    const a = asteroids[i];
                    const dx = moon.x - a.worldX;
                    const dy = moon.y - a.worldY;
                    if (Math.sqrt(dx * dx + dy * dy) < moon.radius + a.size) {
                        // Smash the asteroid!
                        asteroids.splice(i, 1);
                        createParticles(a.worldX, a.worldY, '#64748b', 15);
                        createParticles(a.worldX, a.worldY, '#f1f5f9', 12);
                        createTextParticle(a.worldX, a.worldY, 'SMASH!', '#fca5a5');
                        screenShake = 10;
                        // Slow down slightly
                        moon.vx *= 0.9;
                        moon.vy *= 0.9;
                    }
                }
            }

            // Black Hole Gravity & Death
            for (const bh of blackHoles) {
                const dx = moon.x - bh.x;
                const dy = moon.y - bh.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < bh.gravityRadius) {
                    const pull = 0.25; // Strong pull
                    moon.vx -= (dx / dist) * pull;
                    moon.vy -= (dy / dist) * pull;

                    // Event Horizon (Death)
                    if (dist < bh.radius) {
                        endGame();
                        createParticles(moon.x, moon.y, '#7c3aed', 30);
                    }
                }
            }


            // Collectibles
            collectibles.forEach(c => {
                if (c.collected) return;
                const dx = moon.x - c.x;
                const dy = moon.y - c.y;
                if (Math.sqrt(dx * dx + dy * dy) < moon.radius + c.radius + 10) {
                    c.collected = true;
                    score += 50;
                    createParticles(c.x, c.y, '#fbbf24', 10);
                    createTextParticle(c.x, c.y, '+50', '#fbbf24');
                    updateUI();
                }
            });
        }

        // Boundary Death
        if (moon.y - cameraY > canvas.height + 200 ||
            moon.x < -150 || moon.x > canvas.width + 150) {
            endGame();
        }

        // Cleanup
        while (planets.length > 0 && planets[0].y - cameraY > canvas.height + 400) {
            planets.shift();
        }
        spawnPlanets();

        // Trail
        moon.trail.push({ x: moon.x, y: moon.y, a: 1 });
        if (moon.trail.length > 20) moon.trail.shift();
        moon.trail.forEach(t => t.a -= 0.05);

        drawTrajectory();
    }

    // --- Rendering ---

    // Collectibles
    collectibles.forEach(c => {
        if (c.y - cameraY < canvas.height + 50 && c.y - cameraY > -50) {
            c.update();
            c.draw();
        }
    });

    // Survival Mode: Draw Chasing Sun (behind planets)
    if (chasingSun) {
        chasingSun.draw();
    }

    // Planets & Asteroids
    // Planets & Asteroids & Objects
    [...planets, ...blackHoles].forEach(obj => {
        if (obj.y - cameraY < canvas.height + 300 && obj.y - cameraY > -300) {
            obj.update();
            obj.draw();
        }
    });

    asteroids.forEach(a => {
        if (a.planet.y - cameraY < canvas.height + 300) {
            a.update();
            a.draw();
        }
    });

    fallingAsteroids.forEach(fa => {
        if (fa.y - cameraY < canvas.height + 300 && fa.y - cameraY > -300) {
            fa.draw();
        }
    });

    // Trail (gradient fade)
    if (moon.trail.length > 1) {
        for (let i = 1; i < moon.trail.length; i++) {
            const t0 = moon.trail[i - 1];
            const t1 = moon.trail[i];
            const alpha = (i / moon.trail.length) * 0.6;
            ctx.beginPath();
            ctx.moveTo(t0.x, t0.y - cameraY);
            ctx.lineTo(t1.x, t1.y - cameraY);
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 2 + (i / moon.trail.length) * 3;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    }

    // Player Moon (enhanced glow)
    ctx.save();
    // Outer glow
    ctx.shadowBlur = 25;
    ctx.shadowColor = moon.state === 'flying' ? '#fbbf24' : '#fff';
    // Inner gradient
    const moonGrad = ctx.createRadialGradient(
        moon.x - 2, moon.y - cameraY - 2, 0,
        moon.x, moon.y - cameraY, moon.radius
    );
    moonGrad.addColorStop(0, '#fff');
    moonGrad.addColorStop(0.7, '#e2e8f0');
    moonGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(moon.x, moon.y - cameraY, moon.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) particles.splice(i, 1);
        else {
            if (p.text) {
                ctx.save();
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.font = 'bold 20px Outfit';
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y - cameraY);
                ctx.restore();
            } else {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y - cameraY, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

function createTextParticle(x, y, text, color) {
    particles.push({
        x: x, y: y - 30, vx: 0, vy: -1, life: 1.5,
        text: text, color: color
    });
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1, size: Math.random() * 4 + 1,
            color: color
        });
    }
}

init();
