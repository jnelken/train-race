const BASE_FINISH_LINE = 20000;  // 2× original 10k
const MAX_FINISH_LINE  = 30000;  // 3× original 10k
const LENGTH_PER_WIN   = 2000;   // each session win adds length up to max
const ORIGINAL_FINISH_LINE = 10000; // reference distance for speed scaling
const BASE_CRUISE_SPEED = 3;        // cruise at ORIGINAL_FINISH_LINE
const TRAIN_WIDTH  = 160;
const TRAIN_HEIGHT = 62;
const CAMERA_LERP  = 0.08;
const TRACK_BACK   = 252;
const TRACK_FRONT  = 278;
const HORIZON_Y    = 200;  // y where sky meets land
const SEGMENT_LEN  = 2500; // world units per theme segment (sahara → city → sahara → city)
const STREET_Y     = 358;  // city street surface y
const PILLAR_GAP   = 120;  // bridge support spacing
const THEMES       = ['sahara', 'city', 'mountain', 'candy'];

// ─── Mountain theme constants ──────────────────────────────────────────────
// Visual curve: steep bell curve (max ±60° slope at steepest points)
const MOUNTAIN_PEAK_HEIGHT = 2285;              // visual elevation in pixels
const MOUNTAIN_SIGMA       = 800;               // visual bell curve width

// Physics curve: gentle slope (unchanged gameplay feel)
const MOUNTAIN_PHYSICS_PEAK  = 120;
const MOUNTAIN_PHYSICS_SIGMA = 2200;
const MOUNTAIN_GRAVITY       = 4.0;             // slope effect on speed

// ─── Tie system ─────────────────────────────────────────────────────────────
// Trains are held to the rails by gravity, not welded to them. Each body
// (locomotive or cart) carries its own elevation + vertical velocity. The
// track acts as a one-way clamp from below: on climbs the rising rails push
// the body up so it can never detach, but over a convex crest the track can
// drop away faster than gravity pulls the body down — then it goes airborne
// until gravity brings it back to the rails.
const TRAIN_FALL_GRAVITY = 0.025;  // px/frame² downward acceleration while airborne
const TRAIN_ANGLE_LERP   = 0.18;   // per-frame pitch smoothing toward target angle
const AIRBORNE_MAX_PITCH = 0.55;   // rad (~31°) — pitch clamp during flight
const CART_COUNT         = 12;     // trailing carts simulated & drawn per train
const AXLE_OFFSET        = 56;     // px from a car's center to each wheel contact point
const OPPONENT_SPEED_STEP    = 0.05;
const OPPONENT_SPEED_VARIANCE = 0.05;
const OPPONENT_TARGET_WIN_RATE = 0.75;
const OPPONENT_BALANCE_WINDOW  = 4;
const OPPONENT_MAX_SPEED_MULT  = 1.20; // never average faster than +20% over cruise
const PLAYER_BOOST_PER_TOKEN   = 0.05; // each active press: +5% for 1s, uncapped
const BOOST_HOLD_FRAMES_PER_TOKEN = 3; // while held, ~20 tokens/sec per input at 60fps

function pickTheme() {
    return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function raceLengthForWins(winCount) {
    return Math.min(MAX_FINISH_LINE, BASE_FINISH_LINE + winCount * LENGTH_PER_WIN);
}

// Longer races run faster so duration grows slower than distance.
// 10k → 1.0× speed, 20k → 1.5×, 30k → 2.0× (half the distance growth).
function cruiseSpeedForLength(finishLineWorldX) {
    const lengthRatio = finishLineWorldX / ORIGINAL_FINISH_LINE;
    return BASE_CRUISE_SPEED * (1 + 0.5 * (lengthRatio - 1));
}

function getMountainElevation(worldX, center) {
    const dx = worldX - center;
    return MOUNTAIN_PEAK_HEIGHT * Math.exp(-(dx * dx) / (2 * MOUNTAIN_SIGMA * MOUNTAIN_SIGMA));
}

function getMountainSlope(worldX, center) {
    const dx = worldX - center;
    return -getMountainElevation(worldX, center) * dx / (MOUNTAIN_SIGMA * MOUNTAIN_SIGMA);
}

function getMountainPhysicsSlope(worldX, center) {
    const dx = worldX - center;
    const elev = MOUNTAIN_PHYSICS_PEAK * Math.exp(-(dx * dx) / (2 * MOUNTAIN_PHYSICS_SIGMA * MOUNTAIN_PHYSICS_SIGMA));
    return -elev * dx / (MOUNTAIN_PHYSICS_SIGMA * MOUNTAIN_PHYSICS_SIGMA);
}

// ─── Candy theme: rolling semicircle waves (smooth sine ≈ linked arcs) ─────
const CANDY_WAVE_LEN      = 900;   // full hill+valley wavelength in world units
const CANDY_WAVE_AMP      = 72;    // visual elevation amplitude (px)
// Keep physics amp low: player applies slope*MOUNTAIN_GRAVITY additively each
// frame. At amp 28, max drag (~0.78) crushed accel (0.2) and pinned vx at 0.2.
// amp 5 → max drag ~0.14, so hills slow you without stalling.
const CANDY_PHYSICS_AMP   = 5;

function getCandyElevation(worldX) {
    return CANDY_WAVE_AMP * Math.sin((2 * Math.PI * worldX) / CANDY_WAVE_LEN);
}

function getCandySlope(worldX) {
    return CANDY_WAVE_AMP * (2 * Math.PI / CANDY_WAVE_LEN)
        * Math.cos((2 * Math.PI * worldX) / CANDY_WAVE_LEN);
}

function getCandyPhysicsSlope(worldX) {
    return CANDY_PHYSICS_AMP * (2 * Math.PI / CANDY_WAVE_LEN)
        * Math.cos((2 * Math.PI * worldX) / CANDY_WAVE_LEN);
}

// Fresh vertical-physics state for a train's trailing carts. centerX is
// assigned on the first update tick (before the first draw) by walking back
// along the track from the locomotive.
function makeCartStates() {
    return Array.from({ length: CART_COUNT }, () => ({ centerX: 0, elev: 0, vy: 0, airborne: false, angle: 0 }));
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

function makeCloud(x) {
    const w = 70 + Math.random() * 90;
    const h = 28 + Math.random() * 22;
    const y = 40 + Math.random() * 90;
    const tint = Math.random();
    const color = tint < 0.33 ? '#fff5fb' : tint < 0.66 ? '#ffe8f4' : '#f0f8ff';
    return { x, type: 'cloud', w, h, y, color };
}

function makeCandyHill(x) {
    const w     = 100 + Math.random() * 140;
    const h     = 45  + Math.random() * 70;
    const peakX = w * (0.3 + Math.random() * 0.4);
    const hue   = [330, 300, 280, 160, 40][Math.floor(Math.random() * 5)];
    const sat   = 45 + Math.random() * 25;
    const lgt   = 68 + Math.random() * 12;
    return {
        x, type: 'candyHill',
        w, h, peakX,
        color:  `hsl(${hue},${sat}%,${lgt}%)`,
        shadow: `hsl(${hue},${sat}%,${lgt - 12}%)`,
        snowH:  0,
    };
}

function makeRainbow(x) {
    return {
        x, type: 'rainbow',
        w: 140 + Math.random() * 80,
        h: 70  + Math.random() * 40,
    };
}

function makeLollipop(x) {
    const hues = [0, 320, 280, 200, 140, 50];
    return {
        x, type: 'lollipop',
        stickH: 28 + Math.floor(Math.random() * 18),
        radius: 10 + Math.floor(Math.random() * 8),
        hue:    hues[Math.floor(Math.random() * hues.length)],
        swirl:  Math.random() < 0.5,
    };
}

function makeGumdrop(x) {
    const hues = [340, 300, 200, 140, 50, 20];
    return {
        x, type: 'gumdrop',
        y: TRACK_FRONT - 8,
        w: 14 + Math.floor(Math.random() * 12),
        h: 12 + Math.floor(Math.random() * 10),
        hue: hues[Math.floor(Math.random() * hues.length)],
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
            elev: 0,           // height above the flat baseline (up-positive)
            vy: 0,             // vertical velocity (up-positive)
            airborne: false,
            angle: 0,          // render pitch (canvas rotation, radians)
            carts: makeCartStates(),
        };

        this.cameraX = 0;
        this.cameraY = 0;

        this.winCount = 0;
        this.finishLineWorldX = raceLengthForWins(this.winCount);
        this.mountainCenter = this.finishLineWorldX / 2;
        this.cruiseSpeed = cruiseSpeedForLength(this.finishLineWorldX);
        this.opponentDifficulty = {
            baseMultiplier: 1,
            hasSeenLoss: false,
            history: [],
            raceMultiplier: 1,
        };

        // slant: +1 = fast start / slow finish; -1 = slow start / fast finish (randomised)
        const slantDir = Math.random() < 0.5 ? 1 : -1;
        this.opponent = {
            worldX: 0,
            y: TRACK_BACK - TRAIN_HEIGHT,
            vx: 0,
            topSpeed: this.cruiseSpeed, // average speed across the race after difficulty/randomisation
            slant: slantDir * 1.0,      // speed offset at race start / finish
            boostBudget: this.finishLineWorldX * 0.40,  // 40 % of race distance
            boosting: false,
            wheelFrame: 0,
            initialRampDone: false,
            elev: 0,
            vy: 0,
            airborne: false,
            angle: 0,
            carts: makeCartStates(),
        };
        this.configureOpponentSpeed();

        this.gameState = { distance: 0, time: 0, isRunning: true, result: null, endTime: null };
        this.raceStarted = false;

        this.wheelFrame = 0;
        this.wheelAnimationSpeed = 0.15;
        this.paused = false;
        this.boostTokens = [];  // timestamps of boost inputs; each lasts 1 s, uncapped stack
        this._boostFlashTimer = null;
        this.boostHoldAcc = 0;     // fractional frames toward next held-boost token
        this.boostBtnHeld = false; // mouse/touch BOOST button held

        // Pick one theme for the whole race (re-randomised on restart)
        this.theme = pickTheme();

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
        if (this.theme === 'mountain') return getMountainElevation(worldX, this.mountainCenter);
        if (this.theme === 'candy')    return getCandyElevation(worldX);
        return 0;
    }

    getSlope(worldX) {
        if (this.theme === 'mountain') return getMountainSlope(worldX, this.mountainCenter);
        if (this.theme === 'candy')    return getCandySlope(worldX);
        return 0;
    }

    getPhysicsSlope(worldX) {
        if (this.theme === 'mountain') return getMountainPhysicsSlope(worldX, this.mountainCenter);
        if (this.theme === 'candy')    return getCandyPhysicsSlope(worldX);
        return 0;
    }

    hasElevatedTrack() {
        return this.theme === 'mountain' || this.theme === 'candy';
    }

    // Shared slope gravity for player and opponent (additive, same curve).
    applyTrackGravity(body, minVx = 0.2) {
        const slope = this.getPhysicsSlope(body.worldX + TRAIN_WIDTH / 2);
        body.vx -= slope * MOUNTAIN_GRAVITY;
        body.vx = Math.max(body.vx, minVx);
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
        const startX = (this.finishLineWorldX - totalLen) / 2 + (Math.random() - 0.5) * 500;
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
        } else if (theme === 'candy') {
            if (layer.name === 'mountains') {
                const roll = Math.random();
                if (roll < 0.45)      layer.objects.push(makeCloud(x));
                else if (roll < 0.80) layer.objects.push(makeCandyHill(x));
                else                  layer.objects.push(makeRainbow(x));
            } else if (layer.name === 'trees') {
                layer.objects.push(makeLollipop(x));
            } else {
                layer.objects.push(makeGumdrop(x));
            }
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
        const stoppedX = Math.max(this.train.worldX, this.finishLineWorldX);
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

    adjustOpponentDifficulty(result) {
        if (!result || result === 'tie') return;

        const downMultiplier = 1 - OPPONENT_SPEED_STEP;
        const upMultiplier   = 1 + OPPONENT_SPEED_STEP;

        if (!this.opponentDifficulty.hasSeenLoss) {
            if (result === 'win') {
                this.opponentDifficulty.baseMultiplier *= upMultiplier;
                return;
            }

            this.opponentDifficulty.hasSeenLoss = true;
            this.opponentDifficulty.history = [0];
            this.opponentDifficulty.baseMultiplier *= downMultiplier;
            return;
        }

        this.opponentDifficulty.history.push(result === 'win' ? 1 : 0);
        if (this.opponentDifficulty.history.length > OPPONENT_BALANCE_WINDOW) {
            this.opponentDifficulty.history.shift();
        }

        const wins = this.opponentDifficulty.history.reduce((sum, value) => sum + value, 0);
        const winRate = wins / this.opponentDifficulty.history.length;

        if (winRate > OPPONENT_TARGET_WIN_RATE) {
            this.opponentDifficulty.baseMultiplier *= upMultiplier;
        } else if (winRate < OPPONENT_TARGET_WIN_RATE) {
            this.opponentDifficulty.baseMultiplier *= downMultiplier;
        }
    }

    configureOpponentSpeed() {
        const variance = 1 + (Math.random() * 2 - 1) * OPPONENT_SPEED_VARIANCE;
        // Difficulty can keep adapting, but race speed never exceeds +20% cruise.
        const raceMultiplier = Math.min(
            OPPONENT_MAX_SPEED_MULT,
            Math.max(0.25, this.opponentDifficulty.baseMultiplier * variance)
        );
        this.opponentDifficulty.raceMultiplier = raceMultiplier;
        this.opponent.topSpeed = this.cruiseSpeed * raceMultiplier;
    }

    reset(newTheme = false) {
        if (this.gameState.result === 'win') this.winCount++;
        this.adjustOpponentDifficulty(this.gameState.result);
        this.finishLineWorldX = raceLengthForWins(this.winCount);
        this.mountainCenter = this.finishLineWorldX / 2;
        this.cruiseSpeed = cruiseSpeedForLength(this.finishLineWorldX);

        if (newTheme) {
            this.theme = pickTheme();
        }

        this.train.worldX = 0;
        this.train.vx = 0;
        this.train.elev = 0;
        this.train.vy = 0;
        this.train.airborne = false;
        this.train.angle = 0;
        this.train.carts = makeCartStates();
        this.train.y = TRACK_FRONT - TRAIN_HEIGHT;
        this.cameraX = 0;
        this.cameraY = 0;

        const slantDir = Math.random() < 0.5 ? 1 : -1;
        this.opponent.worldX = 0;
        this.opponent.vx = 0;
        this.opponent.slant = slantDir * 1.0;
        this.opponent.boostBudget = this.finishLineWorldX * 0.40;
        this.opponent.boosting = false;
        this.opponent.wheelFrame = 0;
        this.opponent.initialRampDone = false;
        this.opponent.elev = 0;
        this.opponent.vy = 0;
        this.opponent.airborne = false;
        this.opponent.angle = 0;
        this.opponent.carts = makeCartStates();
        this.opponent.y = TRACK_BACK - TRAIN_HEIGHT;
        this.configureOpponentSpeed();

        this.gameState = { distance: 0, time: 0, isRunning: true, result: null, endTime: null };
        this.raceStarted = false;
        this.paused = false;
        this.wheelFrame = 0;
        this.boostTokens = [];
        this.boostHoldAcc = 0;
        this.boostBtnHeld = false;

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

    flashBoostButton() {
        const boostBtn = document.getElementById('boostBtn');
        boostBtn.classList.add('active');
        clearTimeout(this._boostFlashTimer);
        this._boostFlashTimer = setTimeout(() => boostBtn.classList.remove('active'), 120);
    }

    // How many boost inputs are currently held (Space, Right, on-screen button).
    heldBoostInputCount() {
        return (this.keys[' '] ? 1 : 0)
            + (this.keys['ArrowRight'] ? 1 : 0)
            + (this.boostBtnHeld ? 1 : 0);
    }

    // While boost inputs are held, keep stacking tokens — keydown alone can't
    // exceed ~10 taps/s (~+50%), which felt like a hard cap.
    applyHeldBoosts() {
        const held = this.heldBoostInputCount();
        if (held <= 0 || this.paused || !this.gameState.isRunning) {
            this.boostHoldAcc = 0;
            return;
        }
        this.boostHoldAcc += held;
        while (this.boostHoldAcc >= BOOST_HOLD_FRAMES_PER_TOKEN) {
            this.boostHoldAcc -= BOOST_HOLD_FRAMES_PER_TOKEN;
            this.boostTokens.push(Date.now());
        }
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
                this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.cruiseSpeed * 0.5);
            }
            if (e.key === ' ' || e.key === 'ArrowRight') {
                e.preventDefault();
                this.addBoost();
                this.flashBoostButton();
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

        // Boost button — mouse (hold to keep stacking)
        boostBtn.addEventListener('mousedown', () => {
            this.boostBtnHeld = true;
            this.addBoost();
            boostBtn.classList.add('active');
        });
        const releaseBoostBtn = () => {
            this.boostBtnHeld = false;
            boostBtn.classList.remove('active');
        };
        boostBtn.addEventListener('mouseup', releaseBoostBtn);
        boostBtn.addEventListener('mouseleave', releaseBoostBtn);

        // Boost button — touch (hold to keep stacking)
        boostBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.boostBtnHeld = true;
            this.addBoost();
            boostBtn.classList.add('active');
        }, { passive: false });
        boostBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            releaseBoostBtn();
        }, { passive: false });
        boostBtn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            releaseBoostBtn();
        }, { passive: false });
    }

    checkFinish() {
        const pf = this.train.worldX    >= this.finishLineWorldX;
        const of = this.opponent.worldX >= this.finishLineWorldX;
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

    // ── Tie-system vertical physics + render pitch for one body ─────────────
    // Each body (locomotive or cart) rides on two axles, so its ground
    // reference is the CHORD between the wheel contact points — this keeps the
    // wheels on the rails through tight crests/valleys and stops adjacent car
    // ends crossing into each other. Integrate gravity, then clamp against
    // that chord from below. While grounded, vy is set to the track's own
    // vertical rate so a body riding a steady slope stays glued; it lifts off
    // only when the track curves away downward faster than gravity
    // accelerates the body (the crest before a steep drop). Game rule on top
    // of the pure physics: while a grounded body is climbing, the ties hold
    // it down unconditionally — without this a fast train would ski-jump off
    // the convex flattening just BEFORE the summit, i.e. detach on the
    // uphill, which is never allowed.
    updateBodyVertical(body, centerWorldX, vx) {
        const elevFront = this.getElevation(centerWorldX + AXLE_OFFSET);
        const elevRear  = this.getElevation(centerWorldX - AXLE_OFFSET);
        const chordElev = (elevFront + elevRear) / 2;
        const prevElev  = body.elev;
        body.vy   -= TRAIN_FALL_GRAVITY;
        body.elev += body.vy;
        const tiedUphill = !body.airborne && elevFront > elevRear;
        if (body.elev <= chordElev || tiedUphill) {
            body.elev     = chordElev;
            body.vy       = chordElev - prevElev;  // follow the track's vertical rate
            body.airborne = false;
        } else {
            body.airborne = true;
        }
        let targetAngle;
        if (body.airborne) {
            // Nose follows the flight direction, clamped for readability
            targetAngle = -Math.atan2(body.vy, Math.max(vx, 0.5));
            targetAngle = Math.max(-AIRBORNE_MAX_PITCH, Math.min(AIRBORNE_MAX_PITCH, targetAngle));
        } else {
            targetAngle = -Math.atan2(elevFront - elevRear, 2 * AXLE_OFFSET);
        }
        body.angle += (targetAngle - body.angle) * TRAIN_ANGLE_LERP;
    }

    // Walk backward from world x `fromX` by `dist` measured ALONG the track
    // surface (arc length). On steep slopes one car length of track spans far
    // less horizontal distance than on the flat, so spacing carts by arc
    // length keeps couplings tight instead of stretching cars apart on grades
    // and piling them into each other where the slope levels out.
    trailAlongTrack(fromX, dist) {
        const STEP = 8;
        let x = fromX, remaining = dist;
        for (;;) {
            const slope = this.getSlope(x - STEP / 2);
            const arcPerDx = Math.sqrt(1 + slope * slope);
            if (STEP * arcPerDx >= remaining) return x - remaining / arcPerDx;
            x -= STEP;
            remaining -= STEP * arcPerDx;
        }
    }

    // Update a whole consist: locomotive plus its trailing carts, each body
    // simulated at its own center so the train articulates over the terrain.
    // Grounded cars space by track arc length. Airborne cars (leader flying,
    // or a follower that lifted while the leader is still on rails) lock one
    // car-length along the leader's pitch — otherwise track-following X +
    // independent ballistic elev tears couplers apart on fast crest/descent
    // launches. Soft-settle onto the chord when rejoining the rails so the
    // elev jump doesn't invent a huge positive vy.
    updateTrainVertical(train) {
        let prevCX = train.worldX + TRAIN_WIDTH / 2;
        this.updateBodyVertical(train, prevCX, train.vx);
        let prev = train;
        for (const cart of train.carts) {
            if (prev.airborne) {
                const centerX = prevCX - TRAIN_WIDTH * Math.cos(prev.angle);
                cart.centerX = centerX;
                cart.elev = prev.elev + TRAIN_WIDTH * Math.sin(prev.angle);
                cart.vy = prev.vy;
                cart.airborne = true;
                cart.angle += (prev.angle - cart.angle) * TRAIN_ANGLE_LERP;
                prev = cart;
                prevCX = centerX;
                continue;
            }

            const centerX = this.trailAlongTrack(prevCX, TRAIN_WIDTH);
            cart.centerX = centerX;
            if (cart.airborne) {
                const elevFront = this.getElevation(centerX + AXLE_OFFSET);
                const elevRear  = this.getElevation(centerX - AXLE_OFFSET);
                cart.elev = (elevFront + elevRear) / 2;
                cart.vy = 0;
                cart.airborne = false;
                cart.angle = -Math.atan2(elevFront - elevRear, 2 * AXLE_OFFSET);
            }
            this.updateBodyVertical(cart, centerX, train.vx);

            // Follower ski-jumped while the leader is still on the rails —
            // haul it back to the coupled pose so the consist doesn't open.
            if (cart.airborne) {
                cart.centerX = prevCX - TRAIN_WIDTH * Math.cos(prev.angle);
                cart.elev = prev.elev + TRAIN_WIDTH * Math.sin(prev.angle);
                cart.vy = prev.vy;
                const elevFront = this.getElevation(cart.centerX + AXLE_OFFSET);
                const elevRear  = this.getElevation(cart.centerX - AXLE_OFFSET);
                const chordElev = (elevFront + elevRear) / 2;
                if (cart.elev <= chordElev) {
                    cart.elev = chordElev;
                    cart.vy = 0;
                    cart.airborne = false;
                    cart.angle = -Math.atan2(elevFront - elevRear, 2 * AXLE_OFFSET);
                } else {
                    cart.airborne = true;
                    cart.angle += (prev.angle - cart.angle) * TRAIN_ANGLE_LERP;
                }
            }

            prev = cart;
            prevCX = cart.centerX;
        }
    }

    update(deltaTime) {
        if (this.paused) return;

        // ── Post-race: coast to stop, animate crowd, keep cars moving ──────────
        if (!this.gameState.isRunning) {
            this.train.vx    *= this.train.friction;
            this.applyTrackGravity(this.train, 0);
            this.train.worldX += this.train.vx;
            this.updateTrainVertical(this.train);
            this.train.y      = TRACK_FRONT - TRAIN_HEIGHT - this.train.elev;
            this.cameraX     += (this.train.worldX - this.cameraX) * CAMERA_LERP;
            this.cameraY     += (this.train.elev - this.cameraY) * CAMERA_LERP;
            this.wheelFrame  += Math.abs(this.train.vx) * this.wheelAnimationSpeed;
            if (this.wheelFrame >= TRAIN_SPRITES.wheels.length) this.wheelFrame = 0;
            this.opponent.vx    *= this.train.friction;
            this.applyTrackGravity(this.opponent, 0);
            this.opponent.worldX += this.opponent.vx;
            this.updateTrainVertical(this.opponent);
            this.opponent.y      = TRACK_BACK - TRAIN_HEIGHT - this.opponent.elev;
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

        // Active boost tokens: each press/hold tick gives +5 % for 1 s, uncapped
        const now = Date.now();
        this.applyHeldBoosts();
        this.boostTokens = this.boostTokens.filter(t => now - t < 1000);
        const activeBoosts   = this.boostTokens.length;
        const boostMultiplier = 1 + activeBoosts * PLAYER_BOOST_PER_TOKEN;
        const effectiveMax   = this.cruiseSpeed * boostMultiplier;

        // Friction first, then acceleration — raw equilibrium is 4.0,
        // but the race caps the default cruise speed at cruiseSpeed before boosts.
        this.train.vx *= this.train.friction;

        // Auto-accelerate: always push forward once the race has started.
        // Boost tokens (tap / space) raise the ceiling with no stack cap.
        if (this.raceStarted) {
            this.train.vx = Math.min(this.train.vx + this.train.acceleration * boostMultiplier, effectiveMax);
        }
        // Manual braking still available via ArrowLeft / A on keyboard
        if (this.keys['ArrowLeft'] || this.keys['a']) {
            this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.cruiseSpeed * 0.5);
        }
        // Mountain/candy slope gravity: uphill slows, downhill speeds. Same
        // additive curve for player and opponent so hills stay fair.
        if (this.raceStarted) {
            this.applyTrackGravity(this.train);
        }
        this.train.worldX += this.train.vx;
        this.updateTrainVertical(this.train);
        this.cameraX += (this.train.worldX - this.cameraX) * CAMERA_LERP;
        this.cameraY += (this.train.elev - this.cameraY) * CAMERA_LERP;
        this.train.y = TRACK_FRONT - TRAIN_HEIGHT - this.train.elev;

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
        const progress    = Math.min(Math.max(this.opponent.worldX / this.finishLineWorldX, 0), 1);
        const slantSpeed  = this.opponent.topSpeed + this.opponent.slant * (1 - 2 * progress);
        const oppSpeedCap = this.cruiseSpeed * OPPONENT_MAX_SPEED_MULT;

        // Opponent boost: activate when behind, spend budget (tracked in world-units).
        // Instantaneous speed is still hard-capped at +20% cruise so average never exceeds that.
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
        const oppEffectiveTop = Math.min(
            oppSpeedCap,
            slantSpeed * (this.opponent.boosting ? OPPONENT_MAX_SPEED_MULT : 1.0)
        );

        // Flat-ground AI target (opponent cruise/boost capped at +20%).
        // Slope gravity is applied afterward with the same additive rule as the player.
        const tooFarAhead  =  this.canvas.width * 0.55;
        const tooFarBehind = -this.canvas.width * 0.55;

        let targetSpeed;
        if      (gap > tooFarAhead)  targetSpeed = oppEffectiveTop * 0.4;
        else if (gap < tooFarBehind) targetSpeed = oppEffectiveTop;
        else                         targetSpeed = oppEffectiveTop;

        const diff = targetSpeed - this.opponent.vx;
        if (!this.opponent.initialRampDone) {
            this.opponent.vx += diff * 0.08;
            if (Math.abs(diff) < 0.05) this.opponent.initialRampDone = true;
        } else {
            const maxDelta = this.cruiseSpeed / (15 * 60);
            this.opponent.vx += Math.sign(diff) * Math.min(Math.abs(diff), maxDelta);
        }
        this.applyTrackGravity(this.opponent);

        this.opponent.worldX    += this.opponent.vx;
        this.updateTrainVertical(this.opponent);
        this.opponent.y = TRACK_BACK - TRAIN_HEIGHT - this.opponent.elev;
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
        const vol = Math.min(vx / this.cruiseSpeed, 0.8);

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

    drawCloud(ctx, obj, screenX) {
        const { w, h, y, color } = obj;
        ctx.fillStyle = color;
        // Soft overlapping ellipses for a fluffy cloud
        ctx.beginPath();
        ctx.ellipse(screenX + w * 0.30, y + h * 0.55, w * 0.28, h * 0.42, 0, 0, Math.PI * 2);
        ctx.ellipse(screenX + w * 0.55, y + h * 0.40, w * 0.35, h * 0.50, 0, 0, Math.PI * 2);
        ctx.ellipse(screenX + w * 0.75, y + h * 0.55, w * 0.26, h * 0.38, 0, 0, Math.PI * 2);
        ctx.ellipse(screenX + w * 0.48, y + h * 0.65, w * 0.32, h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    drawRainbow(ctx, obj, screenX) {
        const { w, h } = obj;
        const cx = screenX + w / 2;
        const cy = HORIZON_Y + 8 - Math.max(0, (h - 70) * 0.15);
        const bands = ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#74c0fc', '#b197fc'];
        for (let i = 0; i < bands.length; i++) {
            const outerR = w / 2 - i * 5;
            const innerR = outerR - 5;
            if (innerR <= 0) break;
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, Math.PI, 0, false);
            ctx.arc(cx, cy, innerR, 0, Math.PI, true);
            ctx.closePath();
            ctx.fillStyle = bands[i];
            ctx.globalAlpha = 0.75;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    drawLollipop(ctx, obj, screenX, elevationOffset = 0) {
        const baseY = TRACK_BACK - 8 - elevationOffset;
        const r = obj.radius;
        const stickTop = baseY - obj.stickH;
        ctx.fillStyle = '#f8f0e3';
        ctx.fillRect(Math.round(screenX + r - 2), stickTop, 4, obj.stickH);
        ctx.fillStyle = `hsl(${obj.hue},75%,58%)`;
        ctx.beginPath();
        ctx.arc(screenX + r, stickTop, r, 0, Math.PI * 2);
        ctx.fill();
        if (obj.swirl) {
            ctx.strokeStyle = `hsl(${obj.hue},80%,78%)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screenX + r, stickTop, r * 0.55, 0.2, Math.PI * 1.4);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(screenX + r - r * 0.3, stickTop - r * 0.3, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
    }

    drawGumdrop(ctx, obj, screenX, elevationOffset = 0) {
        const { w, h, y, hue } = obj;
        const gy = y - elevationOffset;
        ctx.fillStyle = `hsl(${hue},70%,55%)`;
        ctx.beginPath();
        ctx.moveTo(screenX, gy);
        ctx.quadraticCurveTo(screenX + w / 2, gy - h, screenX + w, gy);
        ctx.quadraticCurveTo(screenX + w / 2, gy + h * 0.25, screenX, gy);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(screenX + w * 0.35, gy - h * 0.35, w * 0.18, h * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    drawCandyGround(ctx) {
        const W = this.canvas.width, H = this.canvas.height;
        const step = 4;
        const playerElev = this.getElevation(this.train.worldX + TRAIN_WIDTH / 2);
        const surfaceY = TRACK_FRONT + 6 - playerElev;
        const grad = ctx.createLinearGradient(0, surfaceY - 40, 0, surfaceY + 280);
        grad.addColorStop(0,   '#f7c6e0');
        grad.addColorStop(0.35,'#e8d4f8');
        grad.addColorStop(0.7, '#d4f0e8');
        grad.addColorStop(1,   '#c8e6f5');
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let sx = 0; sx <= W; sx += step) {
            const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = this.getElevation(worldX);
            const gy = TRACK_FRONT + 6 - elev;
            if (sx === 0) ctx.moveTo(sx, gy);
            else          ctx.lineTo(sx, gy);
        }
        ctx.lineTo(W, H + CANDY_WAVE_AMP + 400);
        ctx.lineTo(0, H + CANDY_WAVE_AMP + 400);
        ctx.closePath();
        ctx.fill();
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

    // Draw carts following the mountain terrain — each cart rendered from its
    // own simulated tie-physics state (elevation + pitch), so the consist
    // articulates over crests and can trail the locomotive through the air.
    drawMountainCarts(ctx, train, baseTrackY, stripeColor, windowColor, wheelFrame) {
        for (const cart of train.carts) {
            const cartSX = this.worldToScreen(cart.centerX - TRAIN_WIDTH / 2);
            if (cartSX + TRAIN_WIDTH < 0) break;
            // Pivot on the rail contact point (bottom-center of cart)
            ctx.save();
            ctx.translate(cartSX + TRAIN_WIDTH / 2, baseTrackY - cart.elev);
            ctx.rotate(cart.angle);
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
        const playerElev = this.getElevation(this.train.worldX + TRAIN_WIDTH / 2);
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
            const elev = this.getElevation(worldX);
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
        const candy = this.theme === 'candy';

        // Collect points along the track curve
        const points = [];
        for (let sx = -8; sx <= W + 8; sx += step) {
            const wx = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = this.getElevation(wx);
            const gy = baseGroundY - elev;
            const slope = this.getSlope(wx);
            points.push({ sx, gy, slope });
        }

        // Ties every 24px (world-aligned)
        const tieOffset = this.cameraX % 24;
        ctx.fillStyle = candy ? '#c47a9e' : '#5C3D1E';
        for (let sx = -tieOffset; sx < W + 24; sx += 24) {
            const wx = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = this.getElevation(wx);
            const gy = baseGroundY - elev;
            const slope = this.getSlope(wx);
            const angle = Math.atan(slope);
            ctx.save();
            ctx.translate(sx, gy);
            ctx.rotate(-angle);
            ctx.fillRect(-3, -5, 7, 5);
            ctx.restore();
        }

        // Rails as connected line segments
        ctx.strokeStyle = candy ? '#f5d0ea' : '#A0A0A0';
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

    drawTrack(ctx, groundY, scrollSpeed, candy = false) {
        const offset = (this.cameraX * scrollSpeed) % 24;
        ctx.fillStyle = candy ? '#c47a9e' : '#5C3D1E';
        for (let x = -offset; x < this.canvas.width + 24; x += 24) {
            ctx.fillRect(x - 1, groundY - 5, 7, 5);
        }
        ctx.fillStyle = candy ? '#f5d0ea' : '#A0A0A0';
        ctx.fillRect(0, groundY - 6, this.canvas.width, 2);
        ctx.fillRect(0, groundY - 2, this.canvas.width, 2);
    }

    drawFinishLine(ctx) {
        const screenX = this.worldToScreen(this.finishLineWorldX);
        if (screenX < -24 || screenX > this.canvas.width + 24) return;
        const ts = 8;
        for (let y = 0; y < this.canvas.height; y += ts) {
            for (let col = 0; col < 3; col++) {
                ctx.fillStyle = (Math.floor(y / ts) + col) % 2 === 0 ? '#111' : '#fff';
                ctx.fillRect(screenX + col * ts, y, ts, ts);
            }
        }
    }

    // Race-progress strip (top-right). Thin course line with start/finish ticks;
    // mountain theme adds a faint elevation silhouette under the markers.
    drawMinimap(ctx) {
        const W = this.canvas.width;
        const isMountain = this.theme === 'mountain';
        const isCandy = this.theme === 'candy';
        const lightTheme = isCandy || this.theme === 'sahara';
        const mapW = Math.round(Math.min(220, Math.max(140, W * 0.22)));
        const mapH = (isMountain || isCandy) ? 34 : 14;
        const pad  = 10;
        const x0   = W - mapW - pad;
        const y0   = pad;
        const lineY = (isMountain || isCandy) ? y0 + mapH - 4 : y0 + mapH / 2;

        // Solid-enough panel so the strip stays readable on pastel candy / sahara skies
        ctx.fillStyle = lightTheme ? 'rgba(20,16,28,0.72)' : 'rgba(0,0,0,0.45)';
        ctx.fillRect(x0 - 6, y0 - 4, mapW + 12, mapH + 10);

        if (isMountain || isCandy) {
            const peak = isMountain ? MOUNTAIN_PEAK_HEIGHT : CANDY_WAVE_AMP;
            const elevScale = (mapH - 6) / (peak * (isCandy ? 2 : 1));
            const baseElev = isCandy ? CANDY_WAVE_AMP : 0;
            ctx.beginPath();
            ctx.moveTo(x0, lineY);
            for (let i = 0; i <= mapW; i++) {
                const elev = this.getElevation((i / mapW) * this.finishLineWorldX);
                ctx.lineTo(x0 + i, lineY - (elev + baseElev) * elevScale);
            }
            ctx.lineTo(x0 + mapW, lineY);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fill();

            ctx.beginPath();
            for (let i = 0; i <= mapW; i++) {
                const elev = this.getElevation((i / mapW) * this.finishLineWorldX);
                const ey = lineY - (elev + baseElev) * elevScale;
                if (i === 0) ctx.moveTo(x0 + i, ey);
                else ctx.lineTo(x0 + i, ey);
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, lineY);
        ctx.lineTo(x0 + mapW, lineY);
        ctx.stroke();

        // Start / finish ticks
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, lineY - 5);
        ctx.lineTo(x0, lineY + 5);
        ctx.moveTo(x0 + mapW, lineY - 5);
        ctx.lineTo(x0 + mapW, lineY + 5);
        ctx.stroke();

        const markerY = (worldX) => {
            if (!isMountain && !isCandy) return lineY;
            const elev = this.getElevation(
                Math.min(Math.max(worldX, 0), this.finishLineWorldX)
            );
            if (isCandy) {
                const elevScale = (mapH - 6) / (CANDY_WAVE_AMP * 2);
                return lineY - (elev + CANDY_WAVE_AMP) * elevScale;
            }
            return lineY - elev * ((mapH - 6) / MOUNTAIN_PEAK_HEIGHT);
        };
        const drawMarker = (worldX, color) => {
            const t = Math.min(Math.max(worldX / this.finishLineWorldX, 0), 1);
            const mx = x0 + t * mapW;
            const my = markerY(worldX);
            ctx.beginPath();
            ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 1;
            ctx.stroke();
        };

        drawMarker(this.opponent.worldX, '#3498db');
        drawMarker(this.train.worldX, '#e74c3c');
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
        } else if (theme === 'candy') {
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0,    '#b8a0f0');  // soft lavender
            sky.addColorStop(0.35, '#f5b8d8');  // pink
            sky.addColorStop(0.55, '#ffe8f0');  // pale blush
            sky.addColorStop(1,    '#c8f0e0');  // mint near ground
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

        // ── Vertical camera shift for elevated themes ────────────────────────
        const elevated = this.hasElevatedTrack();
        if (elevated) {
            ctx.save();
            ctx.translate(0, this.cameraY);
        }

        // ── Background layer (mountains, city buildings, or candy scenery) ───
        const mLayer = this.layers.find(l => l.name === 'mountains');
        // Far layers lag vertically so height changes feel parallaxed
        const bgVParallax = theme === 'candy' ? -this.cameraY * (1 - mLayer.speed) : 0;
        if (bgVParallax) ctx.translate(0, bgVParallax);
        for (const obj of mLayer.objects) {
            const sx = obj.x - this.cameraX * 0.3;
            if (obj.type === 'building')      this.drawBuilding(ctx, obj, sx);
            else if (obj.type === 'cloud')    this.drawCloud(ctx, obj, sx);
            else if (obj.type === 'rainbow')  this.drawRainbow(ctx, obj, sx);
            else if (obj.type === 'alpine' || obj.type === 'candyHill' || obj.type === 'mountain') {
                this.drawMountain(ctx, obj, sx);
            }
        }
        if (bgVParallax) ctx.translate(0, -bgVParallax);

        // ── City-specific ground, street & pillars ───────────────────────────
        if (theme === 'city') {
            this.drawCityGround(ctx);
            for (const car of this.cars) this.drawCar(ctx, car);
        }

        // ── Mountain ground ──────────────────────────────────────────────────
        if (theme === 'mountain') {
            this.drawMountainGround(ctx);
        }

        // ── Candy ground ─────────────────────────────────────────────────────
        if (theme === 'candy') {
            this.drawCandyGround(ctx);
        }

        // ── Mid-layer: trees / lollipops ─────────────────────────────────────
        if (theme === 'sahara' || theme === 'mountain' || theme === 'candy') {
            const tLayer = this.layers.find(l => l.name === 'trees');
            const midVParallax = theme === 'candy' ? -this.cameraY * (1 - tLayer.speed) : 0;
            if (midVParallax) ctx.translate(0, midVParallax);
            for (const obj of tLayer.objects) {
                const sx = obj.x - this.cameraX * 0.6;
                if (obj.type === 'lollipop') {
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    this.drawLollipop(ctx, obj, sx, this.getElevation(worldX));
                } else if (theme === 'mountain' || theme === 'candy') {
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    this.drawTreeCluster(ctx, obj, sx, this.getElevation(worldX));
                } else {
                    this.drawTreeCluster(ctx, obj, sx);
                }
            }
            if (midVParallax) ctx.translate(0, -midVParallax);
        }

        // ── Tracks + trains ─────────────────────────────────────────────────
        const isCity = theme === 'city';
        const isCandy = theme === 'candy';
        // Hover bob for city theme (no wheels, trains float)
        const oppBob  = isCity ? Math.sin(Date.now() / 400) * 2.5 : 0;
        const trainBob = isCity ? Math.sin(Date.now() / 400 + 1) * 2.5 : 0;

        if (elevated) this.drawMountainTrack(ctx, TRACK_BACK);
        else          this.drawTrack(ctx, TRACK_BACK, 0.85, isCandy);
        const opponentSX = this.worldToScreen(this.opponent.worldX);
        const oppY = this.opponent.y + oppBob;
        if (elevated) {
            this.drawMountainCarts(ctx, this.opponent, TRACK_BACK, '#3498db', '#2980b9', this.opponent.wheelFrame);
            // Pivot on rail contact point (bottom-center of locomotive) using
            // the simulated tie-physics state — may be above the rails midair.
            ctx.save();
            ctx.translate(opponentSX + TRAIN_WIDTH / 2, TRACK_BACK - this.opponent.elev);
            ctx.rotate(this.opponent.angle);
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

        // Sahara/mountain/candy foreground props
        if (theme === 'sahara' || theme === 'mountain' || theme === 'candy') {
            const rLayer = this.layers.find(l => l.name === 'rocks');
            const fgVParallax = theme === 'candy' ? -this.cameraY * (1 - rLayer.speed) : 0;
            if (fgVParallax) ctx.translate(0, fgVParallax);
            for (const obj of rLayer.objects) {
                const sx = obj.x - this.cameraX * 0.9;
                if (obj.type === 'gumdrop') {
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    this.drawGumdrop(ctx, obj, sx, this.getElevation(worldX));
                    continue;
                }
                let rockY = obj.y;
                if (elevated) {
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    rockY -= this.getElevation(worldX);
                }
                this.renderer.renderSprite(SCENERY_SPRITES.rock, sx, rockY);
            }
            if (fgVParallax) ctx.translate(0, -fgVParallax);
        }

        if (elevated) this.drawMountainTrack(ctx, TRACK_FRONT);
        else          this.drawTrack(ctx, TRACK_FRONT, 1.0, isCandy);
        this.drawFinishLine(ctx);

        const trainSX         = this.worldToScreen(this.train.worldX);
        const trainY          = this.train.y + trainBob;
        const activeBoostsNow = this.boostTokens.filter(t => Date.now() - t < 1000).length;
        if (elevated) {
            this.drawMountainCarts(ctx, this.train, TRACK_FRONT, '#e74c3c', '#3498db', this.wheelFrame);
            // Pivot on rail contact point (bottom-center of locomotive) using
            // the simulated tie-physics state — may be above the rails midair.
            ctx.save();
            ctx.translate(trainSX + TRAIN_WIDTH / 2, TRACK_FRONT - this.train.elev);
            ctx.rotate(this.train.angle);
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
        if (elevated) {
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
        this.drawMinimap(ctx);
        const activeBoosts = activeBoostsNow;
        const boostPct     = activeBoosts * 5;
        document.getElementById('speed').textContent =
            Math.round(this.train.vx * 10) / 10 + (activeBoosts > 0 ? ` 🔥+${boostPct}%` : '');
        document.getElementById('distance').textContent =
            `${Math.round(this.gameState.distance)} / ${this.finishLineWorldX}`;
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
