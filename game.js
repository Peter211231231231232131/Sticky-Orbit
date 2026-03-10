/**
 * STICKY ORBIT - OFFICIAL STABLE SOURCE
 * Features: Parent-Child Boss Logic, Smoothed Textures, Particle Systems, 
 * High Score persistence, and DOM-safe initialization.
 */

// Global Game Variables
let canvas, ctx;
let score = 0;
let bestScore = localStorage.getItem('stickyOrbitBest') || 0;
let gameActive = false;
let cameraY = 0;
let planets = [];
let fallingAsteroids = [];
let particles = [];
let lastPlanetY = 0;
let planetCount = 0;

// Constants
const GRAVITY = 0.18;
const JUMP_FORCE = 8;
const INITIAL_ORBIT_SPEED = 0.05;

/**
 * Particle Class for explosions and jumps
 */
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.alpha = 1;
        this.color = color;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= 0.02;
    }
    draw() {
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y - cameraY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

/**
 * Moon Class (The Player)
 */
class Moon {
    constructor() {
        this.reset();
        this.trail = [];
    }
    reset() {
        this.x = canvas ? canvas.width / 2 : 0;
        this.y = 500;
        this.vx = 0;
        this.vy = 0;
        this.radius = 12;
        this.state = 'orbiting'; 
        this.currentPlanet = null;
        this.angle = 0;
        this.orbitSpeed = INITIAL_ORBIT_SPEED;
        this.orbitRadius = 80;
        this.trail = [];
    }
    update() {
        // Record trail for visual effect
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 12) this.trail.shift();

        if (this.state === 'orbiting' && this.currentPlanet) {
            this.angle += this.orbitSpeed;
            this.x = this.currentPlanet.x + Math.cos(this.angle) * this.orbitRadius;
            this.y = this.currentPlanet.y + Math.sin(this.angle) * this.orbitRadius;
        } else {
            this.vy += GRAVITY;
            this.x += this.vx;
            this.y += this.vy;
        }
    }
    draw() {
        // Draw Motion Trail
        this.trail.forEach((t, i) => {
            ctx.globalAlpha = i / 24;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(t.x, t.y - cameraY, this.radius * (i / 12), 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#fff';
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y - cameraY, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * Planet Class (Includes Normal and Boss/Sun logic)
 */
class Planet {
    constructor(x, y, radius, type = 'normal') {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.type = type;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = 0.01 + Math.random() * 0.01;
        this.pulse = 0;
        this.visited = false;
        this.textureData = [];
        
        // --- BOSS ORBITAL LOGIC ---
        this.bossParent = null; // Points to the Sun
        this.orbitAngleOffset = 0;
        this.orbitDist = 0;
        this.clusterAngle = 0; // Shared rotation for the ring

        const spotCount = type === 'sun' ? 15 : 6;
        for (let i = 0; i < spotCount; i++) {
            this.textureData.push({
                x: Math.random() * 2 - 1,
                y: Math.random() * 2 - 1,
                r: Math.random() * 0.2 + 0.1
            });
        }
    }

    update() {
        this.rotation += this.rotationSpeed;
        if (this.pulse > 0) this.pulse -= 0.05;

        // Parent-Child update: This makes the cluster rotate around the Boss
        if (this.bossParent) {
            this.bossParent.clusterAngle += 0.002; 
            const finalAngle = this.bossParent.clusterAngle + this.orbitAngleOffset;
            this.x = this.bossParent.x + Math.cos(finalAngle) * this.orbitDist;
            this.y = this.bossParent.y + Math.sin(finalAngle) * this.orbitDist;
        }
    }

    draw() {
        const dY = this.y - cameraY;
        if (dY < -200 || dY > canvas.height + 200) return;

        ctx.save();
        ctx.shadowBlur = this.type === 'sun' ? 40 : 20;
        ctx.shadowColor = this.type === 'sun' ? '#f59e0b' : '#3b82f6';

        let g = ctx.createRadialGradient(this.x, dY, 0, this.x, dY, this.radius + (this.pulse * 10));
        if (this.type === 'sun') {
            g.addColorStop(0, '#fcd34d');
            g.addColorStop(1, '#b45309');
        } else {
            g.addColorStop(0, '#60a5fa');
            g.addColorStop(1, '#1d4ed8');
        }

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, dY, this.radius + (this.pulse * 5), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Texture Spots
        ctx.fillStyle = this.type === 'sun' ? 'rgba(251, 191, 36, 0.4)' : 'rgba(255,255,255,0.15)';
        this.textureData.forEach(t => {
            const rotX = t.x * Math.cos(this.rotation) - t.y * Math.sin(this.rotation);
            const rotY = t.x * Math.sin(this.rotation) + t.y * Math.cos(this.rotation);
            ctx.beginPath();
            ctx.arc(this.x + (rotX * this.radius * 0.7), dY + (rotY * this.radius * 0.7), t.r * this.radius, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
}

const moon = new Moon();

/**
 * Logic to generate planets and periodic bosses
 */
function spawnPlanets() {
    while (planets.length < 15) {
        const isBoss = (planetCount > 0 && planetCount % 20 === 0);
        const y = lastPlanetY - (isBoss ? 600 : 250 + Math.random() * 100);
        
        if (isBoss) {
            // Spawn Main Sun Boss
            const sun = new Planet(canvas.width / 2, y, 95, 'sun');
            sun.clusterAngle = 0;
            planets.push(sun);

            // Spawn its 8 orbital planets
            for (let i = 0; i < 8; i++) {
                const child = new Planet(sun.x, sun.y, 25, 'normal');
                child.bossParent = sun;
                child.orbitAngleOffset = (i / 8) * Math.PI * 2;
                child.orbitDist = 220;
                planets.push(child);
            }
            planetCount++;
            lastPlanetY = y - 350;
        } else {
            const x = 100 + Math.random() * (canvas.width - 200);
            planets.push(new Planet(x, y, 30 + Math.random() * 20));
            lastPlanetY = y;
            planetCount++;
        }
    }
}

function createParticles(x, y, color) {
    for (let i = 0; i < 12; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function handleInput() {
    if (!gameActive) {
        resetGame();
        gameActive = true;
        // Hide overlay if it exists in your HTML
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
        return;
    }

    if (moon.state === 'orbiting') {
        const tangentX = -Math.sin(moon.angle);
        const tangentY = Math.cos(moon.angle);
        const speed = JUMP_FORCE + (Math.abs(moon.orbitSpeed) * 12);
        
        moon.vx = tangentX * speed;
        moon.vy = tangentY * speed;
        moon.state = 'freefall';
        moon.currentPlanet = null;
        createParticles(moon.x, moon.y, '#fff');
    }
}

function resetGame() {
    score = 0;
    cameraY = 0;
    planets = [];
    fallingAsteroids = [];
    particles = [];
    planetCount = 0;
    lastPlanetY = 500;
    
    // Starting planet
    const p = new Planet(canvas.width / 2, 500, 50);
    p.visited = true;
    planets.push(p);
    
    moon.reset();
    moon.currentPlanet = p;
    spawnPlanets();
}

function update() {
    if (!gameActive) return;

    moon.update();

    // Smoothed Camera Follow
    const targetCam = moon.y - canvas.height * 0.6;
    cameraY += (targetCam - cameraY) * 0.1;

    // Particles
    particles.forEach((p, i) => {
        p.update();
        if (p.alpha <= 0) particles.splice(i, 1);
    });

    // Planets
    planets.forEach(p => p.update());

    // Landing on a planet
    if (moon.state === 'freefall') {
        planets.forEach(p => {
            const dx = moon.x - p.x;
            const dy = moon.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < p.radius + moon.radius + 10) {
                moon.state = 'orbiting';
                moon.currentPlanet = p;
                moon.angle = Math.atan2(dy, dx);
                moon.orbitRadius = dist;
                moon.orbitSpeed = 0.04 + (Math.random() * 0.03);
                p.pulse = 1;
                createParticles(moon.x, moon.y, '#3b82f6');

                if (!p.visited) {
                    p.visited = true;
                    score++;
                    if (score > bestScore) {
                        bestScore = score;
                        localStorage.setItem('stickyOrbitBest', bestScore);
                    }
                }
            }
        });
    }

    // Asteroids logic
    if (Math.random() < 0.02) {
        fallingAsteroids.push({
            x: Math.random() * canvas.width,
            y: cameraY - 100,
            vy: 4 + Math.random() * 4,
            radius: 15
        });
    }

    fallingAsteroids.forEach((fa, index) => {
        fa.y += fa.vy;
        const dx = moon.x - fa.x;
        const dy = moon.y - fa.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Fairer hitbox (75% of visual size)
        if (dist < (moon.radius + fa.radius * 0.75)) {
            gameOver();
        }
        if (fa.y > cameraY + canvas.height + 100) fallingAsteroids.splice(index, 1);
    });

    // Cleanup off-screen planets
    if (planets.length > 30) {
        planets = planets.filter(p => p.y < cameraY + canvas.height + 400 || p === moon.currentPlanet);
    }
    spawnPlanets();

    // Fall death
    if (moon.y > cameraY + canvas.height + 200) {
        gameOver();
    }
}

function gameOver() {
    gameActive = false;
    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        document.getElementById('msg').innerText = "CRASHED! TAP TO RESTART";
    }
}

function draw() {
    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars (Simple static starfield)
    ctx.fillStyle = '#fff';
    for(let i=0; i<5; i++) {
        ctx.fillRect((i*213)%canvas.width, (i*712-cameraY*0.2)%canvas.height, 2, 2);
    }

    planets.forEach(p => p.draw());
    particles.forEach(p => p.draw());
    
    fallingAsteroids.forEach(fa => {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(fa.x, fa.y - cameraY, fa.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    moon.draw();

    // UI Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 30, 50);
    ctx.textAlign = 'right';
    ctx.fillText(`Best: ${bestScore}`, canvas.width - 30, 50);

    update();
    requestAnimationFrame(draw);
}

/**
 * Safe Initialization
 */
function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(); });
    window.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(); });

    resetGame();
    draw();
}

function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Start when DOM is ready
window.addEventListener('DOMContentLoaded', init);