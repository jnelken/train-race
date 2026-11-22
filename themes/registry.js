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
