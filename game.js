const FINISH_LINE_WORLD_X = 10000;
const TRAIN_WIDTH  = 160;
const TRAIN_HEIGHT = 62;
const CAMERA_LERP  = 0.08;
const TRACK_BACK   = 252;
const TRACK_FRONT  = 278;
const HORIZON_Y    = 200;  // y where sky meets land

// ─── Procedural scenery factories ────────────────────────────────────────────

function makeMountain(x) {
    const w       = 80  + Math.random() * 120;
    const h       = 50  + Math.random() * 80;
    const peakX   = w * (0.3 + Math.random() * 0.4);
    const hue     = 20  + Math.random() * 25;
    const sat     = 55  + Math.random() * 30;
    const lgt     = 44  + Math.random() * 18;
    return {
        x, type: 'mountain',
        w, h, peakX,
        color:  `hsl(${hue},${sat}%,${lgt}%)`,
        shadow: `hsl(${hue},${sat * 0.85}%,${lgt - 14}%)`,
        snowH:  Math.random() < 0.3 ? h * (0.15 + Math.random() * 0.15) : 0,
    };
}

function makeTreeCluster(x) {
    const count = 1 + Math.floor(Math.random() * 3);  // 1–3 trees
    const trees = [];
    let dx = 0;
    for (let i = 0; i < count; i++) {
        trees.push({ dx, px: 2 + Math.floor(Math.random() * 3) }); // px size 2–4
        dx += 14 + Math.floor(Math.random() * 18);
    }
    return { x, type: 'trees', trees };
}

function makeRock(x) {
    return { x, type: 'rock', y: TRACK_FRONT - 12 };
}

// ─────────────────────────────────────────────────────────────────────────────

class TrainGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.renderer = new SpriteRenderer(this.canvas, 4);

        this.train = {
            worldX: 0,
            y: TRACK_FRONT - TRAIN_HEIGHT,
            vx: 0,
            maxSpeed: 8,
            acceleration: 0.2,
            friction: 0.95,
        };

        this.cameraX = 0;

        const eq = this.train.acceleration / (1 - this.train.friction); // 4.0
        this.equilibriumSpeed = eq;

        // slant: +1 = fast start / slow finish; -1 = slow start / fast finish (randomised)
        const slantDir = Math.random() < 0.5 ? 1 : -1;
        this.opponent = {
            worldX: 0,
            y: TRACK_BACK - TRAIN_HEIGHT,
            vx: 0,
            topSpeed: eq,          // average speed across the race
            slant: slantDir * 1.0, // speed offset at race start (±1 → range 3–5, avg 4)
            boostBudget: FINISH_LINE_WORLD_X * 0.10,  // 10 % of race distance
            boosting: false,
            wheelFrame: 0,
            initialRampDone: false,
        };

        this.gameState = { distance: 0, time: 0, isRunning: true, result: null };
        this.raceStarted = false;

        this.wheelFrame = 0;
        this.wheelAnimationSpeed = 0.15;
        this.boostTokens = [];  // timestamps of space presses; each lasts 1 s, max 4 active

        this.layers = [
            { name: 'mountains', speed: 0.3, objects: [], nextSpawnX: 0 },
            { name: 'trees',     speed: 0.6, objects: [], nextSpawnX: 0 },
            { name: 'rocks',     speed: 0.9, objects: [], nextSpawnX: 0 },
        ];

        this.generateInitialScenery();
        this.keys = {};
        this.setupInputListeners();
        this.lastTime = Date.now();
        this.gameLoop();
    }

    worldToScreen(worldX) {
        return worldX - this.cameraX + this.canvas.width / 2 - TRAIN_WIDTH / 2;
    }

    generateInitialScenery() {
        for (const layer of this.layers) {
            let x = 0;
            while (x < this.canvas.width * 2) {
                this.spawnObjectForLayer(layer, x);
                x += Math.random() * 200 + 150;
            }
        }
    }

    spawnObjectForLayer(layer, x) {
        if      (layer.name === 'mountains') layer.objects.push(makeMountain(x));
        else if (layer.name === 'trees')     layer.objects.push(makeTreeCluster(x));
        else                                 layer.objects.push(makeRock(x));
    }

    setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;   // ignore OS key-repeat events
            this.keys[e.key] = true;
            this.raceStarted = true;

            if (e.key === 'ArrowRight' || e.key === 'd') {
                this.train.vx = Math.min(this.train.vx + this.train.acceleration, this.equilibriumSpeed);
            }
            if (e.key === 'ArrowLeft' || e.key === 'a') {
                this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.equilibriumSpeed * 0.5);
            }
            if (e.key === ' ') {
                e.preventDefault();
                // Each press adds a 5 % boost token that expires after 1 s (max 4 = 20 %)
                this.boostTokens.push(Date.now());
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
    }

    checkFinish() {
        const pf = this.train.worldX    >= FINISH_LINE_WORLD_X;
        const of = this.opponent.worldX >= FINISH_LINE_WORLD_X;
        if (pf || of) {
            this.gameState.isRunning = false;
            if (pf && of) this.gameState.result = 'tie';
            else if (pf)  this.gameState.result = 'win';
            else          this.gameState.result = 'lose';
        }
    }

    update(deltaTime) {
        // Active boost tokens: each press gives +5 % for 1 s, capped at 4 (= +20 %)
        const now = Date.now();
        this.boostTokens = this.boostTokens.filter(t => now - t < 1000);
        const activeBoosts   = Math.min(this.boostTokens.length, 4);
        const boostMultiplier = 1 + activeBoosts * 0.05;           // 1.00 – 1.20
        const effectiveMax   = this.equilibriumSpeed * boostMultiplier;  // 4.0 – 4.8

        // Friction first, then acceleration — equilibrium = accel / (1 - friction) = 4.0
        this.train.vx *= this.train.friction;

        if (this.keys['ArrowRight'] || this.keys['d'] || this.keys[' ']) {
            // Scale acceleration by boost so equilibrium = (accel * boost) / (1 - friction)
            this.train.vx = Math.min(this.train.vx + this.train.acceleration * boostMultiplier, effectiveMax);
        }
        if (this.keys['ArrowLeft'] || this.keys['a']) {
            this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.equilibriumSpeed * 0.5);
        }
        this.train.worldX += this.train.vx;
        this.cameraX += (this.train.worldX - this.cameraX) * CAMERA_LERP;

        if (this.train.vx > 0) this.gameState.distance += this.train.vx;

        this.wheelFrame += Math.abs(this.train.vx) * this.wheelAnimationSpeed;
        if (this.wheelFrame >= TRAIN_SPRITES.wheels.length) this.wheelFrame = 0;

        // Parallax layer management
        for (const layer of this.layers) {
            const layerScroll = this.cameraX * layer.speed;
            layer.objects = layer.objects.filter(obj => {
                const sx = obj.x - layerScroll;
                return sx > -300 && sx < this.canvas.width + 300;
            });
            const rightmost = layer.objects.length > 0
                ? Math.max(...layer.objects.map(o => o.x))
                : this.train.worldX;
            while (rightmost + layer.nextSpawnX < this.train.worldX + this.canvas.width * 1.5) {
                this.spawnObjectForLayer(layer, rightmost + 150 + Math.random() * 200);
                layer.nextSpawnX += 150 + Math.random() * 200;
            }
        }

        // Opponent AI — stays still until player moves
        if (!this.raceStarted) return;

        // Linear slant: fast-start fades to slow-finish (or reverse), averaging topSpeed
        const progress    = Math.min(Math.max(this.opponent.worldX / FINISH_LINE_WORLD_X, 0), 1);
        const slantSpeed  = this.opponent.topSpeed + this.opponent.slant * (1 - 2 * progress);

        // Opponent boost: activate when behind, spend budget (tracked in world-units)
        const gap = this.opponent.worldX - this.train.worldX;
        if (!this.opponent.boosting && this.opponent.boostBudget > 0 && gap < -150) {
            this.opponent.boosting = true;
        }
        if (this.opponent.boosting) {
            this.opponent.boostBudget -= this.opponent.vx;
            if (this.opponent.boostBudget <= 0 || gap > 50) {
                this.opponent.boosting = false;
                this.opponent.boostBudget = Math.max(0, this.opponent.boostBudget);
            }
        }
        const oppEffectiveTop = slantSpeed * (this.opponent.boosting ? 1.20 : 1.0);

        const tooFarAhead  =  this.canvas.width * 0.55;
        const tooFarBehind = -this.canvas.width * 0.55;

        let targetSpeed;
        if      (gap > tooFarAhead)  targetSpeed = oppEffectiveTop * 0.4;
        else if (gap < tooFarBehind) targetSpeed = Math.max(this.train.vx + 1.5, oppEffectiveTop);
        else                         targetSpeed = oppEffectiveTop;

        const diff = targetSpeed - this.opponent.vx;
        if (!this.opponent.initialRampDone) {
            this.opponent.vx += diff * 0.08;
            if (Math.abs(diff) < 0.05) this.opponent.initialRampDone = true;
        } else {
            const maxDelta = this.equilibriumSpeed / (15 * 60);
            this.opponent.vx += Math.sign(diff) * Math.min(Math.abs(diff), maxDelta);
        }

        this.opponent.worldX    += this.opponent.vx;
        this.opponent.wheelFrame += this.opponent.vx * this.wheelAnimationSpeed;
        if (this.opponent.wheelFrame >= TRAIN_SPRITES.wheels.length) this.opponent.wheelFrame = 0;

        this.checkFinish();
        this.gameState.time += deltaTime;
    }

    // ─── Scenery draw helpers ──────────────────────────────────────────────

    drawMountain(ctx, obj, screenX) {
        const { w, h, peakX, color, shadow, snowH } = obj;
        const baseY = HORIZON_Y;
        const tipX  = screenX + peakX;
        const tipY  = baseY - h;

        // Full triangle (lighter face)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(screenX, baseY);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(screenX + w, baseY);
        ctx.closePath();
        ctx.fill();

        // Right-face shadow
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(screenX + w, baseY);
        ctx.lineTo(tipX + (w - peakX) * 0.45, baseY);
        ctx.closePath();
        ctx.fill();

        // Snow cap
        if (snowH > 0) {
            const sl = tipX - peakX       * (snowH / h);
            const sr = tipX + (w - peakX) * (snowH / h);
            ctx.fillStyle = '#edf4ff';
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(sr,   tipY + snowH);
            ctx.lineTo(sl,   tipY + snowH);
            ctx.closePath();
            ctx.fill();
        }
    }

    drawTreeCluster(ctx, obj, screenX) {
        for (const { dx, px } of obj.trees) {
            const tx = Math.round(screenX + dx);
            const by = TRACK_BACK - TRAIN_HEIGHT + 10;

            ctx.fillStyle = '#1a7a3c';
            ctx.fillRect(tx + px*2, by - px*10, px*2, px);     // tip
            ctx.fillRect(tx + px,   by - px*9,  px*4, px*2);   // upper canopy
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(tx,        by - px*7,  px*6, px*2);   // mid canopy
            ctx.fillRect(tx,        by - px*5,  px*6, px*2);   // lower canopy
            ctx.fillStyle = '#8B7355';
            ctx.fillRect(tx + px*2, by - px*3,  px*2, px*3);   // trunk
        }
    }

    // Flame shoots to the LEFT from (x, y) — the back of a rightward-moving train
    drawFlame(ctx, x, y) {
        const p = this.renderer.pixelSize;          // 4 screen-px per art-px
        const f = Math.floor(Date.now() / 80) % 2;  // 0 or 1, flickers at ~12 fps

        ctx.fillStyle = '#fff9c4';  // white-yellow hot core
        ctx.fillRect(x - p*2,       y - p + f,      p*2, p*2);
        ctx.fillStyle = '#ffd600';  // yellow
        ctx.fillRect(x - p*4,       y - p*2 + f,    p*2, p*3);
        ctx.fillStyle = '#ff8f00';  // amber/orange
        ctx.fillRect(x - p*6 + f,   y - p,          p*3, p*3);
        ctx.fillStyle = '#e53935';  // red tip
        ctx.fillRect(x - p*9,       y,               p*2, p*2);
    }

    drawTrack(ctx, groundY, scrollSpeed) {
        const offset = (this.cameraX * scrollSpeed) % 24;
        ctx.fillStyle = '#5C3D1E';
        for (let x = -offset; x < this.canvas.width + 24; x += 24) {
            ctx.fillRect(x - 1, groundY - 5, 7, 5);
        }
        ctx.fillStyle = '#A0A0A0';
        ctx.fillRect(0, groundY - 6, this.canvas.width, 2);
        ctx.fillRect(0, groundY - 2, this.canvas.width, 2);
    }

    drawFinishLine(ctx) {
        const screenX = this.worldToScreen(FINISH_LINE_WORLD_X);
        if (screenX < -24 || screenX > this.canvas.width + 24) return;
        const ts = 8;
        for (let y = 0; y < this.canvas.height; y += ts) {
            for (let col = 0; col < 3; col++) {
                ctx.fillStyle = (Math.floor(y / ts) + col) % 2 === 0 ? '#111' : '#fff';
                ctx.fillRect(screenX + col * ts, y, ts, ts);
            }
        }
    }

    drawResult(ctx) {
        const { result } = this.gameState;
        const label = result === 'win' ? 'YOU WIN!' : result === 'lose' ? 'YOU LOSE' : 'TIE!';
        const color = result === 'win' ? '#2ecc71'  : result === 'lose' ? '#e74c3c'  : '#f1c40f';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.font = 'bold 72px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(label, this.canvas.width / 2, this.canvas.height / 2 - 10);
        ctx.font = '24px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText('Refresh to play again', this.canvas.width / 2, this.canvas.height / 2 + 40);
        ctx.textAlign = 'left';
    }

    draw() {
        const ctx = this.renderer.ctx;
        const W = this.canvas.width, H = this.canvas.height;

        // Sky gradient — horizon raised to show more land
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0,    '#6baed6');
        sky.addColorStop(0.40, '#a8d5a2');  // greenish horizon
        sky.addColorStop(0.48, '#8B7355');  // hard ground cut at ~48% (y≈192)
        sky.addColorStop(1,    '#5e4a2a');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Mountains (furthest back, slowest parallax)
        const mLayer = this.layers.find(l => l.name === 'mountains');
        for (const obj of mLayer.objects) {
            const sx = obj.x - this.cameraX * 0.3;
            this.drawMountain(ctx, obj, sx);
        }

        // Tree clusters (mid parallax, between tracks)
        const tLayer = this.layers.find(l => l.name === 'trees');
        for (const obj of tLayer.objects) {
            const sx = obj.x - this.cameraX * 0.6;
            this.drawTreeCluster(ctx, obj, sx);
        }

        // Back track + opponent
        this.drawTrack(ctx, TRACK_BACK, 0.85);
        const opponentSX = this.worldToScreen(this.opponent.worldX);
        if (this.opponent.boosting) this.drawFlame(ctx, opponentSX, this.opponent.y + 24);
        this.renderer.renderSprite(OPPONENT_SPRITES.idle[0], opponentSX, this.opponent.y);
        this.renderer.renderSprite(
            OPPONENT_SPRITES.wheels[Math.floor(this.opponent.wheelFrame)],
            opponentSX, this.opponent.y + 40
        );

        // Rocks (near-ground, fast parallax)
        const rLayer = this.layers.find(l => l.name === 'rocks');
        for (const obj of rLayer.objects) {
            const sx = obj.x - this.cameraX * 0.9;
            this.renderer.renderSprite(SCENERY_SPRITES.rock, sx, obj.y);
        }

        // Front track + player
        this.drawTrack(ctx, TRACK_FRONT, 1.0);
        this.drawFinishLine(ctx);
        const trainSX = this.worldToScreen(this.train.worldX);
        const activeBoostsNow = Math.min(this.boostTokens.filter(t => Date.now() - t < 1000).length, 4);
        if (activeBoostsNow > 0) this.drawFlame(ctx, trainSX, this.train.y + 24);
        this.renderer.renderSprite(TRAIN_SPRITES.idle[0], trainSX, this.train.y);
        this.renderer.renderSprite(
            TRAIN_SPRITES.wheels[Math.floor(this.wheelFrame)],
            trainSX, this.train.y + 40
        );

        if (this.gameState.result) this.drawResult(ctx);

        // Boost indicator in UI
        const activeBoosts = Math.min(this.boostTokens.filter(t => Date.now() - t < 1000).length, 4);
        const boostPct     = activeBoosts * 5;

        document.getElementById('speed').textContent =
            Math.round(this.train.vx * 10) / 10 + (activeBoosts > 0 ? ` 🔥+${boostPct}%` : '');
        document.getElementById('distance').textContent =
            `${Math.round(this.gameState.distance)} / ${FINISH_LINE_WORLD_X}`;
    }

    gameLoop = () => {
        const now = Date.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (this.gameState.isRunning) this.update(deltaTime);
        this.draw();
        requestAnimationFrame(this.gameLoop);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    new TrainGame('gameCanvas');
});
