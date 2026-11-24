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
//   terrain(finishX)      optional: { elevation(x), slope(x), ampMax } with elevation >= 0.
//                         `return hillTerrain(finishX, { maxHeight, rolliness })` builds one from the shared
//                         curvature-limited hill generator: maxHeight is the tallest hill in px and
//                         rolliness 0..1 runs from flat plains with hills interspersed (0) to hills taking up
//                         the whole course with no plains (1). Bends are never tighter than HILL_MIN_RADIUS.
//   slopeGain             optional: hill speed gain for this level (default 1.2; 0 turns the hill speed effect off)
//   flatTrack             optional: true keeps rails, ground and platforms flat while trains still ride `terrain`
//                         (Haunted: a ghost lifts the trains off the rails)
//   speedScale            optional: multiplies every train's ground speed (Warp Lane uses 2)
//   lengthScale           optional: stretches the course (Warp Lane uses 2 so a race takes as long)
//   layers.{mountains,trees,rocks}   { spawn(x, game) -> obj, draw(ctx, obj, sx, game, elev) }
//   drawFx(ctx, game, W, H)         optional: weather/particles in screen space, over everything
//   mechanic              optional, see below
//
// A mechanic changes how the level plays. It must hit BOTH trains through the same
// functions, be visible before you reach it, and be playable with boost taps alone:
//   physics   { inertia, boostMs, boostPer }   inertia < 1 = sluggish accel/decel;
//                                               boostMs = tap lifetime; boostPer = +speed per tap
//   init(game)                               -> per-race state (zones etc.)
//   speedMult(state, x, t, game, who)        -> multiplier on displacement at the car's nose x
//                                               (t = race seconds; who = 'player' | 'opponent').
//                                               < 1 is a penalty that active boost taps partly
//                                               relieve for the player; > 1 is a bonus (turbo).
//   update(state, game, dt)                  optional: runs every racing frame (pickups, timers)
//   drawZones(ctx, state, game, pass)        pass is 'ground' (under trains) or 'over'
//   minimapMarks(state, game)                -> [{ x0, x1, color }] static zones for the minimap
//   fx                                       spec | [spec, ...] hazard particles on the trains
//                                               (spray, sparks, bubbles; see updateFx in game.js)
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

    // A phase (position, angle) that advances at a rate which may change over time. NEVER write
    // `Date.now() / 1000 * rate` when `rate` varies: that clock is ~1.8e9, so a rate change of 0.001
    // shifts the result by millions and the animation scrambles. This integrates rate * dt instead.
    // `key` names the phase (one per thing that moves independently); calling it again in the same
    // frame returns the same value. Drive drifting clouds, spinning blades, rain streaks with it.
    phase(game, key, rate) {
        const now = Date.now() / 1000, all = game._phases || (game._phases = {});
        const p = all[key] || (all[key] = { v: 0, last: now });
        p.v += rate * Math.min(0.1, Math.max(0, now - p.last));
        p.last = now;
        return p.v;
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

    // Call cb(who, train, part, cx) for the locomotive (part 0) and every cart of both
    // trains. cx is the car's NOSE (front end) in the coordinates ThemeKit.sx() draws, the same
    // x speedMult() receives; the car's centre is cx - TRAIN_WIDTH / 2. Points on a car come from
    // TRAIN_RIG (sprites.js): left edge = cx - TRAIN_WIDTH, wheels at left + TRAIN_RIG.wheelX[i].
    // Never hard-code pixels, so train art can be swapped.
    eachCar(game, cb) {
        for (const who of ['player', 'opponent']) {
            const train = who === 'player' ? game.train : game.opponent;
            for (let part = 0; part <= CART_COUNT; part++) {
                let cx;
                if (part === 0) cx = train.worldX + TRAIN_WIDTH / 2;
                else {
                    const cart = train.carts[part - 1];
                    if (!cart || cart.centerX === 0) continue;
                    cx = cart.centerX;
                }
                cb(who, train, part, cx);
            }
        }
    },

    // Ground y of a train's rail contact at world x (matches how the trains are drawn).
    railY(game, who, x) {
        return (who === 'opponent' ? TRACK_BACK : TRACK_FRONT) - game.getElevation(x);
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

// ── Hazard particle renderers ──────────────────────────────────────────────
// A level's mechanic.fx spawns these (see updateFx in game.js). Each draws one particle at
// (x, y) on screen; p.r is its size, k is 0..1 through its life, p.landed marks a splat on
// the ground (p.age - p.landedAt seconds ago). Add a kind here and name it in mechanic.fx.
ThemeKit.fx = {
    // Flung mud: a dark clod that flattens into a splat where it lands.
    mud(ctx, p, x, y, k) {
        if (p.landed) {
            ctx.globalAlpha = Math.max(0, 1 - (p.age - p.landedAt) / 0.45) * 0.85;
            ctx.fillStyle = '#5b3d22';
            ctx.beginPath();
            ctx.ellipse(x, y + 1, p.r * 1.7, p.r * 0.55, 0, 0, Math.PI * 2);
            ctx.fill();
            return;
        }
        ctx.fillStyle = ThemeKit.hash(p.seed) > 0.5 ? '#5b3d22' : '#7a5632';
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,230,190,0.3)';
        ctx.fillRect(x - p.r * 0.4, y - p.r * 0.55, p.r * 0.5, 1.2);
    },

    // Twinkling ice shard.
    ice(ctx, p, x, y, k) {
        ctx.globalAlpha = (1 - k) * (0.55 + 0.45 * Math.sin(p.age * 30 + p.seed));
        ctx.fillStyle = ThemeKit.hash(p.seed) > 0.5 ? '#f4fbff' : '#bfe6ff';
        ctx.beginPath();
        ctx.moveTo(x, y - p.r);
        ctx.lineTo(x + p.r * 0.6, y);
        ctx.lineTo(x, y + p.r);
        ctx.lineTo(x - p.r * 0.6, y);
        ctx.closePath();
        ctx.fill();
    },

    // Soft puff of powder / spray that swells and fades.
    powder(ctx, p, x, y, k) {
        ctx.globalAlpha = 0.38 * (1 - k);
        ctx.fillStyle = p.style.color || '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, p.r * (1 + k * 2.2), 0, Math.PI * 2);
        ctx.fill();
    },

    // Hot spark with a short tail along its velocity.
    ember(ctx, p, x, y, k) {
        ctx.globalAlpha = 1 - k * 0.8;
        ctx.strokeStyle = k < 0.45 ? '#ffd36a' : '#ff7a1a';
        ctx.lineWidth = Math.max(1.2, p.r * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 1.6, y + p.vy * 1.6);
        ctx.stroke();
    },

    // Rising bubble that wobbles as it goes.
    bubble(ctx, p, x, y, k) {
        ctx.globalAlpha = 1 - k * k;
        const bx = x + Math.sin(p.age * 6 + p.seed) * 1.6;
        ctx.strokeStyle = 'rgba(225,248,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(bx - p.r * 0.45, y - p.r * 0.5, 1.5, 1.5);
    },

    // Loose bits drifting weightlessly: bolts, sparkles and chips, tumbling slowly.
    float(ctx, p, x, y, k) {
        const h = (i) => ThemeKit.hash(p.seed + i);
        ctx.globalAlpha = Math.min(1, (1 - k) * 3, k * 8);
        ctx.translate(x, y);
        ctx.rotate(p.age * (1 + h(1) * 2.5) * (h(2) > 0.5 ? 1 : -1));
        const v = Math.floor(h(3) * 3);
        if (v === 0) {                       // bolt
            ctx.fillStyle = '#b9c2da';
            ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
            ctx.fillStyle = '#6f7a99';
            ctx.fillRect(p.r * 0.4, -p.r * 0.45, p.r * 0.6, p.r * 0.9);
        } else if (v === 1) {                // sparkle
            ctx.fillStyle = '#e8f0ff';
            ctx.fillRect(-p.r, -0.6, p.r * 2, 1.2);
            ctx.fillRect(-0.6, -p.r, 1.2, p.r * 2);
        } else {                             // panel chip
            ctx.fillStyle = '#8a93ad';
            ctx.fillRect(-p.r * 0.8, -p.r * 0.6, p.r * 1.6, p.r * 1.2);
        }
    },

    // Rolling smoke puff.
    smoke(ctx, p, x, y, k) {
        ctx.globalAlpha = 0.4 * (1 - k);
        ctx.fillStyle = p.style.color || '#463c3e';
        ctx.beginPath();
        ctx.arc(x, y, p.r * (1 + k * 1.8), 0, Math.PI * 2);
        ctx.fill();
    },
};
