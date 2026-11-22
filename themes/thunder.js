// Thunder Prairie — GUSTS. A headwind slams the whole line every 7 seconds. The grass bends flat,
// dust and rain streak sideways and the sky darkens for 1.6 s before it hits; then for 2.2 s every
// train crawls at x0.72. Same clock for both trains, so tap early and ride it out. Rain-soaked
// streaks and soot from near lightning strikes build up on the cars.
const THUNDER_PERIOD = 7.0;
const THUNDER_WARN = 1.6;
const THUNDER_GUST = 2.2;
const THUNDER_SLOW = 0.28;     // speed lost at full gust

// Current wind: 0 calm .. 1 full gust (smooth through the telegraph and the tail), cached per frame.
function thunderWind(game) {
    const st = game.mechState, t = game.gameState.time;
    if (game._thunderW && game._thunderW.t === t && game._thunderW.st === st) return game._thunderW;
    const p = ThemeKit.pulse(t, THUNDER_PERIOD, THUNDER_WARN, THUNDER_GUST, st ? st.offset : 0);
    let w = 0, gust = 0;
    if (p.phase === 'warn') w = 0.2 + 0.45 * p.t;
    else if (p.phase === 'active') {
        gust = Math.min(p.t / 0.12, (1 - p.t) / 0.12, 1);
        w = 0.65 + 0.35 * Math.min(p.t * 6, 1);
        if (p.t > 0.8) w *= 1 - (p.t - 0.8) * 2.5;
    } else if (p.t < 0.15) w = 0.45 * (1 - p.t / 0.15);
    game._thunderW = { t, st, w: Math.max(0, Math.min(1, w)), gust, phase: p.phase, pt: p.t };
    return game._thunderW;
}

// Rain-soaked run-off streaks, or a soot scorch from a near strike.
ThemeKit.marks.thunder_wet = (ctx, m, x, y, age) => {
    const h = (k) => ThemeKit.hash(m.seed + k);
    if (h(0) > 0.9) {                                    // soot scorch: a starburst smudge (rare)
        ctx.fillStyle = 'rgba(20,18,24,0.45)';
        ctx.beginPath();
        ctx.ellipse(x, y, m.r * 1.5, m.r * 1.1, h(1) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(15,12,20,0.7)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * 6.283 + h(2), d = m.r * (1.2 + h(i + 4) * 1.2);
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * m.r * 0.4, y + Math.sin(a) * m.r * 0.4);
            ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
            ctx.stroke();
        }
        return;
    }
    // Rain run-off: dark wet streaks sliding down with a bright specular line.
    for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * 3.2 + h(i + 3) * 2, len = m.r * (1.8 + h(i + 6) * 1.6) + ((age * 0.8 + h(i)) % 1) * 4;
        ctx.fillStyle = 'rgba(40,60,85,0.4)';
        ctx.fillRect(x + dx, y - m.r * 0.5, 2.2, len);
        ctx.fillStyle = 'rgba(210,230,250,0.45)';
        ctx.fillRect(x + dx, y - m.r * 0.5, 0.8, len * 0.8);
        ctx.fillStyle = 'rgba(190,215,240,0.6)';
        ctx.beginPath();
        ctx.arc(x + dx + 1, y - m.r * 0.5 + len, 1.4, 0, Math.PI * 2);
        ctx.fill();
    }
};

// A sideways rain streak slammed by the wind.
ThemeKit.fx.thunder_rain = (ctx, p, x, y, k) => {
    ctx.globalAlpha = 0.75 * (1 - k);
    ctx.strokeStyle = 'rgba(205,225,245,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - p.vx * 2.4, y + p.vy * 2.4 + 1);
    ctx.stroke();
};

// A wisp of straw or grass ripped off by the gale, tumbling.
ThemeKit.fx.thunder_hay = (ctx, p, x, y, k) => {
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    ctx.translate(x, y);
    ctx.rotate(p.age * 9 * (ThemeKit.hash(p.seed) > 0.5 ? 1 : -1));
    ctx.strokeStyle = ThemeKit.hash(p.seed + 3) > 0.5 ? '#d8b94a' : '#a98c34';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-p.r * 1.6, 0);
    ctx.lineTo(p.r * 1.6, 0);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(p.r * 0.6, -1, 1.6, 2);
};

// One blade-bending tuft of prairie grass, leaning with the wind.
function thunderGrass(ctx, sx, by, hgt, blades, lean, seed, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < blades; i++) {
        const bx = sx + (i - blades / 2) * 3 + ThemeKit.hash(seed + i) * 2;
        const hh = hgt * (0.6 + 0.4 * ThemeKit.hash(seed + i + 9));
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + lean * hh * 0.35, by - hh * 0.6, bx + lean * hh, by - hh * (1 - Math.abs(lean) * 0.35));
    }
    ctx.stroke();
}

registerTheme({
    id: 'thunder',
    name: 'Thunder Prairie',
    hint: 'GUSTS: a headwind hits every 7 s. Watch the grass bend, then tap!',

    sky: [[0, '#171f2e'], [0.4, '#33445c'], [0.75, '#6d7f96'], [1, '#a9b6c2']],
    ground: [[0, '#7a8d3c'], [0.25, '#5f7330'], [1, '#33441c']],
    track: { tie: '#4a3b2a', rail: '#a8acb2' },

    // Towering anvil clouds with dark bellies and rain curtains; the sky blackens as a gust nears.
    drawSky(ctx, game, W, H) {
        const t = Date.now() / 1000, wind = thunderWind(game).w;
        for (let i = 0; i < 6; i++) {
            const speed = 6 + i * 2 + wind * 40;
            const cx = ((ThemeKit.hash(i + 2) * (W + 500) - game.cameraX * 0.05 - t * speed) % (W + 500) + W + 500) % (W + 500) - 250;
            const cy = 38 + (i % 3) * 30, sc = 0.85 + ThemeKit.hash(i + 9) * 0.7;
            ctx.fillStyle = '#2b3547';                       // dark underside
            ctx.beginPath();
            ctx.ellipse(cx, cy + 22 * sc, 150 * sc, 22 * sc, 0, 0, Math.PI * 2);
            ctx.fill();
            for (const [dx, dy, r, col] of [[-70, 0, 44, '#46566e'], [-20, -14, 56, '#52637c'], [38, -6, 50, '#4a5b74'], [86, 6, 38, '#415169'], [10, -34, 36, '#6a7b93']]) {
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(cx + dx * sc, cy + dy * sc, r * sc, 0, Math.PI * 2);
                ctx.fill();
            }
            if (i % 2 === 0) {                               // rain curtain
                const sh = ctx.createLinearGradient(0, cy + 20, 0, HORIZON_Y);
                sh.addColorStop(0, 'rgba(120,140,165,0.34)');
                sh.addColorStop(1, 'rgba(120,140,165,0.02)');
                ctx.fillStyle = sh;
                ctx.beginPath();
                ctx.moveTo(cx - 90 * sc, cy + 24 * sc);
                ctx.lineTo(cx + 90 * sc, cy + 24 * sc);
                ctx.lineTo(cx + 60 * sc - wind * 40, HORIZON_Y);
                ctx.lineTo(cx - 120 * sc - wind * 40, HORIZON_Y);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.fillStyle = `rgba(8,12,24,${0.38 * wind})`;
        ctx.fillRect(0, 0, W, HORIZON_Y + 30);
    },

    // Wheat-gold prairie dotted with wind-bent grass.
    drawGround(ctx, game, W, H) {
        const v = ThemeKit.visible(game, 60), t = Date.now() / 1000, wind = thunderWind(game).w;
        const cell = 90;
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            const h = ThemeKit.hash(c * 7 + 5);
            if (h < 0.3) continue;
            const x = c * cell + h * 60;
            const y = HORIZON_Y + 14 + ThemeKit.hash(c) * 150 - game.getElevation(x) * 0;
            const lean = -(0.08 + wind * 0.55) + Math.sin(t * 1.6 + c) * 0.06;
            thunderGrass(ctx, ThemeKit.sx(game, x), y, 12 + h * 10, 4, lean, c * 3, h > 0.6 ? '#b9a64a' : '#8aa044');
        }
    },

    terrain(finishX) {
        const hills = makeSaharaHills(finishX, 0.85);
        return {
            elevation: (x) => getBumpElevation(x, hills),
            slope: (x) => getBumpSlope(x, hills),
            ampMax: Math.max(...hills.map(h => h.amp)),
        };
    },

    layers: {
        // Far: hazy blue ridgelines with a storm cell on one.
        mountains: {
            spawn(x) {
                return { x, w: 200 + Math.random() * 260, h: 30 + Math.random() * 50, hue: 205 + Math.random() * 20 };
            },
            draw(ctx, obj, sx) {
                const base = HORIZON_Y;
                ctx.fillStyle = `hsl(${obj.hue},22%,40%)`;
                ctx.beginPath();
                ctx.moveTo(sx, base);
                ctx.bezierCurveTo(sx + obj.w * 0.25, base - obj.h * 1.3, sx + obj.w * 0.7, base - obj.h * 1.1, sx + obj.w, base);
                ctx.closePath();
                ctx.fill();
                const haze = ctx.createLinearGradient(0, base - obj.h, 0, base);
                haze.addColorStop(0, 'rgba(170,185,205,0)');
                haze.addColorStop(1, 'rgba(170,185,205,0.55)');
                ctx.fillStyle = haze;
                ctx.fillRect(sx, base - obj.h, obj.w, obj.h);
            },
        },
        // Mid: windmills whose blades spin with the gale, lone oaks, water towers.
        trees: {
            spawn(x) {
                const r = Math.random();
                return { x, type: r < 0.28 ? 'mill' : r < 0.72 ? 'oak' : 'tower', h: 56 + Math.random() * 40, seed: Math.random() * 100 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev, wind = thunderWind(game).w, t = Date.now() / 1000;
                if (obj.type === 'mill') {
                    const top = by - obj.h;
                    ctx.strokeStyle = '#5a4a38';
                    ctx.lineWidth = 3;
                    ctx.beginPath();                          // lattice legs + cross braces
                    ctx.moveTo(sx - 9, by + 2); ctx.lineTo(sx - 2, top);
                    ctx.moveTo(sx + 9, by + 2); ctx.lineTo(sx + 2, top);
                    ctx.stroke();
                    ctx.lineWidth = 1.4;
                    ctx.beginPath();
                    for (let i = 1; i < 4; i++) {
                        const y = by - (obj.h * i) / 4;
                        ctx.moveTo(sx - 8 + i * 1.6, y); ctx.lineTo(sx + 8 - i * 1.6, y - 8);
                        ctx.moveTo(sx + 8 - i * 1.6, y); ctx.lineTo(sx - 8 + i * 1.6, y - 8);
                    }
                    ctx.stroke();
                    const ang = t * (0.8 + wind * 7) + obj.seed;
                    ctx.fillStyle = '#d9d2c3';
                    for (let b = 0; b < 8; b++) {
                        const a = ang + (b * Math.PI) / 4;
                        ctx.beginPath();
                        ctx.moveTo(sx, top);
                        ctx.lineTo(sx + Math.cos(a - 0.12) * 24, top + Math.sin(a - 0.12) * 24);
                        ctx.lineTo(sx + Math.cos(a + 0.12) * 24, top + Math.sin(a + 0.12) * 24);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.fillStyle = '#7a3b2a';                // tail fin + hub
                    ctx.fillRect(sx + 3, top - 2, 16, 5);
                    ctx.beginPath();
                    ctx.arc(sx, top, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                } else if (obj.type === 'oak') {
                    const lean = -(0.05 + wind * 0.22);
                    ctx.fillStyle = '#4b3a2a';
                    ctx.beginPath();
                    ctx.moveTo(sx - 5, by + 3);
                    ctx.quadraticCurveTo(sx - 2 + lean * 40, by - obj.h * 0.5, sx + lean * 60 - 2, by - obj.h * 0.8);
                    ctx.lineTo(sx + lean * 60 + 2, by - obj.h * 0.8);
                    ctx.quadraticCurveTo(sx + 2 + lean * 40, by - obj.h * 0.5, sx + 5, by + 3);
                    ctx.closePath();
                    ctx.fill();
                    const cx = sx + lean * 60, cy = by - obj.h * 0.85;
                    for (const [dx, dy, r, col] of [[-16, 6, 16, '#3f5a2a'], [14, 4, 17, '#486632'], [0, -8, 20, '#52703a'], [-4, 12, 14, '#364f24']]) {
                        ctx.fillStyle = col;
                        ctx.beginPath();
                        ctx.arc(cx + dx + lean * 14, cy + dy, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else {
                    const top = by - obj.h;                  // wooden water tower
                    ctx.fillStyle = '#4a3b2c';
                    for (const dx of [-10, 10]) ctx.fillRect(sx + dx - 1.5, top + 22, 3, obj.h - 20);
                    ctx.fillRect(sx - 11, top + 34, 22, 2.5);
                    ctx.fillStyle = '#6b5640';
                    ctx.fillRect(sx - 14, top + 4, 28, 20);
                    ctx.fillStyle = '#4a3b2c';
                    ctx.beginPath();
                    ctx.moveTo(sx - 16, top + 5);
                    ctx.lineTo(sx, top - 8);
                    ctx.lineTo(sx + 16, top + 5);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(sx, top + 4, 14, 20);
                }
            },
        },
        // Near: tall bending grass, fence posts and round hay bales.
        rocks: {
            spawn(x) {
                const r = Math.random();
                return { x, type: r < 0.5 ? 'grass' : r < 0.78 ? 'fence' : 'bale', s: 0.8 + Math.random() * 0.6, seed: Math.random() * 100 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev, wind = thunderWind(game).w, t = Date.now() / 1000;
                const lean = -(0.07 + wind * 0.62) + Math.sin(t * 2.1 + obj.seed) * 0.07;
                if (obj.type === 'grass') {
                    thunderGrass(ctx, sx, by, 34 * obj.s, 7, lean, obj.seed, '#7f9a3e');
                    thunderGrass(ctx, sx + 8, by + 1, 26 * obj.s, 5, lean * 0.9, obj.seed + 40, '#a8b856');
                } else if (obj.type === 'fence') {
                    ctx.fillStyle = '#6b5640';
                    for (let i = 0; i < 4; i++) ctx.fillRect(sx + i * 18 * obj.s, by - 22 * obj.s, 3, 24 * obj.s);
                    ctx.strokeStyle = '#2d2a28';
                    ctx.lineWidth = 1;
                    for (const f of [0.35, 0.7]) {            // sagging wire, rattling in the wind
                        ctx.beginPath();
                        ctx.moveTo(sx, by - 22 * obj.s * f);
                        ctx.quadraticCurveTo(sx + 27 * obj.s, by - 22 * obj.s * f + 4 + wind * Math.sin(t * 22) * 2, sx + 54 * obj.s, by - 22 * obj.s * f);
                        ctx.stroke();
                    }
                } else {
                    const r = 12 * obj.s;
                    ctx.fillStyle = '#d2b659';
                    ctx.beginPath();
                    ctx.arc(sx + r, by - r + 2, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#9c8231';
                    ctx.lineWidth = 1.4;
                    for (const k of [0.35, 0.65]) {
                        ctx.beginPath();
                        ctx.arc(sx + r, by - r + 2, r * k, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            },
        },
    },

    // Rain, wind-driven dust sheets, and the lightning itself.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000, wind = thunderWind(game).w;
        ctx.lineCap = 'round';
        // Rain: light always, slanting harder (and denser) as the gale builds.
        const n = Math.floor(70 + wind * 90);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(200,220,240,${0.3 + 0.25 * wind})`;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const slant = 5 + wind * 26;
            const x = ((ThemeKit.hash(i) * (W + 200) - game.cameraX * 0.8 - t * (140 + wind * 520)) % (W + 200) + W + 200) % (W + 200) - 60;
            const y = ((ThemeKit.hash(i + 17) * H + t * (440 + wind * 260)) % H + H) % H;
            ctx.moveTo(x, y);
            ctx.lineTo(x - slant, y + 16);
        }
        ctx.stroke();
        // Dust sheets raked across the ground during the gale.
        if (wind > 0.2) {
            for (let i = 0; i < 9; i++) {
                const y = HORIZON_Y + 16 + ThemeKit.hash(i + 50) * 150;
                const x = ((ThemeKit.hash(i + 60) * (W + 400) - t * (260 + ThemeKit.hash(i) * 200)) % (W + 400) + W + 400) % (W + 400) - 200;
                const grad = ctx.createLinearGradient(x - 160, 0, x + 40, 0);
                grad.addColorStop(0, 'rgba(190,170,120,0)');
                grad.addColorStop(1, `rgba(190,170,120,${0.22 * wind})`);
                ctx.fillStyle = grad;
                ctx.fillRect(x - 160, y, 200, 3 + ThemeKit.hash(i + 70) * 4);
            }
        }
        ctx.lineCap = 'butt';
        // Lightning: a forked bolt and a double-flash every ~5 s, deterministic from the clock.
        const cycle = Math.floor(t / 5.3), s = t - cycle * 5.3;
        if (s < 0.55) {
            const bx = (0.12 + 0.76 * ThemeKit.hash(cycle * 3.3)) * W;
            const flash = s < 0.09 ? 1 - s / 0.09 : s > 0.17 && s < 0.3 ? 0.7 * (1 - (s - 0.17) / 0.13) : 0;
            if (flash > 0) {
                ctx.fillStyle = `rgba(225,235,255,${0.34 * flash})`;
                ctx.fillRect(0, 0, W, H);
                ctx.strokeStyle = `rgba(255,255,255,${flash})`;
                ctx.lineWidth = 3;
                ctx.beginPath();
                let x = bx, y = 0;
                ctx.moveTo(x, y);
                for (let i = 0; i < 8; i++) {
                    x += (ThemeKit.hash(cycle + i * 1.7) - 0.5) * 46;
                    y += (HORIZON_Y + 6) / 8;
                    ctx.lineTo(x, y);
                    if (i === 3) {                           // a fork
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + 34, y + 38);
                        ctx.moveTo(x, y);
                    }
                }
                ctx.stroke();
                ctx.strokeStyle = `rgba(170,200,255,${0.5 * flash})`;
                ctx.lineWidth = 8;
                ctx.stroke();
            }
        }
    },

    mechanic: {
        marks: { kind: 'thunder_wet', trigger: 'penalty', rate: 0.16, r: [3, 7], y: [8, 44], life: 32, perPart: 9 },
        fx: [
            { kind: 'thunder_rain', trigger: 'penalty', rate: 1.5, at: 'body', r: [1, 2], vx: [-7, -3.5], vy: [-0.6, 0.8], g: 0, life: [0.22, 0.45], inherit: 0.25 },
            { kind: 'thunder_hay', trigger: 'penalty', rate: 0.45, at: 'body', r: [1.5, 2.5], vx: [-5, -2], vy: [0.4, 2.2], g: 0.05, life: [0.7, 1.3], inherit: 0.3 },
        ],

        init() {
            return { offset: Math.random() * THUNDER_PERIOD };
        },

        // A headwind gust across the whole line: x0.72 at full strength, eased over its edges.
        speedMult(state, x, t) {
            const p = ThemeKit.pulse(t, THUNDER_PERIOD, THUNDER_WARN, THUNDER_GUST, state.offset);
            if (p.phase !== 'active') return 1;
            return 1 - THUNDER_SLOW * Math.min(p.t / 0.12, (1 - p.t) / 0.12, 1);
        },

        // Gale-driven dust and grass shards whipping across the trains; strongest at full gust.
        drawZones(ctx, state, game, pass) {
            if (pass !== 'over') return;
            const wind = thunderWind(game).w;
            if (wind < 0.25) return;
            const t = Date.now() / 1000, W = game.canvas.width;
            ctx.lineCap = 'round';
            for (let i = 0; i < 16; i++) {
                const y = TRACK_BACK - 40 + ThemeKit.hash(i + 33) * 124;
                const sp = 520 + ThemeKit.hash(i + 11) * 420;
                const x = ((ThemeKit.hash(i + 5) * (W + 300) - t * sp) % (W + 300) + W + 300) % (W + 300) - 150;
                const len = 30 + ThemeKit.hash(i + 21) * 60;
                const grad = ctx.createLinearGradient(x, 0, x + len, 0);
                grad.addColorStop(0, `rgba(215,225,235,${0.55 * wind})`);
                grad.addColorStop(1, 'rgba(215,225,235,0)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.2 + ThemeKit.hash(i + 2) * 1.6;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + len, y + 3);
                ctx.stroke();
            }
            ctx.lineCap = 'butt';
        },

        minimapMarks() { return []; },
    },
});
