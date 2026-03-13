const FINISH_LINE_WORLD_X = 10000;
const TRAIN_WIDTH  = 160;
const TRAIN_HEIGHT = 62;
const CAMERA_LERP  = 0.08;
const TRACK_BACK   = 252;
const TRACK_FRONT  = 278;
const HORIZON_Y    = 200;  // y where sky meets land
const SEGMENT_LEN  = 2500; // world units per theme segment (sahara → city → sahara → city)
const STREET_Y     = 358;  // city street surface y
const PILLAR_GAP   = 120;  // bridge support spacing

// ─── Mountain theme constants ──────────────────────────────────────────────
// Visual curve: steep bell curve (max ±60° slope at steepest points)
const MOUNTAIN_PEAK_HEIGHT = 2285;              // visual elevation in pixels
const MOUNTAIN_CENTER      = FINISH_LINE_WORLD_X / 2;  // 5000
const MOUNTAIN_SIGMA       = 800;               // visual bell curve width

// Physics curve: gentle slope (unchanged gameplay feel)
const MOUNTAIN_PHYSICS_PEAK  = 120;
const MOUNTAIN_PHYSICS_SIGMA = 2200;
const MOUNTAIN_GRAVITY       = 4.0;             // slope effect on speed

function getMountainElevation(worldX) {
    const dx = worldX - MOUNTAIN_CENTER;
    return MOUNTAIN_PEAK_HEIGHT * Math.exp(-(dx * dx) / (2 * MOUNTAIN_SIGMA * MOUNTAIN_SIGMA));
}

function getMountainSlope(worldX) {
    const dx = worldX - MOUNTAIN_CENTER;
    return -getMountainElevation(worldX) * dx / (MOUNTAIN_SIGMA * MOUNTAIN_SIGMA);
}

function getMountainPhysicsSlope(worldX) {
    const dx = worldX - MOUNTAIN_CENTER;
    const elev = MOUNTAIN_PHYSICS_PEAK * Math.exp(-(dx * dx) / (2 * MOUNTAIN_PHYSICS_SIGMA * MOUNTAIN_PHYSICS_SIGMA));
    return -elev * dx / (MOUNTAIN_PHYSICS_SIGMA * MOUNTAIN_PHYSICS_SIGMA);
}

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

const BUILDING_COLORS = ['#263238','#37474f','#455a64','#2c3e50','#1a252f','#2d3561','#1e2a3a'];
function makeBuilding(x) {
    const w    = 80  + Math.random() * 200;
    const h    = 80  + Math.random() * 160;
    const winR = 3   + Math.floor(Math.random() * 5);
    const winC = 2   + Math.floor(Math.random() * 4);
    const lit  = Array.from({ length: winR * winC }, () => Math.random() < 0.6);
    return {
        type: 'building', x, w, h,
        color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
        winR, winC, lit,
    };
}

function makeAlpinePeak(x) {
    const w       = 120 + Math.random() * 180;
    const h       = 80  + Math.random() * 120;
    const peakX   = w * (0.3 + Math.random() * 0.4);
    const hue     = 210 + Math.random() * 20;     // blue-gray
    const sat     = 15  + Math.random() * 20;
    const lgt     = 50  + Math.random() * 15;
    return {
        x, type: 'alpine',
        w, h, peakX,
        color:  `hsl(${hue},${sat}%,${lgt}%)`,
        shadow: `hsl(${hue},${sat * 0.85}%,${lgt - 14}%)`,
        snowH:  h * (0.15 + Math.random() * 0.15),  // always snow-capped
    };
}

// ─────────────────────────────────────────────────────────────────────────────

class TrainGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
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
        this.cameraY = 0;

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
            boostBudget: FINISH_LINE_WORLD_X * 0.40,  // 40 % of race distance
            boosting: false,
            wheelFrame: 0,
            initialRampDone: false,
        };

        this.gameState = { distance: 0, time: 0, isRunning: true, result: null, endTime: null };
        this.raceStarted = false;

        this.wheelFrame = 0;
        this.wheelAnimationSpeed = 0.15;
        this.paused = false;
        this.boostTokens = [];  // timestamps of space presses; each lasts 1 s, max 4 active
        this._boostFlashTimer = null;

        // Pick one theme for the whole race (re-randomised on restart)
        { const r = Math.random(); this.theme = r < 0.33 ? 'sahara' : r < 0.66 ? 'city' : 'mountain'; }

        this.layers = [
            { name: 'mountains', speed: 0.3, objects: [] },
            { name: 'trees',     speed: 0.6, objects: [] },
            { name: 'rocks',     speed: 0.9, objects: [] },
        ];

        this.tunnelZones  = this.generateTunnelZones();
        this.cars         = [];
        this.crowd        = [];
        this.crowdSpawned = false;

        this.generateInitialScenery();
        this.keys = {};
        this.setupInputListeners();

        // ── Engine sound: Web Audio API for gapless start / loop / end ───────
        // AudioContext starts suspended in browsers; resume() is called on first
        // user gesture (keydown / touchstart) so sounds are allowed to play.
        this.audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
        this._engGain    = this.audioCtx.createGain();
        this._engGain.gain.value = 0;
        this._engGain.connect(this.audioCtx.destination);
        this._engBufs    = {};     // 'start' | 'loop' | 'end' → AudioBuffer
        this._engSrc     = null;   // currently playing AudioBufferSourceNode
        this._engPending = null;   // pre-scheduled loop node (during 'starting' state)
        this._soundState = 'idle'; // 'idle' | 'starting' | 'running' | 'stopping'

        // Fetch + decode all three engine clips up front so there is zero
        // buffering delay when the race begins (even on the very first load).
        ['start', 'loop', 'end'].forEach(name => {
            fetch(`assets/sounds/steam_engine_${name}.wav`)
                .then(r => r.arrayBuffer())
                .then(ab => this.audioCtx.decodeAudioData(ab))
                .then(buf => { this._engBufs[name] = buf; })
                .catch(() => {});
        });

        // ── Win / arrival sounds (HTML Audio) ─────────────────────────────
        this.winSound   = new Audio('assets/sounds/this_is_fairy_land.m4a');
        this.standClear = new Audio('assets/sounds/stand_clear_of_closing_doors_please.m4a');
        this.dingDong   = new Audio('assets/sounds/ding_dong.m4a');
        // Preload so the first playback has no buffering gap
        [this.winSound, this.standClear, this.dingDong].forEach(a => { a.preload = 'auto'; });
        this._winSoundPlayed   = false;
        this._winTimers        = [];  // setTimeout IDs — cancelled on reset
        this._winEndedHandlers = [];  // { audio, handler } pairs — removed on reset

        this.lastTime = Date.now();
        this.gameLoop();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        // Keep internal height at 400 (all Y constants depend on it).
        // Scale width to match container aspect ratio so pixels stay square.
        this.canvas.height = 400;
        this.canvas.width = Math.round(cw / ch * 400);
    }

    worldToScreen(worldX) {
        return worldX - this.cameraX + this.canvas.width / 2 - TRAIN_WIDTH / 2;
    }

    getElevation(worldX) {
        return this.theme === 'mountain' ? getMountainElevation(worldX) : 0;
    }

    getSlope(worldX) {
        return this.theme === 'mountain' ? getMountainSlope(worldX) : 0;
    }

    getPhysicsSlope(worldX) {
        return this.theme === 'mountain' ? getMountainPhysicsSlope(worldX) : 0;
    }

    generateInitialScenery() {
        for (const layer of this.layers) {
            // Pre-populate from slightly off left edge to 3 screen-widths ahead
            // (parallax-space coords match screen coords when cameraX === 0)
            let x = -300;
            const spawnUntil = this.canvas.width * 3;
            while (x < spawnUntil) {
                this.spawnObjectForLayer(layer, x);
                x += 150 + Math.random() * 200;
            }
        }
    }

    themeAt(worldX) {
        return this.theme;  // fixed for the whole race, re-randomised on restart
    }

    generateTunnelZones() {
        if (this.theme !== 'city') return [];
        // One continuous tunnel made of 3–5 segments placed end-to-end
        // centered roughly at the midpoint of the race
        const n = 3 + Math.floor(Math.random() * 3);
        const segLens = [];
        for (let i = 0; i < n; i++) segLens.push(380 + Math.random() * 320);
        const totalLen = segLens.reduce((a, b) => a + b, 0);
        const startX = (FINISH_LINE_WORLD_X - totalLen) / 2 + (Math.random() - 0.5) * 500;
        return [{ startX, endX: startX + totalLen }];
    }

    inTunnel(worldX) {
        return this.tunnelZones.some(z => worldX >= z.startX && worldX <= z.endX);
    }

    spawnObjectForLayer(layer, x) {
        const theme = this.themeAt(this.cameraX);
        if (theme === 'sahara') {
            if      (layer.name === 'mountains') layer.objects.push(makeMountain(x));
            else if (layer.name === 'trees')     layer.objects.push(makeTreeCluster(x));
            else                                 layer.objects.push(makeRock(x));
        } else if (theme === 'mountain') {
            if      (layer.name === 'mountains') layer.objects.push(makeAlpinePeak(x));
            else if (layer.name === 'trees')     layer.objects.push(makeTreeCluster(x));
            else                                 layer.objects.push(makeRock(x));
        } else {
            // city: only background layer gets buildings; other layers skipped (city ground is procedural)
            if (layer.name === 'mountains') layer.objects.push(makeBuilding(x));
        }
    }

    spawnCar() {
        const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#ecf0f1','#e8d44d','#e67e22'];
        const goRight = Math.random() < 0.55;
        return {
            x:     this.cameraX + (goRight ? this.canvas.width * 0.6 + Math.random() * 300
                                           : -Math.random() * 300),
            vx:    goRight ? 1 + Math.random() * 1.5 : -(1 + Math.random() * 2),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            w:     28 + Math.floor(Math.random() * 16),
        };
    }

    spawnCrowd() {
        this.crowdSpawned = true;
        const stoppedX = Math.max(this.train.worldX, FINISH_LINE_WORLD_X);
        const count = 24 + Math.floor(Math.random() * 12);  // 24–36 people
        for (let i = 0; i < count; i++) {
            const side = Math.random() < 0.5 ? 1 : -1;
            // Spread out to both sides of the stopped train, staggered depths
            const ox      = TRAIN_WIDTH + 40 + Math.random() * 300;  // 200–500 units out
            const onFront = Math.random() < 0.65;  // 65 % crowd the player's (front) track
            const crowdWorldX = stoppedX + side * ox;
            const elevOffset = this.getElevation(crowdWorldX);
            this.crowd.push({
                x:       crowdWorldX,
                trackY:  (onFront ? TRACK_FRONT - 20 : TRACK_BACK - 20) - elevOffset,
                targetX: stoppedX + (Math.random() - 0.5) * TRAIN_WIDTH * 0.6,
                color:   `hsl(${Math.floor(Math.random() * 360)},70%,60%)`,
                phase:   Math.random() * Math.PI * 2,
                speed:   2.2 + Math.random() * 2.0,   // faster walk: 2–4 px/frame
                opacity: 1.0,
                done:    false,
            });
        }
    }

    updateCars() {
        const theme = this.themeAt(this.cameraX);
        if (theme === 'city') {
            if (this.cars.length < 7) this.cars.push(this.spawnCar());
        } else {
            this.cars = []; // clear cars outside city segments
            return;
        }
        for (const c of this.cars) c.x += c.vx;
        this.cars = this.cars.filter(c => {
            const sx = this.worldToScreen(c.x);
            return sx > -200 && sx < this.canvas.width + 200;
        });
    }

    updateCrowd() {
        for (const p of this.crowd) {
            if (p.done) continue;
            const dx = p.targetX - p.x;
            p.x += Math.sign(dx) * Math.min(Math.abs(dx), p.speed);
            if (Math.abs(dx) < p.speed) {
                p.opacity -= 0.018;  // ~55-frame fade (≈ 0.9 s at 60 fps)
                if (p.opacity <= 0) p.done = true;
            }
        }
        this.crowd = this.crowd.filter(p => !p.done);
    }

    reset(newTheme = false) {
        if (newTheme) {
            const r = Math.random(); this.theme = r < 0.33 ? 'sahara' : r < 0.66 ? 'city' : 'mountain';
        }

        this.train.worldX = 0;
        this.train.vx = 0;
        this.cameraX = 0;
        this.cameraY = 0;

        const slantDir = Math.random() < 0.5 ? 1 : -1;
        this.opponent.worldX = 0;
        this.opponent.vx = 0;
        this.opponent.slant = slantDir * 1.0;
        this.opponent.boostBudget = FINISH_LINE_WORLD_X * 0.40;
        this.opponent.boosting = false;
        this.opponent.wheelFrame = 0;
        this.opponent.initialRampDone = false;

        this.gameState = { distance: 0, time: 0, isRunning: true, result: null, endTime: null };
        this.raceStarted = false;
        this.paused = false;
        this.wheelFrame = 0;
        this.boostTokens = [];

        this.layers = [
            { name: 'mountains', speed: 0.3, objects: [] },
            { name: 'trees',     speed: 0.6, objects: [] },
            { name: 'rocks',     speed: 0.9, objects: [] },
        ];
        this.tunnelZones  = this.generateTunnelZones();
        this.cars         = [];
        this.crowd        = [];
        this.crowdSpawned = false;
        this.generateInitialScenery();

        // Stop all engine sounds and reset Web Audio state machine
        this._stopEngSrc(this._engSrc);
        this._stopEngSrc(this._engPending);
        this._engSrc     = null;
        this._engPending = null;
        this._engGain.gain.value = 0;
        this._soundState = 'idle';

        // Cancel pending timers and remove ended-event listeners from win sequence
        this._winTimers.forEach(id => clearTimeout(id));
        this._winTimers = [];
        this._winEndedHandlers.forEach(({ audio, handler }) =>
            audio.removeEventListener('ended', handler));
        this._winEndedHandlers = [];
        this.winSound.pause();   this.winSound.currentTime = 0;
        this.standClear.pause(); this.standClear.currentTime = 0;
        this.dingDong.pause();   this.dingDong.currentTime = 0;
        this._winSoundPlayed = false;
    }

    togglePause() {
        if (this.gameState.result) return;
        this.paused = !this.paused;
        const btn = document.getElementById('pauseBtn');
        if (this.paused) {
            btn.textContent = '\u25B6';
            btn.classList.add('paused');
        } else {
            btn.textContent = '\u23F8';
            btn.classList.remove('paused');
            this.lastTime = Date.now();
        }
    }

    addBoost() {
        if (this.paused) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.raceStarted = true;
        this.boostTokens.push(Date.now());
    }

    resetUI() {
        const btn = document.getElementById('pauseBtn');
        btn.textContent = '\u23F8';
        btn.classList.remove('paused');
    }

    setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;

            if (this.gameState.result && this.gameState.endTime &&
                Date.now() - this.gameState.endTime > 2500) {
                e.preventDefault();
                this.reset();
                this.resetUI();
                return;
            }

            if (e.key === 'p' || e.key === 'P') {
                this.togglePause();
                return;
            }

            if (this.paused) return;

            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            this.keys[e.key] = true;
            this.raceStarted = true;

            if (e.key === 'ArrowLeft' || e.key === 'a') {
                this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.equilibriumSpeed * 0.5);
            }
            if (e.key === ' ') {
                e.preventDefault();
                this.boostTokens.push(Date.now());
                const boostBtn = document.getElementById('boostBtn');
                boostBtn.classList.add('active');
                clearTimeout(this._boostFlashTimer);
                this._boostFlashTimer = setTimeout(() => boostBtn.classList.remove('active'), 120);
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });

        // ── Touch / iPad support: tap canvas = boost ──────────────────────────
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();

            if (this.gameState.result && this.gameState.endTime &&
                Date.now() - this.gameState.endTime > 2500) {
                this.reset();
                this.resetUI();
                return;
            }

            this.addBoost();
        }, { passive: false });

        // ── UI Buttons ────────────────────────────────────────────────────────
        const restartBtn   = document.getElementById('restartBtn');
        const nextLevelBtn = document.getElementById('nextLevelBtn');
        const pauseBtn     = document.getElementById('pauseBtn');
        const boostBtn     = document.getElementById('boostBtn');

        restartBtn.addEventListener('click', () => {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.reset();
            this.resetUI();
        });

        nextLevelBtn.addEventListener('click', () => {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.reset(true);
            this.resetUI();
        });

        pauseBtn.addEventListener('click', () => { this.togglePause(); });

        // Boost button — mouse
        boostBtn.addEventListener('mousedown', () => {
            this.addBoost();
            boostBtn.classList.add('active');
        });
        boostBtn.addEventListener('mouseup', () => { boostBtn.classList.remove('active'); });
        boostBtn.addEventListener('mouseleave', () => { boostBtn.classList.remove('active'); });

        // Boost button — touch
        boostBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.addBoost();
            boostBtn.classList.add('active');
        }, { passive: false });
        boostBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            boostBtn.classList.remove('active');
        }, { passive: false });
    }

    checkFinish() {
        const pf = this.train.worldX    >= FINISH_LINE_WORLD_X;
        const of = this.opponent.worldX >= FINISH_LINE_WORLD_X;
        if (pf || of) {
            this.gameState.isRunning = false;
            if (pf && of) this.gameState.result = 'tie';
            else if (pf)  this.gameState.result = 'win';
            else          this.gameState.result = 'lose';
            if (!this.gameState.endTime) {
                this.gameState.endTime = Date.now();
                if (this.gameState.result === 'win' && !this._winSoundPlayed) {
                    this._winSoundPlayed = true;

                    // Chain: fairy land ends → stand clear ends → ding dong (no gaps)
                    const onWinEnd = () => {
                        this.standClear.currentTime = 0;
                        this.standClear.play().catch(() => {});
                    };
                    const onStandClearEnd = () => {
                        this.dingDong.currentTime = 0;
                        this.dingDong.play().catch(() => {});
                    };
                    this.winSound.addEventListener('ended', onWinEnd, { once: true });
                    this.standClear.addEventListener('ended', onStandClearEnd, { once: true });
                    this._winEndedHandlers.push(
                        { audio: this.winSound,   handler: onWinEnd },
                        { audio: this.standClear, handler: onStandClearEnd },
                    );

                    this.winSound.currentTime = 0;
                    this.winSound.play().catch(() => {});
                }
            }
        }
    }

    update(deltaTime) {
        if (this.paused) return;

        // ── Post-race: coast to stop, animate crowd, keep cars moving ──────────
        if (!this.gameState.isRunning) {
            this.train.vx    *= this.train.friction;
            this.train.vx    -= this.getPhysicsSlope(this.train.worldX) * MOUNTAIN_GRAVITY;
            this.train.vx     = Math.max(this.train.vx, 0);
            this.train.worldX += this.train.vx;
            this.train.y      = TRACK_FRONT - TRAIN_HEIGHT - this.getElevation(this.train.worldX);
            this.cameraX     += (this.train.worldX - this.cameraX) * CAMERA_LERP;
            this.cameraY     += (this.getElevation(this.train.worldX) - this.cameraY) * CAMERA_LERP;
            this.wheelFrame  += Math.abs(this.train.vx) * this.wheelAnimationSpeed;
            if (this.wheelFrame >= TRAIN_SPRITES.wheels.length) this.wheelFrame = 0;
            this.opponent.vx    *= this.train.friction;
            this.opponent.vx    -= this.getPhysicsSlope(this.opponent.worldX) * MOUNTAIN_GRAVITY;
            this.opponent.vx     = Math.max(this.opponent.vx, 0);
            this.opponent.worldX += this.opponent.vx;
            this.opponent.y      = TRACK_BACK - TRAIN_HEIGHT - this.getElevation(this.opponent.worldX);
            this.opponent.wheelFrame += Math.abs(this.opponent.vx) * this.wheelAnimationSpeed;
            if (this.opponent.wheelFrame >= TRAIN_SPRITES.wheels.length) this.opponent.wheelFrame = 0;
            this.updateCars();
            // Wait until the train nearly stops before placing the crowd,
            // so people spawn at the actual stopped position, not the finish line.
            if (!this.crowdSpawned && Math.abs(this.train.vx) < 0.05) this.spawnCrowd();
            this.updateCrowd();
            this.updateSound();  // fade engine out as train coasts to a stop
            return;
        }

        // Active boost tokens: each press gives +5 % for 1 s, capped at 4 (= +20 %)
        const now = Date.now();
        this.boostTokens = this.boostTokens.filter(t => now - t < 1000);
        const activeBoosts   = Math.min(this.boostTokens.length, 4);
        const boostMultiplier = 1 + activeBoosts * 0.05;           // 1.00 – 1.20
        const effectiveMax   = this.equilibriumSpeed * boostMultiplier;  // 4.0 – 4.8

        // Friction first, then acceleration — equilibrium = accel / (1 - friction) = 4.0
        this.train.vx *= this.train.friction;

        // Auto-accelerate: always push forward once the race has started.
        // Boost tokens (tap / space) raise the ceiling by up to +20 %.
        if (this.raceStarted) {
            this.train.vx = Math.min(this.train.vx + this.train.acceleration * boostMultiplier, effectiveMax);
        }
        // Manual braking still available via ArrowLeft / A on keyboard
        if (this.keys['ArrowLeft'] || this.keys['a']) {
            this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.equilibriumSpeed * 0.5);
        }
        // Mountain slope gravity: uphill slows, downhill speeds (uses gentle physics curve)
        if (this.raceStarted) {
            const playerSlope = this.getPhysicsSlope(this.train.worldX);
            this.train.vx -= playerSlope * MOUNTAIN_GRAVITY;
            this.train.vx = Math.max(this.train.vx, 0.2);  // never roll backwards
        }
        this.train.worldX += this.train.vx;
        this.cameraX += (this.train.worldX - this.cameraX) * CAMERA_LERP;
        this.cameraY += (this.getElevation(this.train.worldX) - this.cameraY) * CAMERA_LERP;
        this.train.y = TRACK_FRONT - TRAIN_HEIGHT - this.getElevation(this.train.worldX);

        if (this.train.vx > 0) this.gameState.distance += this.train.vx;

        this.wheelFrame += Math.abs(this.train.vx) * this.wheelAnimationSpeed;
        if (this.wheelFrame >= TRAIN_SPRITES.wheels.length) this.wheelFrame = 0;

        // Parallax layer management — all coordinates in parallax-space
        // (obj.x is the screen-x when cameraX === 0; visible range = [parallaxOffset, parallaxOffset + W])
        for (const layer of this.layers) {
            const parallaxOffset = this.cameraX * layer.speed;

            // Cull objects that have scrolled past the left edge (generous margin)
            layer.objects = layer.objects.filter(obj => obj.x > parallaxOffset - 400);

            // Find the rightmost object; fall back to the current left edge
            let rightmostX = parallaxOffset;
            for (const obj of layer.objects) {
                if (obj.x > rightmostX) rightmostX = obj.x;
            }

            // Keep objects pre-spawned 3 screen-widths ahead so they never pop in
            const spawnUntil = parallaxOffset + this.canvas.width * 3;
            while (rightmostX < spawnUntil) {
                rightmostX += 150 + Math.random() * 200;
                this.spawnObjectForLayer(layer, rightmostX);
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

        // Scale target speed by the same ratio gravity imposes on the player.
        // Player equilibrium = (accel - slope*G) / (1-friction), so the ratio
        // vs flat ground is (1 - slope * G / accel).  Apply this to the opponent
        // so both trains slow/speed proportionally on slopes.
        const oppSlope = this.getPhysicsSlope(this.opponent.worldX);
        const slopeMultiplier = Math.max(1 - oppSlope * MOUNTAIN_GRAVITY / this.train.acceleration, 0.05);

        let targetSpeed;
        if      (gap > tooFarAhead)  targetSpeed = oppEffectiveTop * 0.4;
        else if (gap < tooFarBehind) targetSpeed = Math.max(this.train.vx + 1.5, oppEffectiveTop);
        else                         targetSpeed = oppEffectiveTop;
        targetSpeed *= slopeMultiplier;

        const diff = targetSpeed - this.opponent.vx;
        if (!this.opponent.initialRampDone) {
            this.opponent.vx += diff * 0.08;
            if (Math.abs(diff) < 0.05) this.opponent.initialRampDone = true;
        } else {
            const maxDelta = this.equilibriumSpeed / (15 * 60);
            this.opponent.vx += Math.sign(diff) * Math.min(Math.abs(diff), maxDelta);
        }
        this.opponent.vx = Math.max(this.opponent.vx, 0.2);

        this.opponent.worldX    += this.opponent.vx;
        this.opponent.y = TRACK_BACK - TRAIN_HEIGHT - this.getElevation(this.opponent.worldX);
        this.opponent.wheelFrame += this.opponent.vx * this.wheelAnimationSpeed;
        if (this.opponent.wheelFrame >= TRAIN_SPRITES.wheels.length) this.opponent.wheelFrame = 0;

        this.updateCars();
        this.checkFinish();
        this.gameState.time += deltaTime;

        // ── Sound: volume tracks speed; restart from silence when re-accelerating after stop ──
        this.updateSound();
    }

    // ── Web Audio helpers ──────────────────────────────────────────────────

    // Create a new AudioBufferSourceNode connected to the engine gain.
    _makeEngSrc(name, loop = false) {
        const buf = this._engBufs[name];
        if (!buf) return null;
        const src = this.audioCtx.createBufferSource();
        src.buffer = buf;
        src.loop   = loop;
        src.connect(this._engGain);
        return src;
    }

    // Safely stop and disconnect a source node (ignores already-stopped errors).
    _stopEngSrc(src) {
        if (!src) return;
        try { src.stop(); } catch (_) {}
        src.disconnect();
    }

    updateSound() {
        const vx  = this.train.vx;
        const vol = Math.min(vx / this.equilibriumSpeed, 0.8);

        switch (this._soundState) {
            case 'idle':
                if (vx > 0.05 && this._engBufs.start && this._engBufs.loop) {
                    const t       = this.audioCtx.currentTime;
                    // Pre-schedule the loop to start exactly when the start clip ends
                    // — sample-accurate, zero gap between the two clips.
                    const startSrc = this._makeEngSrc('start');
                    const loopSrc  = this._makeEngSrc('loop', /*loop=*/true);
                    startSrc.start(t);
                    loopSrc.start(t + this._engBufs.start.duration);

                    // When start finishes, promote pending loop to active source
                    startSrc.onended = () => {
                        if (this._soundState === 'starting') {
                            this._engSrc     = this._engPending;
                            this._engPending = null;
                            this._soundState = 'running';
                        }
                    };

                    this._engGain.gain.value = vol;
                    this._engSrc     = startSrc;
                    this._engPending = loopSrc;
                    this._soundState = 'starting';
                }
                break;

            case 'starting':
                this._engGain.gain.value = vol;
                if (vx <= 0.05) {
                    // Stopped before start clip finished — cancel both nodes
                    this._stopEngSrc(this._engSrc);
                    this._stopEngSrc(this._engPending);
                    this._engSrc     = null;
                    this._engPending = null;
                    this._engGain.gain.value = 0;
                    this._soundState = 'idle';
                }
                break;

            case 'running':
                this._engGain.gain.value = vol;
                if (vx <= 0.05) {
                    // Cross-fade loop → end clip
                    this._stopEngSrc(this._engSrc);
                    this._engSrc = null;
                    if (this._engBufs.end) {
                        const endSrc = this._makeEngSrc('end');
                        this._engGain.gain.value = Math.max(vol, 0.1);
                        endSrc.start();
                        endSrc.onended = () => {
                            if (this._soundState === 'stopping') {
                                this._engGain.gain.value = 0;
                                this._soundState = 'idle';
                            }
                        };
                        this._engSrc = endSrc;
                    } else {
                        this._engGain.gain.value = 0;
                    }
                    this._soundState = 'stopping';
                }
                break;

            case 'stopping':
                this._engGain.gain.value = Math.max(vol, 0);
                if (vx > 0.05) {
                    // Re-accelerated before end clip finished — skip straight to loop
                    this._stopEngSrc(this._engSrc);
                    this._engSrc = null;
                    if (this._engBufs.loop) {
                        const loopSrc = this._makeEngSrc('loop', /*loop=*/true);
                        this._engGain.gain.value = vol;
                        loopSrc.start();
                        this._engSrc = loopSrc;
                    }
                    this._soundState = 'running';
                }
                break;
        }
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

    drawTreeCluster(ctx, obj, screenX, elevationOffset = 0) {
        for (const { dx, px } of obj.trees) {
            const tx = Math.round(screenX + dx);
            const by = TRACK_BACK - TRAIN_HEIGHT + 10 - elevationOffset;

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

    // Draw one passenger cart body matching the locomotive's color language exactly.
    // cx, cy = top-left corner (same convention as renderSprite / locomotive drawing).
    // Spacing carts exactly TRAIN_WIDTH apart lets the transparent art-pixel edges on
    // each side of every sprite create the natural ~8 px coupling gap for free.
    drawSingleCart(ctx, cx, cy, stripeColor, windowColor, wheelFrame, isCity) {
        const p  = 4;           // 1 art-pixel = 4 screen-pixels
        const cw = TRAIN_WIDTH; // 160 screen px = 40 art px

        // ── Left/right border columns (art col 1 and 38) ──────────────────────
        ctx.fillStyle = '#404040';
        ctx.fillRect(cx + p,       cy + p*2, p, p*8);  // left border
        ctx.fillRect(cx + cw-p*2,  cy + p*2, p, p*8);  // right border

        // ── Row 2: top stripe (matches sprite color 5) ─────────────────────────
        ctx.fillStyle = stripeColor;
        ctx.fillRect(cx + p*2, cy + p*2, cw - p*4, p);

        // ── Rows 3–8: body background (lightGray) ─────────────────────────────
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(cx + p*2, cy + p*3, cw - p*4, p*6);

        // ── Rows 4–5: windows — 6 bays matching the sprite window pattern ──────
        // Sprite windows at art cols: 4-7, 10-13, 16-19, 22-25, 28-31, 34-36
        ctx.fillStyle = windowColor;
        const winCols = [p*4, p*10, p*16, p*22, p*28, p*34];
        for (let i = 0; i < winCols.length; i++) {
            const ww = (i < 5) ? p*4 : p*3;  // last bay 3 art-px wide (matches sprite)
            ctx.fillRect(cx + winCols[i], cy + p*4, ww, p*2);
        }

        // ── Rows 6–7: door panels — same bays, full art-pixel pattern ──────────
        // Sprite doors at art cols: 3-7, 9-13, 15-19, 21-25, 27-31, 33-37
        ctx.fillStyle = '#555';
        const doorCols = [p*3, p*9, p*15, p*21, p*27, p*33];
        for (let i = 0; i < doorCols.length; i++) {
            const dw = (i < 5) ? p*5 : p*4;
            ctx.fillRect(cx + doorCols[i], cy + p*6, dw, p*2);
        }

        // ── Row 8: lower body strip ────────────────────────────────────────────
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(cx + p*2, cy + p*8, cw - p*4, p);

        // ── Row 9: underframe (art col 1–38, all darkGray) ────────────────────
        ctx.fillStyle = '#404040';
        ctx.fillRect(cx + p*2, cy + p*9, cw - p*4, p);

        // ── Row 10: axle attachment dots (matching sprite row 10) ─────────────
        if (!isCity) {
            ctx.fillRect(cx + p*2,  cy + p*10, p, p);
            ctx.fillRect(cx + p*36, cy + p*10, p, p);

            // ── Wheels: animated, reuse locomotive wheel sprite ──────────────────
            const wf = Math.floor(wheelFrame) % TRAIN_SPRITES.wheels.length;
            this.renderer.renderSprite(TRAIN_SPRITES.wheels[wf], cx, cy + p*10);
        }
    }

    // Draw as many carts as needed to fill past the left (off-screen) edge.
    drawCarts(ctx, sx, cy, stripeColor, windowColor, wheelFrame, isCity) {
        for (let i = 0; i < 12; i++) {
            const cx = sx - (i + 1) * TRAIN_WIDTH;
            if (cx + TRAIN_WIDTH < 0) break;  // fully off-screen left — stop
            this.drawSingleCart(ctx, cx, cy, stripeColor, windowColor, wheelFrame, isCity);
        }
    }

    // Draw carts following the mountain curve — each cart at its own elevation/rotation.
    drawMountainCarts(ctx, trainWorldX, baseTrackY, stripeColor, windowColor, wheelFrame) {
        for (let i = 0; i < 12; i++) {
            const cartWorldX = trainWorldX - (i + 1) * TRAIN_WIDTH;
            const cartElev = getMountainElevation(cartWorldX);
            const cartSlope = getMountainSlope(cartWorldX);
            const cartSX = this.worldToScreen(cartWorldX);
            if (cartSX + TRAIN_WIDTH < 0) break;
            const angle = -Math.atan(cartSlope);
            // Pivot on the rail contact point (bottom-center of cart)
            const cartTrackY = baseTrackY - cartElev;
            ctx.save();
            ctx.translate(cartSX + TRAIN_WIDTH / 2, cartTrackY);
            ctx.rotate(angle);
            ctx.translate(-TRAIN_WIDTH / 2, -TRAIN_HEIGHT);
            this.drawSingleCart(ctx, 0, 0, stripeColor, windowColor, wheelFrame, false);
            ctx.restore();
        }
    }

    // ─── City draw helpers ─────────────────────────────────────────────────

    drawBuilding(ctx, obj, sx) {
        const base = HORIZON_Y + 10;
        const top  = base - obj.h;
        ctx.fillStyle = obj.color;
        ctx.fillRect(sx, top, obj.w, obj.h);
        // Darker left edge (depth)
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(sx, top, 7, obj.h);
        // Windows
        const pad = 8, wW = Math.max(5, (obj.w - pad * (obj.winC + 1)) / obj.winC);
        const wH  = Math.max(5, (obj.h  - pad * (obj.winR + 1)) / obj.winR);
        for (let r = 0; r < obj.winR; r++) {
            for (let c = 0; c < obj.winC; c++) {
                const wx = sx + pad + c * (wW + pad);
                const wy = top + pad + r * (wH + pad);
                const lit = obj.lit[r * obj.winC + c];
                ctx.fillStyle = lit ? '#ffd54f' : '#1a2a3a';
                ctx.fillRect(wx, wy, wW, wH);
                if (lit) {
                    ctx.fillStyle = 'rgba(255,215,80,0.25)';
                    ctx.fillRect(wx - 1, wy - 1, wW + 2, wH + 2);
                }
            }
        }
    }

    drawCityGround(ctx) {
        const W = this.canvas.width, H = this.canvas.height;

        // Concrete bridge deck (fills the ground area)
        ctx.fillStyle = '#607d8b';
        ctx.fillRect(0, HORIZON_Y, W, H - HORIZON_Y);

        // Bridge guard-rails along each track edge
        ctx.fillStyle = '#90a4ae';
        ctx.fillRect(0, TRACK_BACK  - 9, W, 5);
        ctx.fillRect(0, TRACK_FRONT + 4, W, 5);

        // Pillar supports going down to street
        const off = this.cameraX % PILLAR_GAP;
        ctx.fillStyle = '#546e7a';
        for (let x = -off; x < W; x += PILLAR_GAP) {
            ctx.fillRect(x + PILLAR_GAP / 2 - 6, TRACK_FRONT + 9, 12, STREET_Y - 30 - TRACK_FRONT - 9);
        }

        // Street surface
        ctx.fillStyle = '#37474f';
        ctx.fillRect(0, STREET_Y - 32, W, 32 + H - STREET_Y);

        // Yellow centre-line dashes
        ctx.fillStyle = '#fbc02d';
        const dashOff = this.cameraX % 48;
        for (let x = -dashOff; x < W; x += 48) {
            ctx.fillRect(x, STREET_Y - 18, 24, 4);
        }
        // White kerb lines
        ctx.fillStyle = '#b0bec5';
        ctx.fillRect(0, STREET_Y - 32, W, 2);
        ctx.fillRect(0, STREET_Y - 4,  W, 2);
    }

    drawMountainGround(ctx) {
        const W = this.canvas.width, H = this.canvas.height;
        const step = 4;

        // Anchor gradient to the player's ground level so it always looks good
        // regardless of camera elevation — green at surface, brown below
        const playerElev = this.getElevation(this.train.worldX);
        const surfaceY = TRACK_FRONT + 6 - playerElev;
        const grad = ctx.createLinearGradient(0, surfaceY - 30, 0, surfaceY + 300);
        grad.addColorStop(0,   '#5a7a3a');  // alpine green at surface
        grad.addColorStop(0.3, '#6b8c42');  // meadow green
        grad.addColorStop(0.7, '#8B7355');  // brown earth
        grad.addColorStop(1,   '#5e4a2a');  // dark earth

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Trace the curve across screen width — use the FRONT track as ground reference
        for (let sx = 0; sx <= W; sx += step) {
            const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = getMountainElevation(worldX);
            const gy = TRACK_FRONT + 6 - elev;
            if (sx === 0) ctx.moveTo(sx, gy);
            else          ctx.lineTo(sx, gy);
        }
        // Extend bottom well past screen (camera shifts the viewport)
        ctx.lineTo(W, H + MOUNTAIN_PEAK_HEIGHT);
        ctx.lineTo(0, H + MOUNTAIN_PEAK_HEIGHT);
        ctx.closePath();
        ctx.fill();
    }

    drawMountainTrack(ctx, baseGroundY) {
        const W = this.canvas.width;
        const step = 4;

        // Collect points along the track curve
        const points = [];
        for (let sx = -8; sx <= W + 8; sx += step) {
            const wx = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = getMountainElevation(wx);
            const gy = baseGroundY - elev;
            const slope = getMountainSlope(wx);
            points.push({ sx, gy, slope });
        }

        // Ties every 24px (world-aligned)
        const tieOffset = this.cameraX % 24;
        ctx.fillStyle = '#5C3D1E';
        for (let sx = -tieOffset; sx < W + 24; sx += 24) {
            const wx = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = getMountainElevation(wx);
            const gy = baseGroundY - elev;
            const slope = getMountainSlope(wx);
            const angle = Math.atan(slope);
            ctx.save();
            ctx.translate(sx, gy);
            ctx.rotate(-angle);
            ctx.fillRect(-3, -5, 7, 5);
            ctx.restore();
        }

        // Rails as connected line segments
        ctx.strokeStyle = '#A0A0A0';
        ctx.lineWidth = 2;
        for (const railOffset of [-6, -2]) {
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const x = points[i].sx;
                const y = points[i].gy + railOffset;
                if (i === 0) ctx.moveTo(x, y);
                else         ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    drawCar(ctx, car) {
        const sx = this.worldToScreen(car.x);
        const sy = STREET_Y - 22;
        ctx.fillStyle = car.color;
        ctx.fillRect(sx, sy, car.w, 14);
        // Windshield (front based on direction)
        ctx.fillStyle = 'rgba(160,230,255,0.7)';
        const wsX = car.vx > 0 ? sx + car.w - 9 : sx + 1;
        ctx.fillRect(wsX, sy + 2, 8, 10);
        // Wheels
        ctx.fillStyle = '#111';
        ctx.fillRect(sx + 3,          sy + 11, 6, 4);
        ctx.fillRect(sx + car.w - 9,  sy + 11, 6, 4);
    }

    drawTunnelEffect(ctx) {
        const W     = this.canvas.width;
        const ceilY  = TRACK_BACK - TRAIN_HEIGHT - 5;  // ≈182 — just above the back train
        const floorY = TRACK_FRONT + 28;                // ≈306 — just below the front track
        const bandH  = floorY - ceilY;

        for (const zone of this.tunnelZones) {
            const sx1 = this.worldToScreen(zone.startX);
            const sx2 = this.worldToScreen(zone.endX);
            if (sx2 < 0 || sx1 > W) continue;  // tunnel off-screen, skip

            const drawX = Math.max(0, sx1);
            const drawW = Math.min(W, sx2) - drawX;
            if (drawW <= 0) continue;

            // Clip all drawing to this tunnel's screen rect
            ctx.save();
            ctx.beginPath();
            ctx.rect(drawX, ceilY, drawW, bandH);
            ctx.clip();

            // Dark interior
            ctx.fillStyle = '#0f0f0f';
            ctx.fillRect(drawX, ceilY, drawW, bandH);

            // Ceiling tile lines
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2;
            for (let y = ceilY + 10; y < ceilY + 32; y += 10) {
                ctx.beginPath();
                ctx.moveTo(drawX, y);
                ctx.lineTo(drawX + drawW, y);
                ctx.stroke();
            }

            // Floor tile lines
            for (let y = floorY - 8; y < floorY; y += 8) {
                ctx.beginPath();
                ctx.moveTo(drawX, y);
                ctx.lineTo(drawX + drawW, y);
                ctx.stroke();
            }

            // Overhead lamp glows — world-aligned so they don't slide with camera
            ctx.fillStyle = 'rgba(255,230,100,0.13)';
            const lampStart = zone.startX + 110;
            for (let wx = lampStart; wx < zone.endX; wx += 220) {
                const lx = this.worldToScreen(wx);
                if (lx < drawX || lx > drawX + drawW) continue;
                ctx.beginPath();
                ctx.ellipse(lx, ceilY + 14, 30, 11, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }
    }

    drawTunnelPortals(ctx) {
        // Portal height matches the tunnel band exactly
        const ceilY  = TRACK_BACK - TRAIN_HEIGHT - 5;
        const floorY = TRACK_FRONT + 28;
        const pw = 22;  // jamb thickness

        for (const zone of this.tunnelZones) {
            for (const edgeX of [zone.startX, zone.endX]) {
                const sx = this.worldToScreen(edgeX);
                if (sx < -60 || sx > this.canvas.width + 60) continue;

                ctx.fillStyle = '#5d4037';  // dark brick/concrete
                ctx.fillRect(sx - pw, ceilY,  pw, floorY - ceilY);  // left jamb
                ctx.fillRect(sx,      ceilY,  pw, floorY - ceilY);  // right jamb
                ctx.fillRect(sx - pw, ceilY,  pw * 2, pw);          // top lintel
                ctx.fillRect(sx - pw, floorY - pw, pw * 2, pw);     // bottom sill
            }
        }
    }

    drawCrowdPerson(ctx, person) {
        const sx = this.worldToScreen(person.x);
        if (sx < -14 || sx > this.canvas.width + 14) return;
        const t      = Date.now() / 160 + person.phase;
        const bounce = Math.abs(Math.sin(t)) * 6;
        // Alternate leg stride so it looks like walking
        const legSwing = Math.sin(t * 2.5) * 3;
        const sy = person.trackY - bounce;
        ctx.globalAlpha = person.opacity;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(sx, person.trackY + 3, 7, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body (coat/jacket colour)
        ctx.fillStyle = person.color;
        ctx.fillRect(sx - 4, sy - 10, 8, 7);  // torso

        // Head
        ctx.fillStyle = '#f5c98b';  // skin tone
        ctx.fillRect(sx - 3, sy - 17, 6, 6);

        // Legs (alternate stride)
        ctx.fillStyle = '#333';
        ctx.fillRect(sx - 3,              sy - 3, 3, 6 + legSwing);   // left leg
        ctx.fillRect(sx,                  sy - 3, 3, 6 - legSwing);   // right leg

        // Arms
        ctx.fillStyle = person.color;
        ctx.fillRect(sx - 7, sy - 9, 3, 5);  // left arm
        ctx.fillRect(sx + 4, sy - 9, 3, 5);  // right arm

        ctx.globalAlpha = 1;
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
        const { result, endTime } = this.gameState;
        // Wait 2.5 s after race ends so the crowd boarding animation plays out first
        if (!endTime || Date.now() - endTime < 2500) return;
        const label = result === 'win' ? 'YOU WIN!' : result === 'lose' ? 'YOU LOSE' : 'TIE!';
        const color = result === 'win' ? '#2ecc71'  : result === 'lose' ? '#e74c3c'  : '#f1c40f';
        // Fade in over 0.5 s
        const fadeAlpha = Math.min((Date.now() - endTime - 2500) / 500, 1);
        ctx.fillStyle = `rgba(0,0,0,${0.62 * fadeAlpha})`;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalAlpha = fadeAlpha;
        ctx.font = 'bold 72px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(label, this.canvas.width / 2, this.canvas.height / 2 - 10);
        ctx.font = '24px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText('Press any key to play again', this.canvas.width / 2, this.canvas.height / 2 + 40);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
    }

    draw() {
        const ctx   = this.renderer.ctx;
        const W     = this.canvas.width, H = this.canvas.height;
        const theme = this.themeAt(this.cameraX);
        const tunnel = this.inTunnel(this.cameraX);

        // ── Background / sky ────────────────────────────────────────────────
        if (theme === 'city') {
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0,    '#0a0e1a');
            sky.addColorStop(0.35, '#1a2a4a');
            sky.addColorStop(0.48, '#607d8b'); // bridge deck colour
            sky.addColorStop(1,    '#37474f');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);
        } else if (theme === 'mountain') {
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0,    '#2a7fc6');  // deep alpine blue
            sky.addColorStop(0.5,  '#5aaee8');  // bright blue
            sky.addColorStop(1,    '#8dcaf0');  // pale blue at bottom
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);
        } else {
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0,    '#6baed6');
            sky.addColorStop(0.40, '#a8d5a2');
            sky.addColorStop(0.48, '#8B7355');
            sky.addColorStop(1,    '#5e4a2a');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);
        }

        // ── Vertical camera shift for mountain theme ─────────────────────────
        if (theme === 'mountain') {
            ctx.save();
            ctx.translate(0, this.cameraY);
        }

        // ── Background layer (mountains or city buildings) ───────────────────
        const mLayer = this.layers.find(l => l.name === 'mountains');
        for (const obj of mLayer.objects) {
            const sx = obj.x - this.cameraX * 0.3;
            if (obj.type === 'building')     this.drawBuilding(ctx, obj, sx);
            else if (obj.type === 'alpine')  this.drawMountain(ctx, obj, sx);
            else                             this.drawMountain(ctx, obj, sx);
        }

        // ── City-specific ground, street & pillars ───────────────────────────
        if (theme === 'city') {
            this.drawCityGround(ctx);
            for (const car of this.cars) this.drawCar(ctx, car);
        }

        // ── Mountain ground ──────────────────────────────────────────────────
        if (theme === 'mountain') {
            this.drawMountainGround(ctx);
        }

        // ── Sahara/mountain mid-layer: trees ─────────────────────────────────
        if (theme === 'sahara' || theme === 'mountain') {
            const tLayer = this.layers.find(l => l.name === 'trees');
            for (const obj of tLayer.objects) {
                const sx = obj.x - this.cameraX * 0.6;
                if (theme === 'mountain') {
                    // Convert parallax screen position to world X to get elevation
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    this.drawTreeCluster(ctx, obj, sx, getMountainElevation(worldX));
                } else {
                    this.drawTreeCluster(ctx, obj, sx);
                }
            }
        }

        // ── Tracks + trains (both themes) ───────────────────────────────────
        const isCity = theme === 'city';
        // Hover bob for city theme (no wheels, trains float)
        const oppBob  = isCity ? Math.sin(Date.now() / 400) * 2.5 : 0;
        const trainBob = isCity ? Math.sin(Date.now() / 400 + 1) * 2.5 : 0;

        if (theme === 'mountain') this.drawMountainTrack(ctx, TRACK_BACK);
        else                     this.drawTrack(ctx, TRACK_BACK, 0.85);
        const opponentSX = this.worldToScreen(this.opponent.worldX);
        const oppY = this.opponent.y + oppBob;
        if (theme === 'mountain') {
            this.drawMountainCarts(ctx, this.opponent.worldX, TRACK_BACK, '#3498db', '#2980b9', this.opponent.wheelFrame);
            const oppSlopeAngle = -Math.atan(this.getSlope(this.opponent.worldX));
            // Pivot on rail contact point (bottom-center of locomotive)
            const oppTrackY = TRACK_BACK - this.getElevation(this.opponent.worldX);
            ctx.save();
            ctx.translate(opponentSX + TRAIN_WIDTH / 2, oppTrackY);
            ctx.rotate(oppSlopeAngle);
            ctx.translate(-TRAIN_WIDTH / 2, -TRAIN_HEIGHT);
            if (this.opponent.boosting) this.drawFlame(ctx, 0, 44);
            this.renderer.renderSprite(OPPONENT_SPRITES.idle[0], 0, 0);
            this.renderer.renderSprite(
                OPPONENT_SPRITES.wheels[Math.floor(this.opponent.wheelFrame)],
                0, 40
            );
            ctx.restore();
        } else {
            this.drawCarts(ctx, opponentSX, oppY, '#3498db', '#2980b9', this.opponent.wheelFrame, isCity);
            if (this.opponent.boosting) this.drawFlame(ctx, opponentSX, oppY + 44);
            this.renderer.renderSprite(OPPONENT_SPRITES.idle[0], opponentSX, oppY);
            if (!isCity) {
                this.renderer.renderSprite(
                    OPPONENT_SPRITES.wheels[Math.floor(this.opponent.wheelFrame)],
                    opponentSX, oppY + 40
                );
            }
        }

        // Sahara/mountain rocks
        if (theme === 'sahara' || theme === 'mountain') {
            const rLayer = this.layers.find(l => l.name === 'rocks');
            for (const obj of rLayer.objects) {
                const sx = obj.x - this.cameraX * 0.9;
                let rockY = obj.y;
                if (theme === 'mountain') {
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    rockY -= getMountainElevation(worldX);
                }
                this.renderer.renderSprite(SCENERY_SPRITES.rock, sx, rockY);
            }
        }

        if (theme === 'mountain') this.drawMountainTrack(ctx, TRACK_FRONT);
        else                     this.drawTrack(ctx, TRACK_FRONT, 1.0);
        this.drawFinishLine(ctx);

        const trainSX         = this.worldToScreen(this.train.worldX);
        const trainY          = this.train.y + trainBob;
        const activeBoostsNow = Math.min(this.boostTokens.filter(t => Date.now() - t < 1000).length, 4);
        if (theme === 'mountain') {
            this.drawMountainCarts(ctx, this.train.worldX, TRACK_FRONT, '#e74c3c', '#3498db', this.wheelFrame);
            const trainSlopeAngle = -Math.atan(this.getSlope(this.train.worldX));
            // Pivot on rail contact point (bottom-center of locomotive)
            const trainTrackY = TRACK_FRONT - this.getElevation(this.train.worldX);
            ctx.save();
            ctx.translate(trainSX + TRAIN_WIDTH / 2, trainTrackY);
            ctx.rotate(trainSlopeAngle);
            ctx.translate(-TRAIN_WIDTH / 2, -TRAIN_HEIGHT);
            if (activeBoostsNow > 0) this.drawFlame(ctx, 0, 44);
            this.renderer.renderSprite(TRAIN_SPRITES.idle[0], 0, 0);
            this.renderer.renderSprite(
                TRAIN_SPRITES.wheels[Math.floor(this.wheelFrame)],
                0, 40
            );
            ctx.restore();
        } else {
            this.drawCarts(ctx, trainSX, trainY, '#e74c3c', '#3498db', this.wheelFrame, isCity);
            if (activeBoostsNow > 0) this.drawFlame(ctx, trainSX, trainY + 44);
            this.renderer.renderSprite(TRAIN_SPRITES.idle[0], trainSX, trainY);
            if (!isCity) {
                this.renderer.renderSprite(
                    TRAIN_SPRITES.wheels[Math.floor(this.wheelFrame)],
                    trainSX, trainY + 40
                );
            }
        }

        // ── Tunnel overlay (city only) ───────────────────────────────────────
        if (theme === 'city') {
            this.drawTunnelEffect(ctx);   // draws each visible tunnel zone clipped to its bounds
            this.drawTunnelPortals(ctx);  // portals on top so jambs always crisp at the edges
        }

        // ── End vertical camera shift ──────────────────────────────────────
        if (theme === 'mountain') {
            ctx.restore();
        }

        // ── Result overlay (delayed 2.5 s, fades in) ────────────────────────
        if (this.gameState.result) this.drawResult(ctx);

        // ── Pause overlay ─────────────────────────────────────────────────────
        if (this.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, W, H);
            ctx.font = 'bold 56px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText('PAUSED', W / 2, H / 2);
            ctx.font = '20px monospace';
            ctx.fillText('Press P or Resume to continue', W / 2, H / 2 + 40);
            ctx.textAlign = 'left';
        }

        // ── Crowd boarding — drawn on TOP of result overlay ──────────────────
        for (const p of this.crowd) this.drawCrowdPerson(ctx, p);

        // ── HUD ─────────────────────────────────────────────────────────────
        const activeBoosts = activeBoostsNow;
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
        this.update(deltaTime);  // always runs; handles post-race coasting & crowd internally
        this.draw();
        requestAnimationFrame(this.gameLoop);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    window._game = new TrainGame('gameCanvas');
});
