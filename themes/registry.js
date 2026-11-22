// Level registry. Every file in themes/ calls registerTheme({...}) with one level.
// game.js reads THEME_DEFS at race time, so these files only need to load before it.
//
// A level definition:
//   id, name, hint        id is the ?theme=<id> value; hint is the one-line banner text
//   sky                   [[stop, color], ...] gradient stops, or (game) => stops
//   drawSky(ctx, game, W, H)        optional: stars, sun, aurora (screen space, under the world)
//   ground                [[stop, color], ...] ground gradient (anchored at the surface)
//   drawGround(ctx, game, W, H)     optional: texture drawn on top of the ground band
//   track                 { tie, rail } colors (optional)
//   lightHud              true when the sky is pale (darkens the minimap panel)
//   terrain(finishX)      optional: { elevation(x), slope(x), ampMax } with elevation >= 0
//   slopeGain             optional: hill speed gain for this level (default 1.2)
//   layers.{mountains,trees,rocks}   { spawn(x, game) -> obj, draw(ctx, obj, sx, game, elev) }
//   drawFx(ctx, game, W, H)         optional: weather/particles in screen space, over everything
//   mechanic              optional, see below
//
// A mechanic changes how the level plays. It must hit BOTH trains through the same
// functions, be visible before you reach it, and be playable with boost taps alone:
//   physics   { inertia, boostMs, boostPer }   inertia < 1 = sluggish accel/decel;
//                                               boostMs = tap lifetime; boostPer = +speed per tap
//   init(game)                               -> per-race state (zones etc.)
//   speedMult(state, x, t, game)             -> multiplier on displacement at train-center x
//                                               (t = race seconds). < 1 is a penalty that active
//                                               boost taps partly relieve for the player.
//   drawZones(ctx, state, game, pass)        pass is 'ground' (under trains) or 'over'
//   minimapMarks(state, game)                -> [{ x0, x1, color }] static zones for the minimap
//   opponentAlpha(state, game)               -> 0..1 opacity of the opponent (fog)
//   hideOpponentOnMinimap                    true to hide the opponent marker
const THEME_DEFS = {};

function registerTheme(def) {
    THEME_DEFS[def.id] = def;
}

const ThemeKit = {
    rand: (a, b) => a + Math.random() * (b - a),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],

    // Deterministic pseudo-random in [0, 1) from an integer seed (stable per frame).
    hash(i) {
        const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        return s - Math.floor(s);
    },

    // Train-center world x -> screen x (the coordinate speedMult() receives).
    sx: (game, x) => x - game.cameraX + game.canvas.width / 2,

    // Visible world range in train-center coordinates, with a margin.
    visible(game, margin = 80) {
        const half = game.canvas.width / 2;
        return { x0: game.cameraX - half - margin, x1: game.cameraX + half + margin };
    },

    // Non-overlapping zones across the course. opts: { count, lenMin, lenMax, margin, gap }.
    placeZones(game, opts) {
        const { count, lenMin, lenMax } = opts;
        const margin = opts.margin ?? 1800;
        const gap = opts.gap ?? 500;
        const zones = [];
        const span = game.finishLineWorldX - margin * 2;
        const slot = span / count;
        for (let i = 0; i < count; i++) {
            const len = ThemeKit.rand(lenMin, lenMax);
            const room = Math.max(slot - len - gap, 0);
            const x0 = margin + i * slot + ThemeKit.rand(0, room) + gap / 2;
            zones.push({ x0, x1: x0 + len });
        }
        return zones;
    },

    // Fill a strip across both rails between world x0..x1 (follows hills).
    // pad extends it above/below the rails; draws only the visible slice.
    laneStrip(ctx, game, x0, x1, fill, pad = 10) {
        const vis = ThemeKit.visible(game, 20);
        const a = Math.max(x0, vis.x0), b = Math.min(x1, vis.x1);
        if (b <= a) return false;
        const step = 8;
        const top = [], bot = [];
        for (let x = a; x < b + step; x += step) {
            const xx = Math.min(x, b);
            const elev = game.getElevation(xx);
            const sx = ThemeKit.sx(game, xx);
            top.push([sx, TRACK_BACK - 6 - pad - elev]);
            bot.push([sx, TRACK_FRONT + 4 + pad - elev]);
            if (xx === b) break;
        }
        ctx.fillStyle = fill;
        ctx.beginPath();
        top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
        ctx.closePath();
        ctx.fill();
        return true;
    },

    // Smooth 0..1..0 pulse for time-cycled zones: `warn` seconds of telegraph, then
    // `active` seconds on, repeating every `period`. Returns { phase, t } where phase
    // is 'idle' | 'warn' | 'active' and t is 0..1 progress within that phase.
    pulse(t, period, warn, active, offset = 0) {
        const c = (((t + offset) % period) + period) % period;
        const idle = period - warn - active;
        if (c < idle) return { phase: 'idle', t: c / Math.max(idle, 1e-6) };
        if (c < idle + warn) return { phase: 'warn', t: (c - idle) / warn };
        return { phase: 'active', t: (c - idle - warn) / active };
    },
};

// ── Hazard residue renderers ───────────────────────────────────────────────
// A level's mechanic.marks makes these stick to the trains (see updateMarks in game.js).
// Each renderer draws one mark at (x, y) on a car; m.r is its size, age is seconds since it
// landed. Add a kind here (or from a theme file) and name it in mechanic.marks.kind.
ThemeKit.marks = {
    // Mud splatter: a dark blob ringed by flung droplets.
    mud(ctx, m, x, y) {
        const h = (k) => ThemeKit.hash(m.seed + k);
        ctx.fillStyle = m.style.c1 || '#5b3d22';
        ctx.beginPath();
        ctx.ellipse(x, y, m.r, m.r * 0.75, h(0) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = m.style.c2 || '#7a5632';
        for (let i = 0; i < 5; i++) {
            const a = h(i + 1) * 6.28, d = m.r * (0.8 + h(i + 9));
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8 + h(i + 5) * 1.8, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,230,190,0.22)';
        ctx.fillRect(x - m.r * 0.4, y - m.r * 0.5, m.r * 0.5, 1.5);
    },

    // Molten lava splat that cools to a permanent scorch mark: a charred core and soot
    // halo stay behind; the glowing orange fades over m.hot seconds.
    lava(ctx, m, x, y, age) {
        const h = (k) => ThemeKit.hash(m.seed + k);
        const glow = Math.max(0, Math.min(1, 1 - age / Math.max(m.hot, 0.01)));
        ctx.fillStyle = 'rgba(25,12,8,0.5)';
        ctx.beginPath();
        ctx.ellipse(x, y, m.r * 1.9, m.r * 1.4, h(1) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c100c';
        ctx.beginPath();
        ctx.ellipse(x, y, m.r * 1.1, m.r * 0.85, h(2) * 3, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 6; i++) {
            const a = h(i + 3) * 6.28, d = m.r * (1.2 + h(i + 9) * 1.1);
            ctx.fillStyle = i % 2 ? '#1c100c' : 'rgba(25,12,8,0.6)';
            ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.5 + h(i + 13) * 2, 1.5 + h(i + 17) * 2);
        }
        if (glow > 0) {
            ctx.fillStyle = `rgba(255,${Math.round(90 + 130 * glow)},30,${0.35 + 0.65 * glow})`;
            ctx.beginPath();
            ctx.ellipse(x, y, m.r * (0.7 + 0.4 * glow), m.r * (0.55 + 0.3 * glow), h(2) * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255,240,170,${glow})`;
            ctx.beginPath();
            ctx.arc(x - m.r * 0.15, y - m.r * 0.15, m.r * 0.35 * glow + 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255,150,40,${0.8 * glow})`;
            ctx.fillRect(x + m.r * 0.2, y, 2, m.r * (1.2 + 2 * (1 - glow)));
        }
    },

    // Frost: a pale star-shaped crust with a glint.
    frost(ctx, m, x, y, age) {
        const h = (k) => ThemeKit.hash(m.seed + k);
        ctx.fillStyle = 'rgba(236,248,255,0.85)';
        ctx.strokeStyle = 'rgba(150,200,235,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * 6.283 + h(0);
            const rr = m.r * (i % 2 ? 0.45 : 1) * (0.8 + h(i + 1) * 0.4);
            const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.8;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(age * 4 + m.seed)})`;
        ctx.fillRect(x - 1, y - 1, 2, 2);
    },

    // A strand of kelp snagged on the car, swaying, with a bubble rising off it.
    kelp(ctx, m, x, y, age) {
        const sway = Math.sin(age * 3 + m.seed) * 2.5;
        ctx.strokeStyle = m.style.c1 || '#2f8a4a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + sway + 3, y + m.r * 0.8, x - sway - 3, y + m.r * 1.6, x + sway, y + m.r * 2.4);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = 'rgba(220,245,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + 5, y - ((age * 9) % 12), 1.6, 0, Math.PI * 2);
        ctx.stroke();
    },

    // Scratches and a small dent, e.g. micrometeor hits.
    scratch(ctx, m, x, y) {
        const h = (k) => ThemeKit.hash(m.seed + k);
        const a = h(0) * 3.14;
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
            const o = (i - 0.5) * 3;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * -m.r + o, y + Math.sin(a) * -m.r + o);
            ctx.lineTo(x + Math.cos(a) * m.r + o, y + Math.sin(a) * m.r + o);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,45,60,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, m.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
    },
};
