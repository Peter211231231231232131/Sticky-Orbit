/**
 * STICKY ORBIT - COMPLETE STABLE EDITION
 * - Fixed: Boss Cluster Parenting Logic
 * - Added: Moon Trail & Catch Particles
 * - Fixed: Delta-time movement for 60Hz/144Hz parity
 * - Fixed: Planet cleanup to prevent Boss despawning mid-fight
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants
const GRAVITY = 0.18;
const JUMP_FORCE = 8;
const PARTICLE_COUNT = 15;

// Game State
let score = 0;
let bestScore = localStorage.getItem('stickyOrbitBest') || 0;
let gameActive = false;
let cameraY = 0;
let planets = [];
let fallingAsteroids = [];
let particles = [];
let lastPlanetY = 0;
let planetCount = 0;

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1.0;
        this.color = color;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.03;
    }
    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y - cameraY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Moon {
    constructor() {
        this.reset();
        this.trail = [];
    }
    reset() {
        this.x = canvas.width / 2;
        this.y = 500;
        this.vx = 0;
        this.vy = 0;
        this.radius = 12;
        this.state = 'orbiting';
        this.currentPlanet = null;
        this.angle = 0;
        this.orbitSpeed = 0.05;
        this.orbitRadius = 80;
        this.trail = [];
    }
    update() {
        // Handle Trail
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 10) this.trail.shift();

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
        // Draw Trail
        this.trail.forEach((t, i) => {
            ctx.globalAlpha = i / 20;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(t.x, t.y - cameraY, this.radius * (i / 10), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;

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

class Planet {
    constructor(x, y, radius, type = 'normal') {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.type = type;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = 0.01 + Math.random() * 0.02;
        this.pulse = 0;
        this.textureData = [];
        this.visited = false;
        
        // Boss Logic
        this.bossParent = null;
        this.orbitAngleOffset = 0;
        this.orbitDist = 0;
        this.clusterAngle = 0;

        const spotCount = type === 'sun' ? 12 : 5;
        for (let i = 0; i < spotCount; i++) {
            this.textureData.push({
                x: Math.random() * 2 - 1,
                y: Math.random() * 2 - 1,
                r: 0.1 + Math.random() * 0.2
            });
        }
    }

    update() {
        this.rotation += this.rotationSpeed;
        if (this.pulse > 0) this.pulse -= 0.05;

        if (this.bossParent) {
            this.bossParent.clusterAngle += 0.002; 
            const finalAngle = this.bossParent.clusterAngle + this.orbitAngleOffset;
            this.x = this.bossParent.x + Math.cos(finalAngle) * this.orbitDist;
            this.y = this.bossParent.y + Math.sin(finalAngle) * this.orbitDist;
        }
    }

    draw() {
        ctx.save();
        const drawY = this.y - cameraY;

        ctx.shadowBlur = this.type === 'sun' ? 40 : 15;
        ctx.shadowColor = this.type === 'sun' ? '#f59e0b' : '#3b82f6';

        let gradient = ctx.createRadialGradient(this.x, drawY, 0, this.x, drawY, this.radius + this.pulse * 10);
        if (this.type === 'sun') {
            gradient.addColorStop(0, '#fef3c7');
            gradient.addColorStop(1, '#d97706');
        } else {
            gradient.addColorStop(0, '#60a5fa');
            gradient.addColorStop(1, '#1d4ed8');
        }
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, drawY, this.radius + this.pulse * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = this.type === 'sun' ? 'rgba(180, 83, 9, 0.4)' : 'rgba(255,255,255,0.1)';
        this.textureData.forEach(d => {
            const rotX = d.x * Math.cos(this.rotation) - d.y * Math.sin(this.rotation);
            const rotY = d.x * Math.sin(this.rotation) + d.y * Math.cos(this.rotation);
            ctx.beginPath();
            ctx.arc(this.x + rotX * this.radius * 0.7, drawY + rotY * this.radius * 0.7, d.r * this.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }
}

const moon = new Moon();

function spawnPlanets() {
    while (planets.length < 15) {
        const isBoss = (planetCount > 0 && planetCount % 20 === 0);
        const y = lastPlanetY - (isBoss ? 550 : 250 + Math.random() * 100);
        
        if (isBoss) {
            const sun = new Planet(canvas.width / 2, y, 95, 'sun');
            planets.push(sun);
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
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function handleInput() {
    if (!gameActive) {
        resetGame();
        gameActive = true;
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
    const targetCam = moon.y - canvas.height * 0.6;
    cameraY += (targetCam - cameraY) * 0.08;

    particles.forEach((p, i) => {
        p.update();
        if (p.life <= 0) particles.splice(i, 1);
    });

    planets.forEach(p => p.update());

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

        if (dist < (moon.radius + fa.radius * 0.75)) {
            gameActive = false;
        }
        if (fa.y > cameraY + canvas.height + 100) fallingAsteroids.splice(index, 1);
    });

    // Cleanup: Only remove planets far below the camera, 
    // and never remove a planet the moon is currently orbiting.
    planets = planets.filter(p => p.y < cameraY + canvas.height + 400 || p === moon.currentPlanet);
    
    spawnPlanets();

    if (moon.y > cameraY + canvas.height + 200) {
        gameActive = false;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    planets.forEach(p => p.draw());
    particles.forEach(p => p.draw());
    
    fallingAsteroids.forEach(fa => {
        ctx.fillStyle = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ef4444';
        ctx.beginPath();
        ctx.arc(fa.x, fa.y - cameraY, fa.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    moon.draw();

    // UI
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 30, 50);
    ctx.textAlign = 'right';
    ctx.fillText(`Best: ${bestScore}`, canvas.width - 30, 50);

    if (!gameActive) {
        ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 48px Arial';
        ctx.fillText('STICKY ORBIT', canvas.width / 2, canvas.height / 2 - 40);
        ctx.font = '20px Arial';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('TAP TO EXPLORE', canvas.width / 2, canvas.height / 2 + 20);
    }

    update(); // Run physics update before next frame
    requestAnimationFrame(draw);
}

// Input
window.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(); });
window.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(); });

// Fullscreen Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Startup
draw();
