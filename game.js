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
// One giant hill spanning the whole course: elevation 0 at the start, a climb
// across the first half, a rounded summit at the exact midpoint, then a descent
// that returns to 0 at the finish. The grade stays gentle (~0.1–0.17) because
// the hill is spread over 20–30k units, so a trailing NPC (≤ ~390 units behind)
// is only ~65 px lower than the player and stays on screen.
const MOUNTAIN_PEAK_HEIGHT = 3000;              // default summit height (px), fallback only
const MOUNTAIN_GRADE_MIN   = 0.24;              // average climb grade (rise/run) per race: the summit
const MOUNTAIN_GRADE_MAX   = 0.30;              // height follows from it, so every race length is steep
const MOUNTAIN_APEX_ROUND  = 500;               // radius that rounds the summit (no kink)
const MOUNTAIN_SIGMA       = 180;               // physics-slope width (dead path while TRACK_SLOPE_PHYSICS is off)

// Physics curve: must stay aligned with the visual hill. A much wider physics
// sigma (formerly 2200 vs visual 500) drained speed on minimap-flat track;
// the NPC's tiny maxDelta (~0.005/frame) could not fight that drain and got
// pinned at the 0.2 floor long before the drawn hill.
const MOUNTAIN_PHYSICS_PEAK  = 40;
const MOUNTAIN_PHYSICS_SIGMA = MOUNTAIN_SIGMA;
const MOUNTAIN_GRAVITY       = 4.0;             // slope effect on speed (when enabled)
const TRACK_SLOPE_PHYSICS    = false;           // no uphill/downhill speed gravity
// When false: no airborne ballistics / slope speed — trains still snap to visual hills.
const TRAIN_PHYSICS_ENABLED  = false;
const OPPONENT_SPEED_RESPONSIVENESS = 0.2;      // match player accel when seeking target speed

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
const FX_MAX             = 420;    // cap on live hazard particles

// ── Stations ──────────────────────────────────────────────────────────────
// Every race starts and ends at a station: a platform with a canopy and a sign. Coordinates
// are in the same units as train.worldX (the locomotive's left edge).
const START_RAMP_SECONDS = 5;      // trains pull out from a standstill and reach cruise speed by now
const START_BOOST_CAP    = 8;      // taps that can queue during the pull-out (they fire at full speed)
const STATION_BEHIND     = 1500;   // platform length behind the stop mark (alongside the cars)
const STATION_AHEAD      = 260;    // platform length past the locomotive
const FINISH_STOP_DIST   = 900;    // the locomotive halts this far past the finish line
const STATION_ZOOM       = 0.72;   // the camera pulls back this far at the end station
const STATION_ANCHOR_Y   = 316;    // screen row the zoom pivots on (just above the platform front)
const PLATFORM_SURFACE   = 10;     // visible depth of the platform deck (the strip people stand on)
const PLATFORM_FACE      = 40;     // height of the platform's front face below the deck
const AXLE_OFFSET        = 56;     // px from a car's center to each wheel contact point
const OPPONENT_SPEED_STEP    = 0.05;
const OPPONENT_SPEED_VARIANCE = 0.05;
const OPPONENT_TARGET_WIN_RATE = 0.75;
const OPPONENT_BALANCE_WINDOW  = 4;
const OPPONENT_MAX_SPEED_MULT  = 1.10; // never average faster than +10% over cruise
const PLAYER_BOOST_PER_TOKEN   = 0.05; // each press: +5% for 1s, uncapped stack from taps only
// Hard ceiling on the OPPONENT's instantaneous speed. Its cruise, slant, boost
// and downhill slope gravity are all clamped to this — the NPC may never exceed
// it, whatever cruiseSpeed or the difficulty controller ask for. Deliberately
// does NOT apply to the player, whose boost stack stays uncapped.
const OPPONENT_SPEED_CEILING   = 4.5;
// The opponent drives at one constant speed for the whole race: no slant, no boost
// budget and no difficulty scaling. Hills still modulate its EFFECTIVE speed (same
// slopeSpeedMult as the player), and it only eases off if it gets far ahead.
const OPPONENT_CONSTANT_SPEED  = 4.5;

// ─── Hills modulate effective speed ─────────────────────────────────────────
// effective speed = vx × clamp(1 − gain × slope): climbing slows, descending
// speeds up. It scales DISPLACEMENT, never vx, so the opponent AI (which seeks a
// target vx) can't fight it and both trains obey the exact same curve.
const SLOPE_SPEED_MIN  = 0.55;
const SLOPE_SPEED_MAX  = 1.6;
const SLOPE_SPEED_LERP = 0.15;   // per-frame smoothing so crests don't snap the speed
const SLOPE_SPEED_GAIN_DEFAULT = 1.2;
const SLOPE_SPEED_GAIN = { mountain: 1.3, candy: 0.8, sahara: 0.9 };

function clamp01(v) { return Math.min(1, Math.max(0, v)); }

// Blend two #rrggbb colors; t = 0 → a, t = 1 → b.
function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const LEGACY_THEME_NAMES = { sahara: 'Sahara', city: 'City Bridge', mountain: 'Mountain Summit', candy: 'Candy Clouds' };
// Boost taps partly relieve a level's slow-down zones for the player (not for the
// constant-speed opponent): each live tap cancels 10% of the penalty, up to 60%.
const PENALTY_RELIEF_PER_TOKEN = 0.1;
const PENALTY_RELIEF_MAX       = 0.6;

// Original themes plus every level registered from themes/*.js.
function allThemes() {
    return THEMES.concat(Object.keys(THEME_DEFS));
}

// `?theme=<id>` pins the level (handy for testing a specific one).
function pickTheme() {
    const pool = allThemes();
    try {
        const forced = new URLSearchParams(location.search).get('theme');
        if (forced && pool.includes(forced)) return forced;
    } catch (_) {}
    return pool[Math.floor(Math.random() * pool.length)];
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

// Tent spanning [0, finishX] with a rounded apex: a constant grade on each side
// (no flat approaches) that eases over the summit instead of snapping. With
// d(dx) = sqrt(dx² + R²) - R the elevation is peak·(dmax - d)/dmax, which is
// exactly 0 at the start and the finish, and the slope is continuous at the top.
function mountainTentElevation(worldX, center, finishX, peakBase) {
    const halfSpan = Math.max(center, finishX - center, 1);
    const R = MOUNTAIN_APEX_ROUND;
    const dmax = Math.sqrt(halfSpan * halfSpan + R * R) - R;
    const dx = worldX - center;
    const d = Math.sqrt(dx * dx + R * R) - R;
    return peakBase * Math.max(0, (dmax - d) / dmax);
}

function mountainTentSlope(worldX, center, finishX, peakBase) {
    const halfSpan = Math.max(center, finishX - center, 1);
    const dx = worldX - center;
    if (Math.abs(dx) >= halfSpan) return 0;
    const R = MOUNTAIN_APEX_ROUND;
    const dmax = Math.sqrt(halfSpan * halfSpan + R * R) - R;
    return -peakBase / dmax * dx / Math.sqrt(dx * dx + R * R);
}

function makeMountainProfile(finishLineWorldX) {
    // Pick the climb GRADE (so a 30k race is as steep as a 20k one), then derive the summit.
    const hs = Math.max(finishLineWorldX / 2, 1);
    const dmax = Math.sqrt(hs * hs + MOUNTAIN_APEX_ROUND * MOUNTAIN_APEX_ROUND) - MOUNTAIN_APEX_ROUND;
    const peakBase = dmax * (MOUNTAIN_GRADE_MIN
        + Math.random() * (MOUNTAIN_GRADE_MAX - MOUNTAIN_GRADE_MIN));
    return {
        center: finishLineWorldX / 2,   // symmetric: finish elevation == start elevation (0)
        finishX: finishLineWorldX,
        peakBase,
        totalPeak: peakBase,
    };
}

function getMountainElevation(worldX, profile) {
    if (!profile) return 0;
    return mountainTentElevation(worldX, profile.center, profile.finishX, profile.peakBase);
}

function getMountainSlope(worldX, profile) {
    if (!profile) return 0;
    return mountainTentSlope(worldX, profile.center, profile.finishX, profile.peakBase);
}

function getMountainPhysicsSlope(worldX, profile) {
    if (!profile) return 0;
    const dx = worldX - profile.center;
    const elev = MOUNTAIN_PHYSICS_PEAK
        * Math.exp(-(dx * dx) / (2 * MOUNTAIN_PHYSICS_SIGMA * MOUNTAIN_PHYSICS_SIGMA));
    return -elev * dx / (MOUNTAIN_PHYSICS_SIGMA * MOUNTAIN_PHYSICS_SIGMA);
}

// ─── Candy theme: rolling sine waves (params regenerated each race) ────────
const CANDY_WAVE_AMP_DEFAULT = 72;  // fallback amp for padding / minimap
// Keep physics amp low: player applies slope*MOUNTAIN_GRAVITY additively each
// frame. At amp 28, max drag (~0.78) crushed accel (0.2) and pinned vx at 0.2.
// amp 5 → max drag ~0.14, so hills slow you without stalling.
const CANDY_PHYSICS_AMP = 5;

function makeCandyWaveProfile() {
    const primaryWavelength = 700 + Math.random() * 400;
    return {
        // Independent smooth layers preserve the rolling frequency while
        // preventing the same hill shape from repeating across the course.
        waves: [
            {
                wavelength: primaryWavelength,
                amp: 50 + Math.random() * 30,
                phase: Math.random() * Math.PI * 2,
            },
            {
                wavelength: 1400 + Math.random() * 1000,
                amp: 14 + Math.random() * 14,
                phase: Math.random() * Math.PI * 2,
            },
            {
                wavelength: 350 + Math.random() * 300,
                amp: 7 + Math.random() * 11,
                phase: Math.random() * Math.PI * 2,
            },
        ],
    };
}

function getCandyElevation(worldX, wave) {
    if (!wave) return 0;
    return wave.waves.reduce((elevation, component) => {
        const k = (2 * Math.PI) / component.wavelength;
        return elevation + component.amp * Math.sin(k * worldX + component.phase);
    }, 0);
}

function getCandySlope(worldX, wave) {
    if (!wave) return 0;
    return wave.waves.reduce((slope, component) => {
        const k = (2 * Math.PI) / component.wavelength;
        return slope + component.amp * k * Math.cos(k * worldX + component.phase);
    }, 0);
}

function getCandyPhysicsSlope(worldX, wave) {
    if (!wave) return 0;
    // Scale visual slope down to the small physics amp band.
    const visual = getCandySlope(worldX, wave);
    const primaryAmp = wave.waves[0]?.amp ?? CANDY_WAVE_AMP_DEFAULT;
    return visual * (CANDY_PHYSICS_AMP / Math.max(primaryAmp, 1));
}

// ─── Sahara / valley: a few tiny gaussian bumps per race ───────────────────
function makeSaharaHills(finishLineWorldX) {
    const count = 4 + Math.floor(Math.random() * 3); // 4–6 big rolling hills
    const hills = [];
    const margin = 800;
    const span = Math.max(finishLineWorldX - margin * 2, 1000);
    for (let i = 0; i < count; i++) {
        const t = (i + 0.35 + Math.random() * 0.3) / count;
        hills.push({
            center: margin + t * span + (Math.random() - 0.5) * 200,
            sigma:  230 + Math.random() * 150,   // 230–380 wide
            amp:    48 + Math.random() * 48,     // 48–96 tall: climbs of ~10–15°, readable on a wide screen
        });
    }
    return hills;
}

function getBumpElevation(worldX, hills) {
    if (!hills || hills.length === 0) return 0;
    let elev = 0;
    for (const h of hills) {
        const dx = worldX - h.center;
        elev += h.amp * Math.exp(-(dx * dx) / (2 * h.sigma * h.sigma));
    }
    return elev;
}

function getBumpSlope(worldX, hills) {
    if (!hills || hills.length === 0) return 0;
    let slope = 0;
    for (const h of hills) {
        const dx = worldX - h.center;
        const elev = h.amp * Math.exp(-(dx * dx) / (2 * h.sigma * h.sigma));
        slope += -elev * dx / (h.sigma * h.sigma);
    }
    return slope;
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
        this.boostTokens = [];  // timestamps of boost taps; each lasts 1 s, uncapped stack
        this._boostFlashTimer = null;

        // Pick one theme for the whole race (re-randomised on restart)
        this.theme = pickTheme();
        this.generateRaceTerrain();

        this.layers = [
            { name: 'mountains', speed: 0.3, objects: [] },
            { name: 'trees',     speed: 0.6, objects: [] },
            { name: 'rocks',     speed: 0.9, objects: [] },
        ];

        this.tunnelZones  = this.generateTunnelZones();
        this.bridgeZones  = this.generateBridgeZones();
        this.cars         = [];
        this.initStation();

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
        this._engRate    = 1;      // last loop playbackRate (varispeed with train speed)

        // Fetch + decode all three engine clips up front so there is zero
        // buffering delay when the race begins (even on the very first load).
        ['start', 'loop', 'end'].forEach(name => {
            fetch(`assets/sounds/steam_engine_${name}.wav`)
                .then(r => r.arrayBuffer())
                .then(ab => this.audioCtx.decodeAudioData(ab))
                .then(buf => { this._engBufs[name] = buf; })
                .catch(() => {});
        });

        // ── Horn (H key): decoded up front so the honk is instant ──────────────
        this._hornBuf = null;
        this._horn    = null;   // { src, gain } while a honk is sounding
        fetch('assets/sounds/train_horn.mp3')
            .then(r => r.arrayBuffer())
            .then(ab => this.audioCtx.decodeAudioData(ab))
            .then(buf => { this._hornBuf = buf; })
            .catch(() => {});

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

    // Per-race hill params: candy sine, mountain pass, sahara bumps.
    generateRaceTerrain() {
        this.candyWave = null;
        this.saharaHills = [];
        this.mountainProfile = null;
        this.mountainCenter = this.finishLineWorldX / 2;
        this.mountainPeakHeight = MOUNTAIN_PEAK_HEIGHT;

        // Registry levels (themes/*.js): terrain + per-race mechanic state.
        this.def = THEME_DEFS[this.theme] || null;
        this.terrain = null;
        this.mechState = null;
        if (this.def) {
            this.terrain = this.def.terrain ? this.def.terrain(this.finishLineWorldX) : null;
            const mech = this.def.mechanic;
            this.mechState = mech && mech.init ? mech.init(this) : null;
        }
        this.applyThemePhysics();
        this.marks = { player: [], opponent: [] };   // hazard residue stuck to each train
        this.fxList = [];                            // live hazard particles (spray, sparks, bubbles)
        this.levelName = this.def ? this.def.name : (LEGACY_THEME_NAMES[this.theme] || this.theme);
        this.levelHint = this.def ? (this.def.hint || '') : '';

        if (this.theme === 'candy') {
            this.candyWave = makeCandyWaveProfile();
        } else if (this.theme === 'mountain') {
            this.mountainProfile = makeMountainProfile(this.finishLineWorldX);
            this.mountainCenter = this.mountainProfile.center;
            this.mountainPeakHeight = this.mountainProfile.totalPeak;
        } else if (this.theme === 'sahara') {
            this.saharaHills = makeSaharaHills(this.finishLineWorldX);
        }
    }

    // Per-level acceleration/boost feel, identical for both trains: inertia < 1 makes
    // speeding up and slowing down sluggish while the top speed stays the same
    // (accel/friction scale together); boostMs/boostPer retune boost taps.
    applyThemePhysics() {
        const p = (this.def && this.def.mechanic && this.def.mechanic.physics) || {};
        const inertia = p.inertia ?? 1;
        this.physics = {
            inertia,
            boostMs: p.boostMs ?? 1000,
            boostPer: p.boostPer ?? PLAYER_BOOST_PER_TOKEN,
        };
        this.train.acceleration = 0.2 * inertia;
        this.train.friction = 1 - 0.05 * inertia;
    }

    visualAmpMax() {
        if (this.def) return this.terrain ? this.terrain.ampMax : 0;
        if (this.theme === 'mountain') {
            return this.mountainProfile
                ? this.mountainProfile.totalPeak
                : this.mountainPeakHeight;
        }
        if (this.theme === 'candy') {
            const w = this.candyWave;
            return w
                ? w.waves.reduce((total, component) => total + component.amp, 0)
                : CANDY_WAVE_AMP_DEFAULT;
        }
        if (this.theme === 'sahara' && this.saharaHills.length) {
            return Math.max(...this.saharaHills.map(h => h.amp));
        }
        return 0;
    }

    getElevation(worldX) {
        if (this.def) return this.terrain ? this.terrain.elevation(worldX) : 0;
        if (this.theme === 'mountain') return getMountainElevation(worldX, this.mountainProfile);
        if (this.theme === 'candy') return getCandyElevation(worldX, this.candyWave);
        if (this.theme === 'sahara') return getBumpElevation(worldX, this.saharaHills);
        return 0;
    }

    getSlope(worldX) {
        if (this.def) return this.terrain ? this.terrain.slope(worldX) : 0;
        if (this.theme === 'mountain') return getMountainSlope(worldX, this.mountainProfile);
        if (this.theme === 'candy') return getCandySlope(worldX, this.candyWave);
        if (this.theme === 'sahara') return getBumpSlope(worldX, this.saharaHills);
        return 0;
    }

    getPhysicsSlope(worldX) {
        if (!TRACK_SLOPE_PHYSICS) return 0;
        if (this.theme === 'mountain') return getMountainPhysicsSlope(worldX, this.mountainProfile);
        if (this.theme === 'candy') return getCandyPhysicsSlope(worldX, this.candyWave);
        if (this.theme === 'sahara') return getBumpSlope(worldX, this.saharaHills) * 0.15;
        return 0;
    }

    // Theme terrain for minimap — same profile as gameplay elevation.
    getVisualElevation(worldX) {
        return this.getElevation(worldX);
    }

    hasElevatedTrack() {
        if (this.def) return !!this.terrain;
        if (this.theme === 'mountain' || this.theme === 'candy') return true;
        if (this.theme === 'sahara') return this.saharaHills.length > 0;
        return false;
    }

    // Shared slope gravity for player and opponent (additive, same curve).
    // maxVx is opt-in: only the opponent passes a ceiling, since downhill gravity
    // adds speed with no bound of its own when TRACK_SLOPE_PHYSICS is enabled.
    applyTrackGravity(body, minVx = 0.2, maxVx = Infinity) {
        if (TRACK_SLOPE_PHYSICS) {
            const slope = this.getPhysicsSlope(body.worldX + TRAIN_WIDTH / 2);
            body.vx -= slope * MOUNTAIN_GRAVITY;
        }
        body.vx = Math.min(Math.max(body.vx, minVx), maxVx);
    }

    // ── Hazard residue ─────────────────────────────────────────────────────
    // A level's mechanic.marks = { kind, trigger, rate, r:[min,max], y:[min,max], life, hot, style }
    // makes mud, lava burns, frost... stick to whichever car is over the hazard (the
    // locomotive is part 0, carts are 1..CART_COUNT). Triggers: 'penalty' (car is being
    // slowed), 'any' (car is in any zone), 'ambient' (train is moving). Same rules for
    // both trains; ThemeKit.marks[kind] (themes/registry.js) draws each kind.
    updateMarks() {
        const mech = this.def && this.def.mechanic;
        const spec = mech && mech.marks;
        if (!spec) return;
        const t = this.gameState.time;
        this._markTick = (this._markTick || 0) + 1;
        for (const who of ['player', 'opponent']) {
            const train = who === 'player' ? this.train : this.opponent;
            if (this._markTick % 60 === 0) {
                this.marks[who] = this.marks[who].filter(m => t - m.born < m.life);
            }
            const list = this.marks[who];
            for (let part = 0; part <= CART_COUNT; part++) {
                let x;
                if (part === 0) x = train.worldX + TRAIN_WIDTH / 2;
                else {
                    const cart = train.carts[part - 1];
                    if (!cart || cart.centerX === 0) continue;  // carts get a position on the first tick
                    x = cart.centerX;
                }
                let p = 0;
                if (spec.trigger === 'ambient') {
                    p = train.vx > 1 ? spec.rate : 0;
                } else if (mech.speedMult) {
                    const k = mech.speedMult(this.mechState, x, t, this);
                    p = spec.trigger === 'any' ? spec.rate * Math.abs(1 - k) : (k < 1 ? spec.rate * (1 - k) : 0);
                }
                if (p > 0 && Math.random() < p) this.addMark(list, part, spec, t);
            }
        }
    }

    addMark(list, part, spec, t) {
        const perPart = spec.perPart ?? 14;
        let count = 0, oldest = -1;
        for (let i = 0; i < list.length; i++) {
            if (list[i].part !== part) continue;
            if (oldest < 0) oldest = i;
            count++;
        }
        if (count >= perPart && oldest >= 0) list.splice(oldest, 1);
        list.push({
            part,
            x: TRAIN_RIG.bodyX[0] + Math.random() * (TRAIN_RIG.bodyX[1] - TRAIN_RIG.bodyX[0]),
            y: Math.min(Math.max(spec.y[0] + Math.random() * (spec.y[1] - spec.y[0]), TRAIN_RIG.bodyY[0]), TRAIN_RIG.bodyY[1]),
            r: spec.r[0] + Math.random() * (spec.r[1] - spec.r[0]),
            kind: spec.kind,
            style: spec.style || {},
            born: t,
            life: spec.life ?? Infinity,
            hot: spec.hot ?? 0,
            seed: Math.random() * 1000,
        });
    }

    // Draw the residue for one car; (ox, oy) is the car's top-left corner.
    drawMarksFor(ctx, marks, part, ox, oy) {
        if (!marks || !marks.length) return;
        const t = this.gameState.time;
        for (const m of marks) {
            if (m.part !== part) continue;
            const render = ThemeKit.marks[m.kind];
            if (!render) continue;
            const age = t - m.born;
            const fade = m.life === Infinity ? 1 : clamp01((m.life - age) / Math.min(8, m.life * 0.4));
            if (fade <= 0) continue;
            ctx.save();
            ctx.globalAlpha = fade;
            render(ctx, m, ox + m.x, oy + m.y, age);
            ctx.restore();
        }
    }

    // ── Hazard particles ───────────────────────────────────────────────────
    // A level's mechanic.fx = spec | [spec, ...] animates the hazard against the trains:
    //   kind     ThemeKit.fx[kind] draws one particle (themes/registry.js)
    //   trigger  'penalty' (car is being slowed) | 'any' (car is in any zone) | 'ambient'
    //   rate     spawn chance per car per frame at full strength (scaled by train speed)
    //   n        particles per spawn      at  'wheels' (default) | 'body'
    //   r, vx, vy, y, life   [min, max] or a number. vx/vy are px/frame relative to the car
    //            (vy up); y is the spawn height above the rail; life is seconds
    //   g        gravity px/frame^2 (negative floats up)     land  'die' | 'splat'
    //   inherit  share of the car's own speed the particle keeps: number or fn(k)
    // Anchors come from TRAIN_RIG (sprites.js), so new train art needs no change here.
    updateFx(dt, spawn = true) {
        const list = this.fxList;
        if (!list) return;
        const s = dt * 60;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.age += dt;
            if (p.age >= p.life) { list.splice(i, 1); continue; }
            if (p.landed) continue;
            p.x += p.vx * s;
            p.h += p.vy * s;
            p.vy -= p.g * s;
            if (p.h < 0 && p.vy < 0) {
                if (p.land === 'splat') {
                    p.landed = true; p.landedAt = p.age; p.h = 0; p.vx = 0; p.vy = 0;
                    p.life = p.age + 0.45;
                } else list.splice(i, 1);
            }
        }
        const mech = this.def && this.def.mechanic;
        if (!spawn || !mech || !mech.fx || !this.raceStarted || list.length >= FX_MAX) return;
        const specs = Array.isArray(mech.fx) ? mech.fx : [mech.fx];
        const t = this.gameState.time;
        const reach = this.canvas.width / 2 + 200;
        const R = (a, d) => (a === undefined ? d : Array.isArray(a) ? a[0] + Math.random() * (a[1] - a[0]) : a);
        ThemeKit.eachCar(this, (who, train, part, cx) => {
            if (Math.abs(cx - this.cameraX) > reach) return;
            const k = mech.speedMult ? mech.speedMult(this.mechState, cx, t, this) : 1;
            const speed = Math.min(Math.max(train.vx, 0) / 4, 1.2);
            for (const sp of specs) {
                let power = 0;
                if (sp.trigger === 'ambient') power = 1;
                else if (sp.trigger === 'any') power = Math.min(Math.abs(1 - k) / 0.15, 1);
                else power = k < 1 ? 1 - k : 0;
                const chance = (sp.rate ?? 0.1) * power * (speed > 0.25 ? speed : 0);
                if (Math.random() >= chance) continue;
                for (let j = 0; j < (sp.n || 1); j++) {
                    const body = sp.at === 'body';
                    const left = cx - TRAIN_WIDTH / 2;
                    const px = body
                        ? left + TRAIN_RIG.bodyX[0] + Math.random() * (TRAIN_RIG.bodyX[1] - TRAIN_RIG.bodyX[0])
                        : left + TRAIN_RIG.wheelX[Math.floor(Math.random() * TRAIN_RIG.wheelX.length)];
                    const h = body
                        ? TRAIN_HEIGHT - (TRAIN_RIG.bodyY[0] + Math.random() * (TRAIN_RIG.bodyY[1] - TRAIN_RIG.bodyY[0]))
                        : R(sp.y, 4);
                    const inherit = typeof sp.inherit === 'function' ? sp.inherit(k) : (sp.inherit ?? 1);
                    list.push({
                        kind: sp.kind, who, x: px, h,
                        vx: train.vx * inherit + R(sp.vx, 0), vy: R(sp.vy, 2), g: sp.g ?? 0.25,
                        age: 0, life: R(sp.life, 0.8), r: R(sp.r, 3), seed: Math.random() * 1000,
                        land: sp.land || 'die', style: sp.style || {},
                    });
                }
            }
        });
    }

    // Draw one train's hazard particles (called right after that train so the lanes layer).
    drawHazardFx(ctx, who) {
        const list = this.fxList;
        if (!list || !list.length) return;
        const base = who === 'opponent' ? TRACK_BACK : TRACK_FRONT;
        const W = this.canvas.width;
        for (const p of list) {
            if (p.who !== who) continue;
            const render = ThemeKit.fx[p.kind];
            if (!render) continue;
            const sx = ThemeKit.sx(this, p.x);
            if (sx < -40 || sx > W + 40) continue;
            ctx.save();
            render(ctx, p, sx, base - this.getElevation(p.x) - p.h, p.age / p.life);
            ctx.restore();
        }
    }

    activeBoostCount() {
        const now = Date.now();
        return this.boostTokens.filter(t => now >= t && now - t < this.physics.boostMs).length;
    }

    // Total effective-speed multiplier for one train: the hill multiplier times the
    // level mechanic's multiplier. Same function for player and opponent.
    speedMultFor(body, kind) {
        let mult = this.slopeSpeedMult(body);
        const mech = this.def && this.def.mechanic;
        if (mech && mech.speedMult && this.raceStarted) {
            let k = mech.speedMult(this.mechState, body.worldX + TRAIN_WIDTH / 2, this.gameState.time, this);
            if (k < 1 && kind === 'player') {
                const relief = Math.min(PENALTY_RELIEF_MAX, this.activeBoostCount() * PENALTY_RELIEF_PER_TOKEN);
                k = 1 - (1 - k) * (1 - relief);
            }
            mult *= Math.max(k, 0.02);
        }
        return mult;
    }

    // Shared by player and opponent. Positive slope = climbing (see the get*Slope
    // helpers: d(elevation)/dx, elevation up-positive).
    slopeSpeedMult(body) {
        let target = 1;
        if (this.hasElevatedTrack()) {
            const gain  = (this.def && this.def.slopeGain) ?? SLOPE_SPEED_GAIN[this.theme] ?? SLOPE_SPEED_GAIN_DEFAULT;
            const slope = this.getSlope(body.worldX + TRAIN_WIDTH / 2);
            target = Math.min(SLOPE_SPEED_MAX, Math.max(SLOPE_SPEED_MIN, 1 - gain * slope));
        }
        const prev = body.slopeMult ?? 1;
        body.slopeMult = prev + (target - prev) * SLOPE_SPEED_LERP;
        return body.slopeMult;
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

    // City Bridge: one massive suspension bridge (three towers, two long spans) in the
    // first or last third of the race, well clear of the tunnel. Scenery only.
    generateBridgeZones() {
        if (this.theme !== 'city') return [];
        const span = 620 + Math.random() * 140;
        const reach = span * 0.7;                       // backstays run this far past the end towers
        const half = span + reach;
        let center = this.finishLineWorldX * (Math.random() < 0.5 ? 0.22 : 0.76) + (Math.random() - 0.5) * 600;
        const tun = (this.tunnelZones || [])[0];
        if (tun && center + half + 120 > tun.startX && center - half - 120 < tun.endX) {
            center = center < (tun.startX + tun.endX) / 2 ? tun.startX - half - 200 : tun.endX + half + 200;
        }
        const first = center - span;
        const towers = [first, first + span, first + 2 * span];
        return [{ startX: first - reach, endX: towers[2] + reach, towers, span }];
    }

    inBridge(worldX, pad = 0) {
        return (this.bridgeZones || []).some(z => worldX >= z.startX - pad && worldX <= z.endX + pad);
    }

    spawnObjectForLayer(layer, x) {
        if (this.def) {
            const L = this.def.layers && this.def.layers[layer.name];
            if (L && L.spawn) layer.objects.push(L.spawn(x, this));
            return;
        }
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

    // ── Stations, start ramp and finish sequence ────────────────────────────
    // Per-race station state: trains wait at the start platform with their doors open, a crowd
    // waits at both stations, and nothing has finished yet. Called from the constructor and reset().
    initStation() {
        this.zoom = 1;
        this.overlayAt = null;
        for (const body of [this.train, this.opponent]) {
            body.finished = false;
            body.brake = null;
            body.stopped = false;
            body.boardDone = false;
            body.doorOpen = 1;
            body.doorTarget = 1;
        }
        this.stations = this.buildStations();
        this.crowd = this.spawnStationCrowd();
    }

    buildStations() {
        const make = (name, stopX, label, signX) => ({ name, stopX, label, signX, x0: stopX - STATION_BEHIND, x1: stopX + STATION_AHEAD });
        return {
            start:  make('start', 0, 'START', 30),
            finish: make('finish', this.finishLineWorldX + FINISH_STOP_DIST, 'FINISH', this.finishLineWorldX),
        };
    }

    // Platform deck y at the train's floor: the platform is raised so its back edge is flush with
    // the bottom of the doorway (from TRAIN_RIG, so new train art needs no change here). lane is
    // 'front' (the player's rail) or 'back' (the rival's rail).
    platformEdgeY(lane) {
        return (lane === 'back' ? TRACK_BACK : TRACK_FRONT) - TRAIN_HEIGHT + TRAIN_RIG.doorFloorY;
    }

    // People waiting on the platforms. At the finish the front-lane crowd boards the player's
    // train and the back-lane crowd boards the rival's; at the start they just wait.
    spawnStationCrowd() {
        const out = [];
        const skins = ['#f5c98b', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
        const make = (st, lane, count, lo, hi) => {
            const edge = this.platformEdgeY(lane);
            for (let i = 0; i < count; i++) {
                out.push({
                    station: st.name, lane, boards: st.name === 'finish' ? (lane === 'back' ? 'opponent' : 'player') : null,
                    state: 'wait',
                    x: lo + ((i + Math.random() * 0.85) / count) * (hi - lo),
                    fy: edge + 3 + Math.random() * (PLATFORM_SURFACE - 5),
                    color: `hsl(${Math.floor(Math.random() * 360)},65%,58%)`,
                    skin: skins[Math.floor(Math.random() * skins.length)],
                    hair: ['#2b1d12', '#5b3a1f', '#c9a227', '#1a1a1a', '#8c3b1d'][Math.floor(Math.random() * 5)],
                    phase: Math.random() * Math.PI * 2,
                    speed: 1.5 + Math.random() * 1.1,
                    delay: Math.floor(Math.random() * 150),
                    bag: Math.random() < 0.35,
                    doorX: 0, enter: 0, scale: 1, alpha: 1,
                });
            }
        };
        const fin = this.stations.finish;
        make(fin, 'front', 22, fin.stopX - 1300, fin.stopX + 200);
        make(fin, 'back', 12, fin.stopX - 1300, fin.stopX + 200);
        make(this.stations.start, 'front', 10, -1200, 140);
        return out;
    }

    // 0 at the station, easing up to 1 over START_RAMP_SECONDS of racing; 1 once the race is ending.
    rampFactor() {
        if (this.gameState.result) return 1;
        if (!this.raceStarted) return 0;
        const r = Math.min(this.gameState.time / START_RAMP_SECONDS, 1);
        return r * r * (3 - 2 * r);
    }

    // The result screen (and "press any key") waits for the trains to stop and the boarding to end.
    canRestart() {
        return !!this.overlayAt && Date.now() - this.overlayAt > 350;
    }

    // Camera: follow the player; once someone crosses the line, ease out to the station.
    updateCamera() {
        let target = this.train.worldX, zoomTarget = 1;
        if (this.gameState.result) {
            const focus = this.stations.finish.stopX - 380;
            target = Math.min(focus, this.train.worldX + 200);
            zoomTarget = STATION_ZOOM;
        }
        this.cameraX += (target - this.cameraX) * CAMERA_LERP;
        this.cameraY += (this.train.elev - this.cameraY) * CAMERA_LERP;
        this.zoom += (zoomTarget - this.zoom) * 0.03;
        if (Math.abs(this.zoom - zoomTarget) < 0.002) this.zoom = zoomTarget;
    }

    // A train past the finish line brakes at a constant rate that halts it at the stop mark.
    brakeTrain(body) {
        if (body.stopped) { body.vx = 0; return; }
        body.vx = Math.max(body.vx - body.brake.a, 0);   // constant deceleration (see checkFinish)
        if (body.vx < 0.03) { body.vx = 0; body.stopped = true; }
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

    // Per-frame station logic: door animation, the boarding crowd, and when the result appears.
    updateStation(dt) {
        const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
        const lane = { player: this.train, opponent: this.opponent };
        for (const body of [this.train, this.opponent]) {
            if (!body.finished) body.doorTarget = this.raceStarted ? 0 : 1;     // doors shut as the race begins
            else if (body.stopped) body.doorTarget = body.boardDone ? 0 : 1;     // open at the platform
            else body.doorTarget = 0;
            body.doorOpen += clamp(body.doorTarget - body.doorOpen, -dt * 1.7, dt * 1.7);
        }
        if (!this.gameState.result) return;

        const fin = this.stations.finish;
        for (const p of this.crowd) {
            if (p.station !== 'finish' || p.state === 'done' || !p.boards) continue;
            const body = lane[p.boards];
            const step = p.speed * 60 * dt;
            if (p.state === 'wait') {
                if (body.stopped && body.doorOpen > 0.85 && (p.delay -= 60 * dt) <= 0) {
                    this.pickDoor(p, body, fin);
                    p.state = 'along';
                }
            } else if (p.state === 'along') {
                const dx = p.doorX - p.x;
                p.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
                if (Math.abs(dx) <= step) p.state = 'enter';
            } else if (p.state === 'enter') {
                // Step through the doorway: the deck is flush with the floor, so they just walk in.
                p.enter = Math.min(1, p.enter + dt / 0.55);
                p.fy = p.standY - p.enter * 7;
                p.scale = 1 - 0.28 * p.enter;
                p.alpha = 1 - p.enter * p.enter;
                if (p.enter >= 1) p.state = 'done';
            }
        }
        for (const who of ['player', 'opponent']) {
            const body = lane[who];
            if (body.stopped && !body.boardDone &&
                !this.crowd.some(p => p.station === 'finish' && p.boards === who && p.state !== 'done')) {
                body.boardDone = true;
            }
        }
        if (!this.overlayAt) {
            // A win (or tie) shows the result once the player's train has stopped and boarded;
            // a loss waits for the player to finish too, so they see the rival's crowd board.
            const done = (b) => b.stopped && b.boardDone;
            const ready = this.gameState.result === 'lose' ? done(this.train) && done(this.opponent) : done(this.train);
            if (ready) {
                this.overlayAt = Date.now() + 900;                                 // let the doors close first
            } else if (Date.now() - this.gameState.endTime > 40000) {
                this.overlayAt = Date.now();                                       // never wait forever
            }
        }
    }

    // Choose the doorway a passenger heads for: one of the three nearest on that train's platform side.
    pickDoor(p, body, st) {
        const doors = [];
        for (let i = 0; i <= 8; i++) {
            const left = i === 0 ? body.worldX : (body.carts[i - 1] ? body.carts[i - 1].centerX - TRAIN_WIDTH / 2 : null);
            if (left === null) continue;
            for (const dx of TRAIN_RIG.doorX) {
                const x = left + dx;
                if (x > st.x0 + 30 && x < st.x1 - 30) doors.push(x);
            }
        }
        doors.sort((a, b) => Math.abs(a - p.x) - Math.abs(b - p.x));
        p.doorX = doors.length ? doors[Math.floor(Math.random() * Math.min(3, doors.length))] : p.x;
        p.standY = this.platformEdgeY(p.lane) + 4;   // walk along the deck right up to the door
        p.fy = p.standY;
    }

    // ── Station drawing ─────────────────────────────────────────────────────
    // The platforms are raised slabs whose deck is flush with each train's floor, drawn in front
    // of the train they serve so the wheels and undercarriage are hidden. 'back' is the rival's
    // slab (drawn after the rival, so the player's train covers it when alongside), 'front' is the
    // player's slab, and 'over' is the canopy, posts and hanging sign above both trains.
    drawStations(ctx, pass) {
        if (!this.stations) return;
        const W = this.canvas.width;
        for (const st of [this.stations.start, this.stations.finish]) {
            const sa = this.worldToScreen(st.x0), sb = this.worldToScreen(st.x1);
            if (sb < -80 || sa > W + 80) continue;
            if (pass === 'over') this.drawCanopy(ctx, st, W);
            else this.drawPlatform(ctx, st, W, pass);
        }
    }

    drawPlatform(ctx, st, W, lane) {
        const step = 40;
        const x0 = Math.max(st.x0, this.cameraX - W / 2 - 160), x1 = Math.min(st.x1, this.cameraX + W / 2 + 160);
        const pts = [];
        for (let x = Math.floor(x0 / step) * step; x < x1 + step; x += step) {
            const xx = Math.min(Math.max(x, st.x0), st.x1);
            pts.push([this.worldToScreen(xx), this.getElevation(xx)]);
            if (xx >= st.x1) break;
        }
        if (pts.length < 2) return;
        const back = lane === 'back';
        const edge = this.platformEdgeY(lane);              // deck's back edge = the doorway floor
        const deckBot = edge + PLATFORM_SURFACE;            // front edge of the deck
        const faceBot = deckBot + (back ? 22 : PLATFORM_FACE);
        const poly = (top, bottom, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            pts.forEach(([sx, e], i) => (i ? ctx.lineTo(sx, top - e) : ctx.moveTo(sx, top - e)));
            for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], bottom - pts[i][1]);
            ctx.closePath();
            ctx.fill();
        };
        poly(deckBot, faceBot, back ? '#59616a' : '#6c747d');             // front face (hides the wheels)
        poly(edge, deckBot, back ? '#98a0a8' : '#aab2ba');                // deck
        poly(deckBot - 2.5, deckBot, '#f1c40f');                          // yellow safety edge
        poly(faceBot - 6, faceBot, 'rgba(0,0,0,0.22)');                   // shadow at the base
        // Panel joints on the face and paving lines on the deck, world-aligned so they scroll.
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(40,48,58,0.35)';
        ctx.beginPath();
        for (let x = Math.ceil(x0 / 96) * 96; x < x1; x += 96) {
            const sx = this.worldToScreen(x), e = this.getElevation(x);
            ctx.moveTo(sx, deckBot - e);
            ctx.lineTo(sx, faceBot - e);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(70,80,92,0.3)';
        ctx.beginPath();
        for (let x = Math.ceil(x0 / 64) * 64; x < x1; x += 64) {
            const sx = this.worldToScreen(x), e = this.getElevation(x);
            ctx.moveTo(sx, edge - e);
            ctx.lineTo(sx - 4, deckBot - 2 - e);
        }
        ctx.stroke();
        if (!back) {   // a fascia strip of dark tiles under the lip
            poly(deckBot + 3, deckBot + 8, 'rgba(30,38,48,0.4)');
        }
    }

    drawCanopy(ctx, st, W) {
        const roofY = 138 - this.getElevation(st.stopX);
        const deckFront = this.platformEdgeY('front') + PLATFORM_SURFACE;
        const a = Math.max(this.worldToScreen(st.x0), -40), b = Math.min(this.worldToScreen(st.x1), W + 40);
        if (b <= a) return;
        const t = Date.now() / 1000;
        // Posts down to the front edge of the deck, drawn first so the roof overlaps their tops.
        for (let x = Math.ceil((st.x0 + 40) / 260) * 260; x < st.x1; x += 260) {
            const sx = this.worldToScreen(x);
            if (sx < -20 || sx > W + 20) continue;
            const e = this.getElevation(x);
            ctx.fillStyle = '#56626e';
            ctx.fillRect(sx - 3, roofY + 8, 6, deckFront - e - roofY - 8);
            ctx.fillStyle = '#7b8896';
            ctx.fillRect(sx - 3, roofY + 8, 2, deckFront - e - roofY - 8);
            ctx.fillStyle = '#3d4650';
            ctx.fillRect(sx - 6, deckFront - e - 3, 12, 4);
        }
        // Roof slab with a bright top edge and a scalloped fascia.
        ctx.fillStyle = '#38424d';
        ctx.fillRect(a, roofY, b - a, 9);
        ctx.fillStyle = '#6a7885';
        ctx.fillRect(a, roofY - 3, b - a, 3);
        ctx.fillStyle = '#2a323b';
        ctx.fillRect(a, roofY + 9, b - a, 2);
        for (let x = Math.ceil(st.x0 / 130) * 130; x < st.x1; x += 130) {
            const sx = this.worldToScreen(x);
            if (sx < -10 || sx > W + 10) continue;
            ctx.fillStyle = 'rgba(255,226,150,0.16)';        // lamp glow
            ctx.beginPath();
            ctx.ellipse(sx, roofY + 14, 26, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffe9a8';
            ctx.fillRect(sx - 8, roofY + 10, 16, 3);
        }
        // Hanging sign + clock.
        const sx = this.worldToScreen(st.signX);
        if (sx > -140 && sx < W + 140) {
            ctx.strokeStyle = '#2a323b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx - 46, roofY + 9); ctx.lineTo(sx - 46, roofY + 22);
            ctx.moveTo(sx + 46, roofY + 9); ctx.lineTo(sx + 46, roofY + 22);
            ctx.stroke();
            ctx.fillStyle = '#e8eef3';
            ctx.fillRect(sx - 62, roofY + 20, 124, 32);
            ctx.fillStyle = st.name === 'finish' ? '#1b5e8a' : '#1e6b3a';
            ctx.fillRect(sx - 59, roofY + 23, 118, 26);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 19px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(st.label, sx, roofY + 43);
            ctx.textAlign = 'left';
            // A little station clock to the right of the sign.
            const cx = sx + 96, cy = roofY + 36;
            ctx.strokeStyle = '#2a323b';
            ctx.beginPath(); ctx.moveTo(cx, roofY + 9); ctx.lineTo(cx, cy - 13); ctx.stroke();
            ctx.fillStyle = '#f4f1e6';
            ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#2a323b'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(t * 0.05) * 7, cy - Math.cos(t * 0.05) * 7);
            ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(t * 0.6) * 10, cy - Math.cos(t * 0.6) * 10);
            ctx.stroke();
        }
    }

    // Passengers. layer 'mid' sits between the two trains (people heading for the back train once
    // they have stepped off the platform); 'front' is everyone else, in front of both.
    drawCrowdLayer(ctx, layer) {
        if (!this.crowd || !this.crowd.length) return;
        for (const p of this.crowd) {
            if ((p.lane === 'back' ? 'mid' : 'front') === layer) this.drawPerson(ctx, p);
        }
    }

    drawPerson(ctx, p) {
        if (p.alpha <= 0) return;
        const sx = this.worldToScreen(p.x);
        if (sx < -24 || sx > this.canvas.width + 24) return;
        const t = Date.now() / 1000 + p.phase;
        const walking = p.state === 'along' || p.state === 'enter';
        const bounce = walking ? Math.abs(Math.sin(t * 9)) * 3 : Math.sin(t * 1.3) * 0.5;
        const swing = walking ? Math.sin(t * 9) * 3 : 0;
        const y = p.fy - this.getElevation(p.x);
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(sx, y);
        ctx.scale(p.scale, p.scale);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';                  // shadow
        ctx.beginPath(); ctx.ellipse(0, 1, 7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2f3440';                           // legs
        ctx.fillRect(-3, -4 - bounce, 3, 5 + swing);
        ctx.fillRect(0, -4 - bounce, 3, 5 - swing);
        ctx.fillStyle = p.color;                             // coat
        ctx.fillRect(-4, -12 - bounce, 8, 8);
        ctx.fillRect(-7, -11 - bounce, 3, 5);
        ctx.fillRect(4, -11 - bounce, 3, 5);
        ctx.fillStyle = p.skin;                              // head
        ctx.fillRect(-3, -19 - bounce, 6, 7);
        ctx.fillStyle = p.hair;
        ctx.fillRect(-3.5, -20 - bounce, 7, 3);
        if (p.bag) {
            ctx.fillStyle = '#6b4a2a';
            ctx.fillRect(4, -8 - bounce, 5, 6);
        }
        ctx.restore();
    }

    // Draw the open-door overlay for the locomotive at (x, y) = its top-left.
    drawLocoDoors(ctx, x, y) {
        if (this._doors > 0.01) TRAIN_RIG.drawDoors(ctx, x, y, this._doors);
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
        // Difficulty can keep adapting, but race speed never exceeds +10% cruise.
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
        this.cruiseSpeed = cruiseSpeedForLength(this.finishLineWorldX);

        if (newTheme) {
            this.theme = pickTheme();
        }
        this.generateRaceTerrain();

        this.train.worldX = 0;
        this.train.vx = 0;
        this.train.slopeMult = 1;
        this.opponent.slopeMult = 1;
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

        this.layers = [
            { name: 'mountains', speed: 0.3, objects: [] },
            { name: 'trees',     speed: 0.6, objects: [] },
            { name: 'rocks',     speed: 0.9, objects: [] },
        ];
        this.tunnelZones  = this.generateTunnelZones();
        this.bridgeZones  = this.generateBridgeZones();
        this.cars         = [];
        this.initStation();
        this.generateInitialScenery();

        this.honkStop(0.05);

        // Stop all engine sounds and reset Web Audio state machine
        this._stopEngSrc(this._engSrc);
        this._stopEngSrc(this._engPending);
        this._engSrc     = null;
        this._engPending = null;
        this._engGain.gain.value = 0;
        this._soundState = 'idle';
        this._engRate    = 1;

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
        const now = Date.now();
        if (this.rampFactor() < 1) {
            // Still pulling out of the station: the tap queues and fires when the trains reach
            // full speed (START_RAMP_SECONDS into the race).
            if (this.boostTokens.filter(t => t > now).length >= START_BOOST_CAP) return;
            this.boostTokens.push(now + (START_RAMP_SECONDS - this.gameState.time) * 1000);
        } else {
            this.boostTokens.push(now);
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

            if (this.canRestart()) {
                e.preventDefault();
                this.reset();
                this.resetUI();
                return;
            }

            // H = honk (hold to keep it going). Works while paused and never
            // starts the race.
            if (e.key === 'h' || e.key === 'H') {
                this.honkStart();
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
                const boostBtn = document.getElementById('boostBtn');
                boostBtn.classList.add('active');
                clearTimeout(this._boostFlashTimer);
                this._boostFlashTimer = setTimeout(() => boostBtn.classList.remove('active'), 120);
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
            if (e.key === 'h' || e.key === 'H') this.honkStop();
        });

        // ── Touch / iPad support: tap canvas = boost ──────────────────────────
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();

            if (this.canRestart()) {
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

    // Each train that crosses the line starts braking toward the station stop. The first one
    // across decides the result, but the race carries on: a player who is behind keeps driving
    // (boost still works) and watches the rival's crowd board while they pull in.
    checkFinish() {
        const F = this.finishLineWorldX;
        for (const [body, who] of [[this.train, 'player'], [this.opponent, 'opponent']]) {
            if (body.finished || body.worldX < F) continue;
            body.finished = true;
            const v0 = Math.max(body.vx, 1.5);
            const dist = Math.max(this.stations.finish.stopX - body.worldX, 200);
            body.brake = { a: (v0 * v0) / (2 * dist) };   // constant deceleration that halts at the mark
            if (this.gameState.result) continue;

            const other = who === 'player' ? this.opponent : this.train;
            this.gameState.isRunning = false;
            this.gameState.result = other.worldX >= F ? 'tie' : who === 'player' ? 'win' : 'lose';
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

        // Visual-only hills: glue to the rails (no ballistic airborne).
        if (!TRAIN_PHYSICS_ENABLED) {
            body.elev = chordElev;
            body.vy = 0;
            body.airborne = false;
            const targetAngle = -Math.atan2(elevFront - elevRear, 2 * AXLE_OFFSET);
            body.angle += (targetAngle - body.angle) * TRAIN_ANGLE_LERP;
            return;
        }

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
        this.updateStation(deltaTime);

        // Start ramp: both trains pull out of the station from a standstill and reach cruise
        // speed START_RAMP_SECONDS into the race. Boost taps queue meanwhile (addBoost) and only
        // act once the trains are at full speed.
        const now = Date.now();
        const ramp = this.rampFactor();
        this.boostTokens = this.boostTokens.filter(t => now - t < this.physics.boostMs);
        const activeBoosts    = ramp >= 1 ? this.activeBoostCount() : 0;
        const boostMultiplier = 1 + activeBoosts * this.physics.boostPer;
        const effectiveMax    = this.cruiseSpeed * boostMultiplier * ramp;

        // ── Player ──────────────────────────────────────────────────────────
        const T = this.train;
        if (T.finished) {
            this.brakeTrain(T);   // past the line: brake smoothly to the platform stop
        } else {
            // Friction first, then acceleration — raw equilibrium is 4.0, but the race caps the
            // default cruise speed at cruiseSpeed before boosts.
            T.vx *= T.friction;
            // Auto-accelerate once the race has started. Boost tokens raise the ceiling with no stack cap.
            if (this.raceStarted) T.vx = Math.min(T.vx + T.acceleration * boostMultiplier, effectiveMax);
            // Manual braking still available via ArrowLeft / A on keyboard
            if (this.keys['ArrowLeft'] || this.keys['a']) {
                T.vx = Math.max(T.vx - T.acceleration, -this.cruiseSpeed * 0.5);
            }
            // Slope gravity: uphill slows, downhill speeds. Same additive curve for both trains.
            if (this.raceStarted) this.applyTrackGravity(T, ramp < 1 ? 0 : 0.2);
        }
        const playerMult = T.finished ? 1 : this.speedMultFor(T, 'player');
        T.worldX += T.vx * playerMult;
        this.updateTrainVertical(T);
        T.y = TRACK_FRONT - TRAIN_HEIGHT - T.elev;
        if (T.vx > 0 && !T.finished) this.gameState.distance += T.vx * playerMult;

        this.wheelFrame += Math.abs(T.vx) * this.wheelAnimationSpeed;
        if (this.wheelFrame >= TRAIN_SPRITES.wheels.length) this.wheelFrame = 0;
        this.updateCamera();

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

        // Opponent waits at the station until the player moves
        if (!this.raceStarted) return;

        // ── Opponent ────────────────────────────────────────────────────────
        const O = this.opponent;
        if (O.finished) {
            this.brakeTrain(O);
        } else {
            // Constant-speed opponent (see OPPONENT_CONSTANT_SPEED). Slant, boost budget and
            // adaptive difficulty no longer change its speed; boosting stays off so the flame
            // never shows without an effect. It pulls out of the station on the same ramp.
            const gap = O.worldX - T.worldX;
            O.boosting = false;
            const oppEffectiveTop = Math.min(OPPONENT_CONSTANT_SPEED, OPPONENT_SPEED_CEILING);

            // Flat-ground AI target: the constant speed, or 40% of it when far ahead.
            const tooFarAhead = this.canvas.width * 0.55;
            const targetSpeed = (gap > tooFarAhead ? oppEffectiveTop * 0.4 : oppEffectiveTop) * ramp;

            const diff = targetSpeed - O.vx;
            if (!O.initialRampDone) {
                O.vx += diff * 0.08 * this.physics.inertia;
                if (Math.abs(diff) < 0.05) O.initialRampDone = true;
            } else {
                // Seek target at player-comparable accel. The old cruise/(15*60)
                // maxDelta (~0.005/frame) lost to slope gravity and pinned vx at 0.2.
                const maxDelta = Math.max(T.acceleration, OPPONENT_SPEED_RESPONSIVENESS * this.physics.inertia);
                O.vx += Math.sign(diff) * Math.min(Math.abs(diff), maxDelta);
            }
            this.applyTrackGravity(O, ramp < 1 ? 0 : 0.2, OPPONENT_SPEED_CEILING);
        }
        O.worldX += O.vx * (O.finished ? 1 : this.speedMultFor(O, 'opponent'));
        this.updateTrainVertical(O);
        O.y = TRACK_BACK - TRAIN_HEIGHT - O.elev;
        O.wheelFrame += Math.abs(O.vx) * this.wheelAnimationSpeed;
        if (O.wheelFrame >= TRAIN_SPRITES.wheels.length) O.wheelFrame = 0;

        this.updateCars();
        this.updateMarks();
        this.updateFx(deltaTime);
        this.checkFinish();
        this.gameState.time += deltaTime;

        // ── Sound: volume tracks speed; restart from silence when re-accelerating after stop ──
        this.updateSound();
    }

    // ── Horn ───────────────────────────────────────────────────────────────
    // The clip is the 2.5 s–7 s slice of the source recording. Pressing H restarts
    // it; releasing H fades it out quickly, so a tap is a short toot and a hold
    // rides the whole blast.
    honkStart() {
        if (!this._hornBuf) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.honkStop(0.03);
        const src  = this.audioCtx.createBufferSource();
        const gain = this.audioCtx.createGain();
        src.buffer = this._hornBuf;
        gain.gain.value = 0.9;
        src.connect(gain);
        gain.connect(this.audioCtx.destination);
        src.start();
        const horn = { src, gain };
        this._horn = horn;
        src.onended = () => {
            if (this._horn === horn) this._horn = null;
            gain.disconnect();
        };
    }

    honkStop(fade = 0.12) {
        const horn = this._horn;
        if (!horn) return;
        this._horn = null;
        const t = this.audioCtx.currentTime;
        horn.gain.gain.cancelScheduledValues(t);
        horn.gain.gain.setValueAtTime(horn.gain.gain.value, t);
        horn.gain.gain.linearRampToValueAtTime(0, t + fade);
        try { horn.src.stop(t + fade + 0.02); } catch (_) {}
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

    // Varispeed for the looped engine recording: playbackRate re-pitches AND
    // time-stretches together, so a faster train sounds higher and chuggier and a
    // slower one lower and lazier. 1.0 at cruise speed, clamped to [0.5, 1.8].
    _engRateForSpeed(effSpeed) {
        const ratio = Math.max(effSpeed / this.cruiseSpeed, 0.05);
        return Math.min(1.8, Math.max(0.5, Math.pow(ratio, 0.6)));
    }

    // Glide a looping source toward `rate` (start/end clips are left alone).
    _setEngRate(src, rate) {
        if (!src || !src.loop) return;
        src.playbackRate.setTargetAtTime(rate, this.audioCtx.currentTime, 0.08);
    }

    updateSound() {
        const vx   = this.train.vx;
        // Effective speed includes the hill multiplier, so the engine labors uphill
        // and races downhill; stop/start thresholds still use the raw vx.
        const eff  = vx * (this.train.slopeMult ?? 1);
        const vol  = Math.min(eff / this.cruiseSpeed, 0.8);
        const rate = this._engRateForSpeed(eff);

        switch (this._soundState) {
            case 'idle':
                if (vx > 0.05 && this._engBufs.start && this._engBufs.loop) {
                    const t       = this.audioCtx.currentTime;
                    // Pre-schedule the loop to start exactly when the start clip ends
                    // — sample-accurate, zero gap between the two clips.
                    const startSrc = this._makeEngSrc('start');
                    const loopSrc  = this._makeEngSrc('loop', /*loop=*/true);
                    loopSrc.playbackRate.value = rate;   // start clip stays at 1.0 so the loop schedule holds
                    this._engRate = rate;
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
                this._engRate = rate;
                this._setEngRate(this._engPending, rate);
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
                this._engRate = rate;
                this._setEngRate(this._engSrc, rate);
                if (vx <= 0.05) {
                    // Cross-fade loop → end clip
                    this._stopEngSrc(this._engSrc);
                    this._engSrc = null;
                    if (this._engBufs.end) {
                        const endSrc = this._makeEngSrc('end');
                        endSrc.playbackRate.value = this._engRate;  // no pitch jump into the wind-down
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
                        loopSrc.playbackRate.value = rate;
                        this._engRate = rate;
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
        const surfaceY = HORIZON_Y - playerElev;
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
            const gy = HORIZON_Y - elev;
            if (sx === 0) ctx.moveTo(sx, gy);
            else          ctx.lineTo(sx, gy);
        }
        ctx.lineTo(W, H + this.visualAmpMax() + 400);
        ctx.lineTo(0, H + this.visualAmpMax() + 400);
        ctx.closePath();
        ctx.fill();
        this.drawGroundContours(ctx, W, HORIZON_Y);
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
        const p  = TRAIN_RIG.px;  // 1 art-pixel = 4 screen-pixels
        const cw = TRAIN_WIDTH;   // 160 screen px = 40 art px

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
            for (const col of TRAIN_RIG.axleCols) ctx.fillRect(cx + p*col, cy + p*TRAIN_RIG.wheelRow, p, p);   // axle attachments

            // ── Wheels: animated, reuse locomotive wheel sprite ──────────────────
            const wf = Math.floor(wheelFrame) % TRAIN_SPRITES.wheels.length;
            this.renderer.renderSprite(TRAIN_SPRITES.wheels[wf], cx, cy + p*TRAIN_RIG.wheelRow);
        }
        if (this._doors > 0.01) TRAIN_RIG.drawDoors(ctx, cx, cy, this._doors);   // boarding doors
    }

    // Draw as many carts as needed to fill past the left (off-screen) edge.
    drawCarts(ctx, sx, cy, stripeColor, windowColor, wheelFrame, isCity, marks) {
        for (let i = 0; i < 12; i++) {
            const cx = sx - (i + 1) * TRAIN_WIDTH;
            if (cx + TRAIN_WIDTH < 0) break;  // fully off-screen left — stop
            this.drawSingleCart(ctx, cx, cy, stripeColor, windowColor, wheelFrame, isCity);
            this.drawMarksFor(ctx, marks, i + 1, cx, cy);
        }
    }

    // Draw carts following the mountain terrain — each cart rendered from its
    // own simulated tie-physics state (elevation + pitch), so the consist
    // articulates over crests and can trail the locomotive through the air.
    drawMountainCarts(ctx, train, baseTrackY, stripeColor, windowColor, wheelFrame, marks) {
        for (let ci = 0; ci < train.carts.length; ci++) {
            const cart = train.carts[ci];
            const cartSX = this.worldToScreen(cart.centerX - TRAIN_WIDTH / 2);
            if (cartSX + TRAIN_WIDTH < 0) break;
            // Pivot on the rail contact point (bottom-center of cart)
            ctx.save();
            ctx.translate(cartSX + TRAIN_WIDTH / 2, baseTrackY - cart.elev);
            ctx.rotate(cart.angle);
            ctx.translate(-TRAIN_WIDTH / 2, -TRAIN_HEIGHT);
            this.drawSingleCart(ctx, 0, 0, stripeColor, windowColor, wheelFrame, false);
            this.drawMarksFor(ctx, marks, ci + 1, 0, 0);
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

    // Contour lines under the surface plus a bright rim: parallel curves along a
    // hilltop make the incline readable at a glance, even on a wide screen.
    drawGroundContours(ctx, W, surfaceBase) {
        const step = 6;
        const pts = [];
        for (let sx = -step; sx <= W + step; sx += step) {
            const wx = sx + this.cameraX - W / 2 + TRAIN_WIDTH / 2;
            pts.push([sx, surfaceBase - this.getElevation(wx)]);
        }
        const trace = (dy) => {
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
            ctx.stroke();
        };
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 2;
        for (const dy of [22, 52, 96, 150]) trace(dy);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        trace(1);
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 1.5;
        trace(4);
    }

    // Sahara used to draw no ground at all (the trains just moved against a flat
    // backdrop). Now the dunes are a real silhouette that follows the terrain.
    drawSaharaGround(ctx) {
        const W = this.canvas.width, H = this.canvas.height;
        const playerElev = this.getElevation(this.train.worldX + TRAIN_WIDTH / 2);
        const surfaceY = HORIZON_Y - playerElev;
        const grad = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + 240);
        grad.addColorStop(0,    '#dcb86e');  // sunlit sand
        grad.addColorStop(0.35, '#bd9250');
        grad.addColorStop(1,    '#7d5f33');  // shadowed sand
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let sx = 0; sx <= W; sx += 4) {
            const wx = sx + this.cameraX - W / 2 + TRAIN_WIDTH / 2;
            const gy = HORIZON_Y - this.getElevation(wx);
            if (sx === 0) ctx.moveTo(sx, gy); else ctx.lineTo(sx, gy);
        }
        const bottom = H + this.visualAmpMax() + 400;
        ctx.lineTo(W, bottom);
        ctx.lineTo(0, bottom);
        ctx.closePath();
        ctx.fill();
        this.drawGroundContours(ctx, W, HORIZON_Y);
    }

    drawMountainGround(ctx) {
        const W = this.canvas.width, H = this.canvas.height;
        const step = 4;

        // Anchor gradient to the player's ground level so it always looks good
        // regardless of camera elevation — green at surface, brown below
        const playerElev = this.getElevation(this.train.worldX + TRAIN_WIDTH / 2);
        const surfaceY = HORIZON_Y - playerElev;
        const grad = ctx.createLinearGradient(0, surfaceY - 30, 0, surfaceY + 300);
        // Snow line: the higher the train climbs, the whiter the ground gets.
        const snow = clamp01((playerElev - 300) / 900);
        grad.addColorStop(0,   mixHex('#5a7a3a', '#f2f7ff', snow));  // alpine green → fresh snow
        grad.addColorStop(0.3, mixHex('#6b8c42', '#e4edf8', snow));  // meadow green → snow
        grad.addColorStop(0.7, mixHex('#8B7355', '#b9c6d6', snow));  // brown earth → blue-grey rock
        grad.addColorStop(1,   mixHex('#5e4a2a', '#8a97a8', snow));  // dark earth → dark rock

        ctx.fillStyle = grad;
        ctx.beginPath();
        // Trace the curve across screen width — use the FRONT track as ground reference
        for (let sx = 0; sx <= W; sx += step) {
            const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
            const elev = this.getElevation(worldX);
            const gy = HORIZON_Y - elev;
            if (sx === 0) ctx.moveTo(sx, gy);
            else          ctx.lineTo(sx, gy);
        }
        // Extend bottom well past screen (camera shifts the viewport)
        ctx.lineTo(W, H + this.visualAmpMax());
        ctx.lineTo(0, H + this.visualAmpMax());
        ctx.closePath();
        ctx.fill();
        this.drawGroundContours(ctx, W, HORIZON_Y);
    }

    trackColors(candy = false) {
        const t = this.def && this.def.track;
        return {
            tie:  (t && t.tie)  || (candy ? '#c47a9e' : '#5C3D1E'),
            rail: (t && t.rail) || (candy ? '#f5d0ea' : '#A0A0A0'),
        };
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
        ctx.fillStyle = this.trackColors(candy).tie;
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
        ctx.strokeStyle = this.trackColors(candy).rail;
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

    // ── City Bridge: suspension bridge ──────────────────────────────────────
    // Behind the trains: river, steel truss deck, piers, main cables, hangers and lamps, and
    // the far leg of each tower. The near leg is drawn after the trains (drawBridgeTowers).
    drawBridgeSpan(ctx) {
        const W = this.canvas.width, H = this.canvas.height;
        const t = Date.now() / 1000;
        const deckTop = TRACK_BACK - 9, deckBot = TRACK_FRONT + 9;
        const trussBot = deckBot + 34;
        const topY = 24, lowY = 150;               // cable saddle height / lowest point mid-span
        for (const z of this.bridgeZones) {
            const sx1 = this.worldToScreen(z.startX), sx2 = this.worldToScreen(z.endX);
            if (sx2 < -60 || sx1 > W + 60) continue;
            const a = Math.max(0, sx1), b = Math.min(W, sx2);
            ctx.save();
            ctx.beginPath();
            ctx.rect(a, 0, b - a, H);
            ctx.clip();

            // River: dark water with moonlit shimmer, replacing the street and pillars.
            const water = ctx.createLinearGradient(0, HORIZON_Y, 0, H);
            water.addColorStop(0, '#1d4560');
            water.addColorStop(1, '#0b1f2d');
            ctx.fillStyle = water;
            ctx.fillRect(a, HORIZON_Y, b - a, H - HORIZON_Y);
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 70; i++) {
                const h = (k) => ThemeKit.hash(i * 3.1 + z.startX * 0.001 + k);
                const wx = z.startX + h(1) * (z.endX - z.startX);
                const y = trussBot + 14 + h(2) * (H - trussBot - 14);
                const sx = this.worldToScreen(wx);
                ctx.strokeStyle = `rgba(190,225,255,${0.12 + 0.22 * Math.abs(Math.sin(t * 1.4 + i))})`;
                ctx.beginPath();
                ctx.moveTo(sx, y);
                ctx.lineTo(sx + 14 + h(3) * 22, y);
                ctx.stroke();
            }

            // Boats chugging along the river, each with a running light and a wake.
            for (let i = 0; i < 3; i++) {
                const len = z.endX - z.startX;
                const wx = z.startX + (((ThemeKit.hash(i + 11) * len + t * (24 + i * 9) * (i % 2 ? -1 : 1)) % len) + len) % len;
                const sx = this.worldToScreen(wx), by = trussBot + 26 + i * 15 + Math.sin(t * 2 + i) * 1.5;
                ctx.fillStyle = i % 2 ? '#3c5a70' : '#5a3a3a';
                ctx.beginPath();
                ctx.moveTo(sx - 20, by);
                ctx.lineTo(sx + 22, by);
                ctx.lineTo(sx + 15, by + 8);
                ctx.lineTo(sx - 15, by + 8);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#c9d4dc';
                ctx.fillRect(sx - 6, by - 8, 12, 8);
                ctx.fillStyle = '#ffd54f';
                ctx.fillRect(sx + (i % 2 ? -18 : 18), by - 2, 3, 3);
                ctx.strokeStyle = 'rgba(210,235,255,0.3)';
                ctx.beginPath();
                ctx.moveTo(sx - (i % 2 ? -20 : 20), by + 8);
                ctx.lineTo(sx - (i % 2 ? -52 : 52), by + 10);
                ctx.stroke();
            }

            // Deck: steel plating over a truss with X-bracing.
            ctx.fillStyle = '#4d6270';
            ctx.fillRect(a, deckTop, b - a, deckBot - deckTop);
            ctx.fillStyle = '#90a4ae';
            ctx.fillRect(a, TRACK_BACK - 9, b - a, 5);
            ctx.fillRect(a, TRACK_FRONT + 4, b - a, 5);
            ctx.fillStyle = '#34444f';
            ctx.fillRect(a, deckBot, b - a, trussBot - deckBot);
            ctx.strokeStyle = '#7f93a3';
            ctx.lineWidth = 2;
            const bay = 44;
            const k0 = Math.floor((a - sx1) / bay) - 1;
            ctx.beginPath();
            for (let k = k0; sx1 + k * bay < b + bay; k++) {
                const x = sx1 + k * bay;
                ctx.moveTo(x, deckBot);
                ctx.lineTo(x + bay, trussBot);
                ctx.moveTo(x + bay, deckBot);
                ctx.lineTo(x, trussBot);
            }
            ctx.stroke();
            ctx.fillStyle = '#9fb3c1';
            ctx.fillRect(a, deckBot, b - a, 3);
            ctx.fillRect(a, trussBot - 3, b - a, 3);

            // Piers: concrete columns sinking into the river with foam at the base.
            for (const tx of z.towers) {
                const sx = this.worldToScreen(tx);
                ctx.fillStyle = '#56646e';
                ctx.beginPath();
                ctx.moveTo(sx - 30, trussBot);
                ctx.lineTo(sx + 30, trussBot);
                ctx.lineTo(sx + 38, H);
                ctx.lineTo(sx - 38, H);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(sx + 12, trussBot, 18, H - trussBot);
                ctx.strokeStyle = `rgba(225,240,255,${0.35 + 0.2 * Math.sin(t * 2)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(sx, H - 14, 46 + Math.sin(t * 2) * 3, 5, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Main cables: parabolic sag between tower saddles, backstays down to the deck.
            const cableY = (u) => lowY - (lowY - topY) * (2 * u - 1) * (2 * u - 1);
            const towerX = z.towers.map(tx => this.worldToScreen(tx));
            const hangers = [];
            const cable = (x0, y0, x1, y1, yAt) => {
                ctx.beginPath();
                for (let i = 0; i <= 28; i++) {
                    const u = i / 28;
                    const x = x0 + (x1 - x0) * u, y = yAt(u, x);
                    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.stroke();
            };
            ctx.lineCap = 'round';
            for (const [w, col] of [[5, '#6c7f8c'], [2.4, '#d3dde4']]) {
                ctx.lineWidth = w;
                ctx.strokeStyle = col;
                for (let i = 0; i < towerX.length - 1; i++) cable(towerX[i], topY, towerX[i + 1], topY, (u) => cableY(u));
                const last = towerX.length - 1;
                cable(sx1, deckTop, towerX[0], topY, (u, x) => deckTop + (topY - deckTop) * u + 0);
                cable(towerX[last], topY, sx2, deckTop, (u) => topY + (deckTop - topY) * u);
            }
            // Hangers (and warm lamps) along every span and backstay.
            ctx.lineWidth = 1.5;
            const hang = (xa, ya, xb, yb, yAt) => {
                const n = Math.max(1, Math.floor(Math.abs(xb - xa) / 34));
                for (let i = 1; i < n; i++) {
                    const u = i / n, x = xa + (xb - xa) * u, y = yAt(u);
                    ctx.strokeStyle = '#aab7c0';
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, deckTop);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255,213,79,0.2)';
                    ctx.beginPath();
                    ctx.arc(x, deckTop - 3, 7, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffd54f';
                    ctx.fillRect(x - 1.5, deckTop - 5, 3, 3);
                }
            };
            for (let i = 0; i < towerX.length - 1; i++) hang(towerX[i], topY, towerX[i + 1], topY, (u) => cableY(u));
            hang(sx1, deckTop, towerX[0], topY, (u) => deckTop + (topY - deckTop) * u);
            hang(towerX[towerX.length - 1], topY, sx2, deckTop, (u) => topY + (deckTop - topY) * u);
            ctx.lineCap = 'butt';

            // Far tower legs, set slightly behind and darker than the near ones.
            for (const sx of towerX) this.bridgeTowerShape(ctx, sx + 13, '#2b3a45', '#3a4b58', t);
            ctx.restore();
        }
    }

    // After the trains: the near leg of each tower, so trains slide behind it as they pass.
    drawBridgeTowers(ctx) {
        const W = this.canvas.width;
        const t = Date.now() / 1000;
        for (const z of this.bridgeZones) {
            for (const tx of z.towers) {
                const sx = this.worldToScreen(tx);
                if (sx < -60 || sx > W + 60) continue;
                this.bridgeTowerShape(ctx, sx, '#5d7280', '#7d93a1', t);
            }
        }
    }

    // One tapered art-deco tower leg from the river up past the cables, with a beacon.
    bridgeTowerShape(ctx, sx, body, trim, t) {
        const H = this.canvas.height, w = 22;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(sx - w, H);
        ctx.lineTo(sx - w * 0.62, 22);
        ctx.lineTo(sx - w * 0.42, 12);
        ctx.lineTo(sx, 3);
        ctx.lineTo(sx + w * 0.42, 12);
        ctx.lineTo(sx + w * 0.62, 22);
        ctx.lineTo(sx + w, H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = trim;
        ctx.fillRect(sx - w * 0.62, 22, w * 0.3, H);         // lit edge
        for (const y of [70, 130, 190]) {                    // cross-beam bands
            ctx.fillRect(sx - w * (0.7 + y / 700), y, w * (1.4 + y / 350), 5);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(sx + w * 0.2, 22, w * 0.4, H);          // shaded edge
        ctx.fillStyle = Math.sin(t * 3) > 0 ? '#ff5252' : '#6b1f1f';   // aviation light
        ctx.fillRect(sx - 2, 0, 4, 4);
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

    drawTrack(ctx, groundY, scrollSpeed, candy = false) {
        const offset = (this.cameraX * scrollSpeed) % 24;
        ctx.fillStyle = this.trackColors(candy).tie;
        for (let x = -offset; x < this.canvas.width + 24; x += 24) {
            ctx.fillRect(x - 1, groundY - 5, 7, 5);
        }
        ctx.fillStyle = this.trackColors(candy).rail;
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
    // elevated themes add a faint elevation silhouette under the markers.
    drawMinimap(ctx) {
        const W = this.canvas.width;
        const isMountain = this.theme === 'mountain';
        const isCandy = this.theme === 'candy';
        const isSahara = this.theme === 'sahara';
        const showElev = isMountain || isCandy || (isSahara && this.saharaHills.length > 0)
            || (!!this.def && this.hasElevatedTrack());
        const lightTheme = isCandy || isSahara || (!!this.def && !!this.def.lightHud);
        const mapW = Math.round(Math.min(220, Math.max(140, W * 0.22)));
        const mapH = showElev ? 34 : 14;
        const pad  = 10;
        const x0   = W - mapW - pad;
        const y0   = pad;
        const lineY = showElev ? y0 + mapH - 4 : y0 + mapH / 2;
        const ampMax = Math.max(this.visualAmpMax(), 1);
        // Candy swings above and below baseline; mountain/sahara are positive bumps.
        const elevRange = isCandy ? ampMax * 2 : ampMax;
        const baseElev = isCandy ? ampMax : 0;
        const elevScale = (mapH - 6) / elevRange;

        // Solid-enough panel so the strip stays readable on pastel candy / sahara skies
        ctx.fillStyle = lightTheme ? 'rgba(20,16,28,0.72)' : 'rgba(0,0,0,0.45)';
        ctx.fillRect(x0 - 6, y0 - 4, mapW + 12, mapH + 10);

        if (showElev) {
            ctx.beginPath();
            ctx.moveTo(x0, lineY);
            for (let i = 0; i <= mapW; i++) {
                const elev = this.getVisualElevation((i / mapW) * this.finishLineWorldX);
                ctx.lineTo(x0 + i, lineY - (elev + baseElev) * elevScale);
            }
            ctx.lineTo(x0 + mapW, lineY);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.fill();

            ctx.beginPath();
            for (let i = 0; i <= mapW; i++) {
                const elev = this.getVisualElevation((i / mapW) * this.finishLineWorldX);
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

        // Static mechanic zones (mud, pads, ...) as coloured ticks on the course line.
        const mech = this.def && this.def.mechanic;
        if (mech && mech.minimapMarks) {
            for (const m of mech.minimapMarks(this.mechState, this) || []) {
                const a = Math.min(Math.max(m.x0 / this.finishLineWorldX, 0), 1);
                const b = Math.min(Math.max(m.x1 / this.finishLineWorldX, 0), 1);
                ctx.fillStyle = m.color;
                ctx.fillRect(x0 + a * mapW, lineY - 3, Math.max((b - a) * mapW, 1.5), 6);
            }
        }

        const markerY = (worldX) => {
            if (!showElev) return lineY;
            const elev = this.getVisualElevation(
                Math.min(Math.max(worldX, 0), this.finishLineWorldX)
            );
            return lineY - (elev + baseElev) * elevScale;
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

        if (!(mech && mech.hideOpponentOnMinimap)) drawMarker(this.opponent.worldX, '#3498db');
        drawMarker(this.train.worldX, '#e74c3c');
    }

    drawResult(ctx) {
        const { result } = this.gameState;
        // Wait until the trains have stopped and the boarding is over (overlayAt, see updateStation)
        if (!this.overlayAt || Date.now() < this.overlayAt) return;
        const label = result === 'win' ? 'YOU WIN!' : result === 'lose' ? 'YOU LOSE' : 'TIE!';
        const color = result === 'win' ? '#2ecc71'  : result === 'lose' ? '#e74c3c'  : '#f1c40f';
        // Fade in over 0.5 s
        const fadeAlpha = Math.min((Date.now() - this.overlayAt) / 500, 1);
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

    // Original four levels (sahara, city, mountain, candy).
    drawLegacyWorld(ctx) {
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
            // The sky deepens toward space as the train climbs the giant hill.
            const alt = clamp01(this.cameraY / Math.max(this.visualAmpMax(), 1)) * 0.85;
            const sky = ctx.createLinearGradient(0, 0, 0, H);
            sky.addColorStop(0,    mixHex('#2a7fc6', '#0b1b3f', alt));  // deep alpine blue → near-black
            sky.addColorStop(0.5,  mixHex('#5aaee8', '#1c4a86', alt));  // bright blue → deep blue
            sky.addColorStop(1,    mixHex('#8dcaf0', '#5d8fc4', alt));  // pale blue at bottom
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, W, H);
            if (alt > 0.3) {
                const starAlpha = clamp01((alt - 0.3) / 0.45) * 0.85;
                const t = Date.now() / 700;
                ctx.fillStyle = '#ffffff';
                for (let i = 0; i < 44; i++) {
                    const sx = ((i * 7919) % 997) / 997 * W;
                    const sy = ((i * 104729) % 991) / 991 * HORIZON_Y * 0.95;
                    ctx.globalAlpha = starAlpha * (0.55 + 0.45 * Math.sin(t + i * 1.7));
                    ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
                }
                ctx.globalAlpha = 1;
            }
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
        // Candy lags every far layer by its parallax speed. The giant mountain hill is
        // far taller than that trick can handle, so its far range sinks at most 90 px
        // (instead of the full climb) and stays visible behind the summit.
        const bgVParallax = (theme === 'candy' || theme === 'sahara') ? -this.cameraY * (1 - mLayer.speed)
            : theme === 'mountain' ? Math.min(this.cameraY * mLayer.speed, 90) - this.cameraY
            : 0;
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

        // ── Sahara dunes (a real ground silhouette that follows the hills) ───
        if (theme === 'sahara') this.drawSaharaGround(ctx);

        // ── City-specific ground, street & pillars ───────────────────────────
        if (theme === 'city') {
            this.drawCityGround(ctx);
            this.drawBridgeSpan(ctx);
            for (const car of this.cars) if (!this.inBridge(car.x, 60)) this.drawCar(ctx, car);
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
            const midVParallax = 0;   // anchored to the terrain: a parallax shift here made trees float
            if (midVParallax) ctx.translate(0, midVParallax);
            for (const obj of tLayer.objects) {
                const sx = obj.x - this.cameraX * 0.6;
                if (obj.type === 'lollipop') {
                    const worldX = sx + this.cameraX - this.canvas.width / 2 + TRAIN_WIDTH / 2;
                    this.drawLollipop(ctx, obj, sx, this.getElevation(worldX));
                } else if (theme === 'mountain' || theme === 'candy' || theme === 'sahara') {
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
        this._doors = this.opponent.doorOpen;
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
            this.drawLocoDoors(ctx, 0, 0);
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
            this.drawLocoDoors(ctx, opponentSX, oppY);
        }
        this.drawStations(ctx, 'back');
        this.drawCrowdLayer(ctx, 'mid');

        // Sahara/mountain/candy foreground props
        if (theme === 'sahara' || theme === 'mountain' || theme === 'candy') {
            const rLayer = this.layers.find(l => l.name === 'rocks');
            const fgVParallax = 0;    // anchored to the terrain (see midVParallax)
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
        this._doors           = this.train.doorOpen;
        const activeBoostsNow = this.activeBoostCount();
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
            this.drawLocoDoors(ctx, 0, 0);
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
            this.drawLocoDoors(ctx, trainSX, trainY);
        }
        this.drawStations(ctx, 'front');
        this.drawCrowdLayer(ctx, 'front');
        this.drawStations(ctx, 'over');

        // ── Tunnel overlay (city only) ───────────────────────────────────────
        if (theme === 'city') {
            this.drawTunnelEffect(ctx);   // draws each visible tunnel zone clipped to its bounds
            this.drawTunnelPortals(ctx);  // portals on top so jambs always crisp at the edges
            this.drawBridgeTowers(ctx);   // near tower legs pass in front of the trains
        }

        // ── End vertical camera shift ──────────────────────────────────────
        if (elevated) {
            ctx.restore();
        }
    }

    // Registry levels (themes/*.js): data-driven sky, ground, scenery and mechanic.
    drawThemedWorld(ctx) {
        const def = this.def;
        const W = this.canvas.width, H = this.canvas.height;
        const layersDef = def.layers || {};
        const mech = def.mechanic;
        const elevated = this.hasElevatedTrack();

        const skyStops = typeof def.sky === 'function' ? def.sky(this) : def.sky;
        const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 30);
        for (const [stop, color] of skyStops) sky.addColorStop(stop, color);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);
        if (def.drawSky) def.drawSky(ctx, this, W, H);

        if (elevated) { ctx.save(); ctx.translate(0, this.cameraY); }

        // Far layer lags the climb by its parallax speed, capped so it stays visible.
        const mLayer = this.layers.find(l => l.name === 'mountains');
        const farShift = elevated
            ? Math.min(this.cameraY * mLayer.speed, def.farShiftMax ?? 90) - this.cameraY : 0;
        if (farShift) ctx.translate(0, farShift);
        if (layersDef.mountains) {
            for (const obj of mLayer.objects) {
                layersDef.mountains.draw(ctx, obj, obj.x - this.cameraX * 0.3, this, 0);
            }
        }
        if (farShift) ctx.translate(0, -farShift);

        this.drawThemedGround(ctx, W, H);

        const elevAtScreen = (sx) => elevated
            ? this.getElevation(sx + this.cameraX - W / 2 + TRAIN_WIDTH / 2) : 0;
        const tLayer = this.layers.find(l => l.name === 'trees');
        if (layersDef.trees) {
            for (const obj of tLayer.objects) {
                const sx = obj.x - this.cameraX * 0.6;
                layersDef.trees.draw(ctx, obj, sx, this, elevAtScreen(sx));
            }
        }

        if (mech && mech.drawZones) mech.drawZones(ctx, this.mechState, this, 'ground');

        if (elevated) this.drawMountainTrack(ctx, TRACK_BACK);
        else          this.drawTrack(ctx, TRACK_BACK, 0.85);
        const oppAlpha = mech && mech.opponentAlpha ? mech.opponentAlpha(this.mechState, this) : 1;
        ctx.globalAlpha = oppAlpha;
        this.drawThemedTrain(ctx, 'opponent', elevated);
        this.drawHazardFx(ctx, 'opponent');
        ctx.globalAlpha = 1;
        this.drawStations(ctx, 'back');
        this.drawCrowdLayer(ctx, 'mid');

        const rLayer = this.layers.find(l => l.name === 'rocks');
        if (layersDef.rocks) {
            for (const obj of rLayer.objects) {
                const sx = obj.x - this.cameraX * 0.9;
                layersDef.rocks.draw(ctx, obj, sx, this, elevAtScreen(sx));
            }
        }

        if (elevated) this.drawMountainTrack(ctx, TRACK_FRONT);
        else          this.drawTrack(ctx, TRACK_FRONT, 1.0);
        this.drawFinishLine(ctx);
        this.drawThemedTrain(ctx, 'player', elevated);
        this.drawHazardFx(ctx, 'player');
        this.drawStations(ctx, 'front');
        this.drawCrowdLayer(ctx, 'front');
        this.drawStations(ctx, 'over');
        if (mech && mech.drawZones) mech.drawZones(ctx, this.mechState, this, 'over');

        if (elevated) ctx.restore();
        if (def.drawFx) def.drawFx(ctx, this, W, H);
    }

    // Ground band for registry levels: flat below the horizon, or following the terrain.
    drawThemedGround(ctx, W, H) {
        const stops = this.def.ground || [[0, '#888'], [1, '#444']];
        const playerElev = this.getElevation(this.train.worldX + TRAIN_WIDTH / 2);
        const surfaceY = HORIZON_Y - playerElev;
        const grad = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + 220);
        for (const [stop, color] of stops) grad.addColorStop(stop, color);
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (this.hasElevatedTrack()) {
            for (let sx = 0; sx <= W; sx += 4) {
                const wx = sx + this.cameraX - W / 2 + TRAIN_WIDTH / 2;
                const gy = HORIZON_Y - this.getElevation(wx);
                if (sx === 0) ctx.moveTo(sx, gy); else ctx.lineTo(sx, gy);
            }
            const bottom = H + this.visualAmpMax() + 400;
            ctx.lineTo(W, bottom);
            ctx.lineTo(0, bottom);
        } else {
            ctx.rect(0, HORIZON_Y, W, H - HORIZON_Y);
        }
        ctx.closePath();
        ctx.fill();
        if (this.hasElevatedTrack()) this.drawGroundContours(ctx, W, HORIZON_Y);
        if (this.def.drawGround) this.def.drawGround(ctx, this, W, H);
    }

    drawThemedTrain(ctx, who, elevated) {
        const opp = who === 'opponent';
        const body = opp ? this.opponent : this.train;
        const baseY = opp ? TRACK_BACK : TRACK_FRONT;
        const sprites = opp ? OPPONENT_SPRITES : TRAIN_SPRITES;
        const stripe = opp ? '#3498db' : '#e74c3c';
        const win = opp ? '#2980b9' : '#3498db';
        const wheelFrame = opp ? body.wheelFrame : this.wheelFrame;
        const flame = opp ? body.boosting : this.activeBoostCount() > 0;
        const sx = this.worldToScreen(body.worldX);
        const marks = this.marks[opp ? 'opponent' : 'player'];
        this._doors = body.doorOpen;
        if (elevated) {
            this.drawMountainCarts(ctx, body, baseY, stripe, win, wheelFrame, marks);
            ctx.save();
            ctx.translate(sx + TRAIN_WIDTH / 2, baseY - body.elev);
            ctx.rotate(body.angle);
            ctx.translate(-TRAIN_WIDTH / 2, -TRAIN_HEIGHT);
            if (flame) this.drawFlame(ctx, 0, 44);
            this.renderer.renderSprite(sprites.idle[0], 0, 0);
            this.renderer.renderSprite(sprites.wheels[Math.floor(wheelFrame)], 0, 40);
            this.drawLocoDoors(ctx, 0, 0);
            this.drawMarksFor(ctx, marks, 0, 0, 0);
            ctx.restore();
        } else {
            const y = body.y;
            this.drawCarts(ctx, sx, y, stripe, win, wheelFrame, false, marks);
            if (flame) this.drawFlame(ctx, sx, y + 44);
            this.renderer.renderSprite(sprites.idle[0], sx, y);
            this.renderer.renderSprite(sprites.wheels[Math.floor(wheelFrame)], sx, y + 40);
            this.drawLocoDoors(ctx, sx, y);
            this.drawMarksFor(ctx, marks, 0, sx, y);
        }
    }

    // Level name + one-line mechanic hint, shown before the race and fading out
    // a few seconds after it starts.
    drawLevelBanner(ctx) {
        if (this.gameState.result || !this.levelName) return;
        const t = this.raceStarted ? this.gameState.time : 0;
        const alpha = this.raceStarted ? clamp01(1 - (t - 3) / 1.5) : 1;
        if (alpha <= 0) return;
        const W = this.canvas.width;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px monospace';
        ctx.strokeText(this.levelName.toUpperCase(), W / 2, 38);
        ctx.fillText(this.levelName.toUpperCase(), W / 2, 38);
        if (this.levelHint) {
            ctx.font = 'bold 15px monospace';
            ctx.strokeText(this.levelHint, W / 2, 62);
            ctx.fillText(this.levelHint, W / 2, 62);
        }
        ctx.restore();
    }

    draw() {
        const ctx   = this.renderer.ctx;
        const W     = this.canvas.width, H = this.canvas.height;

        const z = this.zoom;
        if (z < 0.995) {
            // Zoomed out at the end station: draw the world into a bigger offscreen canvas (so
            // every `canvas.width` the scenery code reads covers the wider view) and shrink it
            // onto the screen, anchored on the rails. The sky's top row is stretched upward to
            // fill the extra height above the horizon.
            const Wz = Math.round(W / z), Hz = Math.round(H / z), dy = Math.round(STATION_ANCHOR_Y * (1 / z - 1));
            const off = this._zoomCanvas || (this._zoomCanvas = document.createElement('canvas'));
            if (off.width !== Wz || off.height !== Hz) { off.width = Wz; off.height = Hz; }
            const octx = off.getContext('2d');
            const mainCanvas = this.canvas;
            this.canvas = off;
            this.renderer.ctx = octx;
            octx.save();
            octx.translate(0, dy);
            try {
                if (this.def) this.drawThemedWorld(octx);
                else          this.drawLegacyWorld(octx);
            } finally {
                octx.restore();
                this.canvas = mainCanvas;
                this.renderer.ctx = ctx;
            }
            octx.drawImage(off, 0, dy, Wz, 1, 0, 0, Wz, dy);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(off, 0, 0, Wz, Hz, 0, 0, W, H);
        } else if (this.def) this.drawThemedWorld(ctx);
        else                 this.drawLegacyWorld(ctx);

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

        // ── HUD ─────────────────────────────────────────────────────────────
        this.drawLevelBanner(ctx);
        this.drawMinimap(ctx);
        const activeBoosts = this.activeBoostCount();
        const boostPct     = Math.round(activeBoosts * this.physics.boostPer * 100);
        document.getElementById('speed').textContent =
            Math.round(this.train.vx * 10) / 10 + (activeBoosts > 0 ? ` 🔥+${boostPct}%` : '');
        document.getElementById('distance').textContent =
            `${Math.min(Math.round(this.gameState.distance), this.finishLineWorldX)} / ${this.finishLineWorldX}`;
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
