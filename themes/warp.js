// Warp Lane — WARP DRIVE: the whole world runs at double speed (and the course is twice as long, so
// a race still takes about as long as any other). Turbo cells hang over the line; only whoever is in
// front when the cells arrive can grab them, so the leader snowballs. Take the lead early, then
// keep it with boost taps.
//
//   def.speedScale 2   every train's ground speed x2 (game.js speedScale())
//   def.lengthScale 2  the course is x2 as long (game.js applyRaceLength())
//   mechanic.update    collects the cells for the leader each frame
//   mechanic.speedMult turbo for the train named by its 5th argument ('player' | 'opponent')
// Tuning knobs (also reachable as THEME mechanic.tune for quick experiments).
const WARP = {
    boost: 0.3,       // +% ground speed at full turbo
    seconds: 2,       // turbo time each cell gives
    cap: 5,           // most turbo time that can be banked at once
    rampUp: 0.25,     // seconds to reach full turbo
    rampDown: 0.6,    // seconds to ease back to cruise
    first: 4200,      // first cell; keeps the start pull-out clear
    lastMargin: 3600, // last cell this far before the finish line
    spacing: 2700,    // about one cell every 5 s at cruise
};

// 0..1 turbo strength for one train at race time t (eased in and out).
function warpTurbo(state, who, t) {
    const b = state && state.turbo && state.turbo[who];
    if (!b || t >= b.until) return 0;
    const s = Math.min(1, (t - b.start) / WARP.rampUp, (b.until - t) / WARP.rampDown);
    return s * s * (3 - 2 * s);
}

function warpLeader(game) {
    return game.train.worldX >= game.opponent.worldX ? 'player' : 'opponent';
}

// Height of the cells: above both roofs, bobbing gently.
function warpCellY(game, x, i, t) {
    return TRACK_BACK - TRAIN_HEIGHT - 46 - game.getElevation(x) + Math.sin(t * 2.4 + i) * 3;
}

function warpHex(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
        const a = rot + (k / 6) * Math.PI * 2;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
}

// One turbo cell: a spinning hex with a bolt, or a padlocked grey one while the rival leads.
function warpDrawCell(ctx, game, c, i, unlocked, caption) {
    const sx = ThemeKit.sx(game, c.x);
    if (sx < -50 || sx > game.canvas.width + 50) return;
    const t = Date.now() / 1000;
    const cy = warpCellY(game, c.x, i, t);
    const glow = ctx.createRadialGradient(sx, cy, 2, sx, cy, 34);
    if (unlocked) {
        glow.addColorStop(0, 'rgba(120,240,255,0.55)');
        glow.addColorStop(1, 'rgba(120,240,255,0)');
    } else {
        glow.addColorStop(0, 'rgba(255,80,150,0.28)');
        glow.addColorStop(1, 'rgba(255,80,150,0)');
    }
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 36, cy - 36, 72, 72);
    // orbiting ring
    ctx.strokeStyle = unlocked ? 'rgba(160,250,255,0.75)' : 'rgba(210,120,170,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sx, cy, 20, 6 + Math.abs(Math.sin(t * 1.5 + i)) * 8, t * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    // hex body
    warpHex(ctx, sx, cy, 13, t * 0.8);
    const body = ctx.createLinearGradient(sx, cy - 13, sx, cy + 13);
    if (unlocked) { body.addColorStop(0, '#d9fdff'); body.addColorStop(1, '#2fc9f2'); }
    else { body.addColorStop(0, '#3a3258'); body.addColorStop(1, '#1d1832'); }
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = unlocked ? '#ffffff' : '#7a6aa8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (unlocked) {                                       // lightning bolt
        ctx.fillStyle = '#0b3a66';
        ctx.beginPath();
        ctx.moveTo(sx + 2, cy - 8); ctx.lineTo(sx - 4, cy + 1); ctx.lineTo(sx, cy + 1);
        ctx.lineTo(sx - 2, cy + 8); ctx.lineTo(sx + 4, cy - 2); ctx.lineTo(sx, cy - 2);
        ctx.closePath();
        ctx.fill();
    } else {                                              // padlock
        ctx.fillStyle = '#c9b8f0';
        ctx.fillRect(sx - 4.5, cy - 1, 9, 7);
        ctx.strokeStyle = '#c9b8f0';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sx, cy - 1, 3.2, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#1d1832';
        ctx.fillRect(sx - 0.8, cy + 1.5, 1.6, 2.5);
    }
    // sparkles orbiting the cell
    if (unlocked) {
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 3; k++) {
            const a = t * 2.2 + (k / 3) * Math.PI * 2 + i;
            ctx.fillRect(sx + Math.cos(a) * 19 - 1, cy + Math.sin(a) * 11 - 1, 2, 2);
        }
    }
    if (caption) {
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = unlocked ? 'rgba(190,252,255,0.95)' : 'rgba(255,150,190,0.95)';
        ctx.fillText(unlocked ? 'TURBO' : 'LEADER ONLY', sx, cy + 29);
        ctx.textAlign = 'left';
    }
}

// The landing pad under a cell, drawn under the trains: a glowing strip across both rails, a beam
// up to the cell and chevrons running the way you travel.
function warpDrawPad(ctx, game, c, unlocked) {
    const sx = ThemeKit.sx(game, c.x);
    if (sx < -60 || sx > game.canvas.width + 60) return;
    const t = Date.now() / 1000;
    ThemeKit.laneStrip(ctx, game, c.x - 46, c.x + 46, unlocked ? 'rgba(70,225,255,0.20)' : 'rgba(255,80,150,0.11)', 6);
    const y0 = warpCellY(game, c.x, 0, t) + 14, y1 = TRACK_FRONT + 6 - game.getElevation(c.x);
    const beam = ctx.createLinearGradient(0, y0, 0, y1);
    beam.addColorStop(0, unlocked ? 'rgba(120,240,255,0.38)' : 'rgba(255,100,160,0.18)');
    beam.addColorStop(1, 'rgba(120,240,255,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(sx - 3, y0, 6, y1 - y0);
    ctx.strokeStyle = unlocked ? 'rgba(200,252,255,0.8)' : 'rgba(255,150,190,0.4)';
    ctx.lineWidth = 1.6;
    for (const base of [TRACK_BACK + 10, TRACK_FRONT + 10]) {
        for (let k = 0; k < 3; k++) {
            const x = sx - 30 + ((t * 70 + k * 22) % 66);
            const y = base - game.getElevation(c.x);
            ctx.beginPath();
            ctx.moveTo(x - 4, y - 4); ctx.lineTo(x, y); ctx.lineTo(x - 4, y + 4);
            ctx.stroke();
        }
    }
}

// Cell collected: a shock ring, the cell zipping into the leader's locomotive, and a callout.
function warpDrawBursts(ctx, game, state) {
    const t = game.gameState.time;
    for (const b of state.bursts) {
        const age = t - b.t0;
        if (age < 0 || age > 1.4) continue;
        const cx = ThemeKit.sx(game, b.x);
        const cy = warpCellY(game, b.x, 0, Date.now() / 1000);
        const mine = b.who === 'player';
        if (age < 0.6) {
            ctx.strokeStyle = `rgba(${mine ? '150,250,255' : '255,130,190'},${0.85 * (1 - age / 0.6)})`;
            ctx.lineWidth = 3 * (1 - age / 0.6) + 1;
            ctx.beginPath();
            ctx.arc(cx, cy, 10 + age * 110, 0, Math.PI * 2);
            ctx.stroke();
        }
        const train = mine ? game.train : game.opponent;
        const tx = ThemeKit.sx(game, train.worldX);
        const ty = ThemeKit.railY(game, b.who, train.worldX) - TRAIN_HEIGHT * 0.6;
        if (age < 0.4) {
            const p = age / 0.4, e = p * p * (3 - 2 * p);
            ctx.fillStyle = mine ? '#d9fdff' : '#ffc2de';
            ctx.beginPath();
            ctx.arc(cx + (tx - cx) * e, cy + (ty - cy) * e, 6 * (1 - 0.5 * e), 0, Math.PI * 2);
            ctx.fill();
        }
        if (age > 0.3) {
            const q = (age - 0.3) / 1.1;
            ctx.globalAlpha = Math.max(0, 1 - q);
            ctx.font = 'bold 13px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = mine ? '#bff9ff' : '#ffb0d2';
            ctx.fillText(mine ? 'TURBO!' : 'RIVAL TURBO', tx, ty - TRAIN_HEIGHT * 0.5 - 6 - q * 26);
            ctx.textAlign = 'left';
            ctx.globalAlpha = 1;
        }
    }
}

// Plasma scorch left on a car by turbo: a dark carbon streak with a cyan core that cools over m.hot s.
ThemeKit.marks.warp_scorch = function (ctx, m, x, y, age) {
    const h = (k) => ThemeKit.hash(m.seed + k);
    const glow = Math.max(0, Math.min(1, 1 - age / Math.max(m.hot, 0.01)));
    ctx.fillStyle = 'rgba(8,12,30,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, m.r * 2.4, m.r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0e22';
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - m.r * 2.2 + h(i) * m.r, y - m.r * 0.6 + i * m.r * 0.5, m.r * (1.6 + h(i + 4) * 1.4), 1.3);
    }
    ctx.fillStyle = `rgba(70,200,240,${0.12 + 0.12 * (1 - glow)})`;    // cooled residue stays faintly teal
    ctx.fillRect(x - m.r * 2.2, y + m.r * 0.5, m.r * 3.4, 1);
    if (glow > 0) {
        ctx.fillStyle = `rgba(110,240,255,${0.25 + 0.6 * glow})`;
        ctx.beginPath();
        ctx.ellipse(x - m.r * 0.3, y, m.r * (1.2 + 0.7 * glow), m.r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.9 * glow})`;
        ctx.fillRect(x - m.r * 0.9, y - 0.8, m.r * 1.4, 1.6);
    }
};

// Ion streak torn off a turbo car: bright head, fading tail pointing back along the line.
ThemeKit.fx.warp_ion = function (ctx, p, x, y, k) {
    const len = 16 + p.r * 9;
    const g = ctx.createLinearGradient(x, 0, x + len, 0);
    g.addColorStop(0, `rgba(${ThemeKit.hash(p.seed) > 0.7 ? '255,255,255' : '120,240,255'},${0.95 * (1 - k)})`);
    g.addColorStop(1, 'rgba(60,160,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.2, p.r);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
};

// Tiny warp motes whipping past the cars all the time.
ThemeKit.fx.warp_mote = function (ctx, p, x, y, k) {
    ctx.globalAlpha = 0.8 * (1 - k);
    ctx.fillStyle = ThemeKit.hash(p.seed) > 0.8 ? '#ffd0f0' : '#bff6ff';
    ctx.fillRect(x, y, 6 + p.r * 5, Math.max(1, p.r * 0.7));
};

registerTheme({
    id: 'warp',
    name: 'Warp Lane',
    hint: 'WARP DRIVE: double speed! Only the leader can grab turbo cells.',
    speedScale: 2,
    lengthScale: 2,

    sky: [[0, '#050b24'], [0.5, '#0b2a5e'], [0.85, '#1a74a6'], [1, '#79e0ff']],

    // Star streaks, aurora ribbons and a huge distant warp gate.
    drawSky(ctx, game, W, H) {
        const t = Date.now() / 1000;
        for (let i = 0; i < 3; i++) {                        // aurora ribbons
            const y0 = 40 + i * 34;
            const grad = ctx.createLinearGradient(0, y0 - 24, 0, y0 + 40);
            const hue = [175, 205, 290][i];
            grad.addColorStop(0, `hsla(${hue},90%,62%,0)`);
            grad.addColorStop(0.4, `hsla(${hue},90%,62%,0.20)`);
            grad.addColorStop(1, `hsla(${hue},90%,62%,0)`);
            ctx.fillStyle = grad;
            ctx.beginPath();
            const yAt = (x) => y0 + Math.sin((x + game.cameraX * 0.05) * 0.011 + t * 0.6 + i * 2.3) * 12;
            ctx.moveTo(0, yAt(0) - 24);
            for (let x = 0; x <= W; x += 14) ctx.lineTo(x, yAt(x) - 24);
            for (let x = W; x >= 0; x -= 14) ctx.lineTo(x, yAt(x) + 40);
            ctx.closePath();
            ctx.fill();
        }
        // The gate: two nested glowing rings with a bright core.
        const gx = ((W * 0.62 - game.cameraX * 0.02) % (W + 300) + W + 300) % (W + 300) - 150, gy = 96;
        const core = ctx.createRadialGradient(gx, gy, 4, gx, gy, 70);
        core.addColorStop(0, 'rgba(255,255,255,0.5)');
        core.addColorStop(0.45, 'rgba(120,240,255,0.18)');
        core.addColorStop(1, 'rgba(120,240,255,0)');
        ctx.fillStyle = core;
        ctx.fillRect(gx - 80, gy - 80, 160, 160);
        for (const [rx, ry, a] of [[54, 54, 0.8], [38, 38, 0.55]]) {
            ctx.strokeStyle = `rgba(150,250,255,${a})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(gx, gy, rx, ry * (0.92 + 0.08 * Math.sin(t * 2)), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Stars, stretched into streaks by the speed.
        const stretch = 3 + Math.min(Math.abs(game.train.vx) * 2, 14) * 1.6;
        ctx.lineWidth = 1;
        for (let i = 0; i < 70; i++) {
            const par = 0.05 + ThemeKit.hash(i + 200) * 0.22;
            const x = ((ThemeKit.hash(i) * (W + 120) - game.cameraX * par) % (W + 120) + W + 120) % (W + 120) - 60;
            const y = ThemeKit.hash(i + 50) * (HORIZON_Y - 6);
            ctx.strokeStyle = `rgba(230,245,255,${0.25 + 0.5 * Math.abs(Math.sin(t * (0.6 + ThemeKit.hash(i + 9)) + i))})`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + stretch * (0.4 + par * 3), y);
            ctx.stroke();
        }
    },

    ground: [[0, '#10204a'], [0.22, '#0a1534'], [1, '#050a1c']],
    track: { tie: '#26406a', rail: '#8ff0ff' },

    // Glowing guide rails with racing lane dashes: a fast, flat plain.
    drawGround(ctx, game, W, H) {
        const v = ThemeKit.visible(game, 80);
        const t = Date.now() / 1000;
        const horizon = ctx.createLinearGradient(0, HORIZON_Y, 0, HORIZON_Y + 30);
        horizon.addColorStop(0, 'rgba(100,235,255,0.38)');
        horizon.addColorStop(1, 'rgba(100,235,255,0)');
        ctx.fillStyle = horizon;
        ctx.fillRect(0, HORIZON_Y, W, 30);
        ctx.strokeStyle = 'rgba(90,210,255,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const y of [HORIZON_Y + 16, HORIZON_Y + 36, HORIZON_Y + 142, HORIZON_Y + 176]) {
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
        }
        ctx.stroke();
        // lane dashes running under the line (they sit on the world, so the speed shows)
        ctx.fillStyle = 'rgba(130,240,255,0.5)';
        const cell = 110;
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            const sx = ThemeKit.sx(game, c * cell);
            ctx.fillRect(sx, HORIZON_Y + 118, 52, 2);
            ctx.fillRect(sx + 20, HORIZON_Y + 156, 70, 2.5);
            if (ThemeKit.hash(c + 11) > 0.55) {
                ctx.fillStyle = `rgba(255,120,220,${0.3 + 0.3 * Math.sin(t * 3 + c)})`;
                ctx.fillRect(sx + 6, HORIZON_Y + 30, 24, 2);
                ctx.fillStyle = 'rgba(130,240,255,0.5)';
            }
        }
    },

    layers: {
        // Far: a skyline of glass towers, needles and floating saucers.
        mountains: {
            spawn(x) {
                const r = Math.random();
                const kind = r < 0.5 ? 'tower' : r < 0.72 ? 'twin' : r < 0.9 ? 'needle' : 'saucer';
                return { x, kind, w: 30 + Math.random() * 40, h: 60 + Math.random() * 90, seed: Math.random() * 500 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev + 2, t = Date.now() / 1000;
                const body = ctx.createLinearGradient(0, by - obj.h, 0, by);
                body.addColorStop(0, '#2a4a98');
                body.addColorStop(1, '#0e1c46');
                const windows = (x0, w, h) => {
                    for (let wy = by - h + 8; wy < by - 6; wy += 9) {
                        for (let wx = x0 + 4; wx < x0 + w - 5; wx += 7) {
                            const n = ThemeKit.hash(obj.seed + wx * 0.7 + wy * 1.3);
                            if (n < 0.45) continue;
                            ctx.fillStyle = n > 0.9 ? '#ff8fe0' : n > 0.75 ? '#ffe9a0' : '#8fefff';
                            ctx.fillRect(wx, wy, 3, 4);
                        }
                    }
                };
                const beacon = (bx, byy) => {
                    ctx.fillStyle = Math.floor(t * 1.6 + obj.seed) % 2 ? '#ff5d7a' : '#5a2535';
                    ctx.fillRect(bx - 1.5, byy - 3, 3, 3);
                };
                if (obj.kind === 'tower' || obj.kind === 'twin') {
                    ctx.fillStyle = body;
                    ctx.fillRect(sx, by - obj.h, obj.w, obj.h);
                    ctx.fillStyle = 'rgba(160,220,255,0.18)';
                    ctx.fillRect(sx + obj.w - 4, by - obj.h, 4, obj.h);
                    windows(sx, obj.w, obj.h);
                    ctx.fillStyle = '#7fbfff';
                    ctx.fillRect(sx + obj.w / 2 - 0.75, by - obj.h - 12, 1.5, 12);
                    beacon(sx + obj.w / 2, by - obj.h - 12);
                    if (obj.kind === 'twin') {
                        const w2 = obj.w * 0.7, h2 = obj.h * 0.78, x2 = sx + obj.w + 16;
                        ctx.fillStyle = body;
                        ctx.fillRect(x2, by - h2, w2, h2);
                        windows(x2, w2, h2);
                        ctx.fillStyle = '#5da0e8';                       // skybridge
                        ctx.fillRect(sx + obj.w, by - h2 * 0.7, 16, 4);
                        beacon(x2 + w2 / 2, by - h2);
                    }
                } else if (obj.kind === 'needle') {
                    ctx.fillStyle = body;
                    ctx.beginPath();
                    ctx.moveTo(sx, by);
                    ctx.lineTo(sx + obj.w * 0.35, by - obj.h * 1.25);
                    ctx.lineTo(sx + obj.w * 0.45, by - obj.h * 1.25);
                    ctx.lineTo(sx + obj.w * 0.8, by);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(130,240,255,0.8)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(sx + obj.w * 0.4, by - obj.h * 0.8, obj.w * 0.42, 5, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    beacon(sx + obj.w * 0.4, by - obj.h * 1.25);
                } else {
                    const y = by - obj.h * 0.95 + Math.sin(t * 0.8 + obj.seed) * 3;
                    ctx.fillStyle = '#35508f';
                    ctx.fillRect(sx + obj.w * 0.45, y + 8, 5, by - y - 8);
                    const disc = ctx.createLinearGradient(0, y - 6, 0, y + 8);
                    disc.addColorStop(0, '#9fc4ff');
                    disc.addColorStop(1, '#3d62a8');
                    ctx.fillStyle = disc;
                    ctx.beginPath();
                    ctx.ellipse(sx + obj.w * 0.5, y, obj.w * 0.75, 7, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffe9a0';
                    for (let k = -2; k <= 2; k++) ctx.fillRect(sx + obj.w * 0.5 + k * 9 - 1, y + 1, 2.5, 2);
                }
            },
        },
        // Mid: light pylons, warp arches and holo-signs.
        trees: {
            spawn(x) {
                const r = Math.random();
                return { x, kind: r < 0.45 ? 'pylon' : r < 0.75 ? 'arch' : 'sign', h: 34 + Math.random() * 30, seed: Math.random() * 300 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev + 6, t = Date.now() / 1000;
                if (obj.kind === 'pylon') {
                    ctx.fillStyle = '#2b4580';
                    ctx.fillRect(sx - 2, by - obj.h, 4, obj.h);
                    for (let k = 1; k <= 2; k++) {
                        ctx.strokeStyle = `rgba(130,240,255,${0.5 + 0.4 * Math.sin(t * 3 + obj.seed + k)})`;
                        ctx.lineWidth = 1.6;
                        ctx.beginPath();
                        ctx.ellipse(sx, by - obj.h * (0.35 + k * 0.22), 9, 3, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    const orb = ctx.createRadialGradient(sx, by - obj.h - 4, 1, sx, by - obj.h - 4, 12);
                    orb.addColorStop(0, 'rgba(255,255,255,0.95)');
                    orb.addColorStop(1, 'rgba(120,240,255,0)');
                    ctx.fillStyle = orb;
                    ctx.fillRect(sx - 12, by - obj.h - 16, 24, 24);
                } else if (obj.kind === 'arch') {
                    const w = 42;
                    ctx.fillStyle = '#2b4580';
                    ctx.fillRect(sx - w / 2 - 2, by - obj.h, 4, obj.h);
                    ctx.fillRect(sx + w / 2 - 2, by - obj.h, 4, obj.h);
                    ctx.fillStyle = '#4c7ad0';
                    ctx.fillRect(sx - w / 2 - 2, by - obj.h - 4, w + 4, 5);
                    ctx.fillStyle = '#ff7ad9';                        // running chevrons along the beam
                    for (let k = 0; k < 4; k++) {
                        const cx = sx - w / 2 + ((t * 30 + k * 11) % 44);
                        ctx.fillRect(cx, by - obj.h - 3, 3, 3);
                    }
                } else {
                    ctx.fillStyle = '#26417a';
                    ctx.fillRect(sx - 1, by - obj.h * 0.55, 2, obj.h * 0.55);
                    const y = by - obj.h - 8 + Math.sin(t * 1.4 + obj.seed) * 2;
                    ctx.fillStyle = 'rgba(80,220,255,0.22)';
                    ctx.fillRect(sx - 20, y, 40, 22);
                    ctx.strokeStyle = 'rgba(150,250,255,0.85)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx - 20, y, 40, 22);
                    for (let k = 0; k < 4; k++) {
                        const w = 8 + ThemeKit.hash(obj.seed + k + Math.floor(t * 2)) * 24;
                        ctx.fillStyle = k % 2 ? '#8fefff' : '#ff9fe6';
                        ctx.fillRect(sx - 16, y + 4 + k * 4.5, w, 2);
                    }
                }
            },
        },
        // Near: glowing bollards and chevron signs along the line.
        rocks: {
            spawn(x) {
                return { x, sign: Math.random() < 0.4, seed: Math.random() * 200 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT + 26 - elev, t = Date.now() / 1000;
                if (obj.sign) {
                    ctx.fillStyle = '#16284f';
                    ctx.fillRect(sx - 12, by - 22, 24, 14);
                    ctx.strokeStyle = '#8ff0ff';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx - 12, by - 22, 24, 14);
                    ctx.strokeStyle = '#ff7ad9';
                    ctx.lineWidth = 2;
                    for (let k = 0; k < 2; k++) {
                        ctx.beginPath();
                        ctx.moveTo(sx - 6 + k * 8, by - 19);
                        ctx.lineTo(sx - 2 + k * 8, by - 15);
                        ctx.lineTo(sx - 6 + k * 8, by - 11);
                        ctx.stroke();
                    }
                    ctx.fillStyle = '#26406a';
                    ctx.fillRect(sx - 1, by - 8, 2, 8);
                } else {
                    ctx.fillStyle = '#1c3366';
                    ctx.fillRect(sx - 3, by - 14, 6, 14);
                    ctx.fillStyle = Math.floor(t * 2 + obj.seed) % 2 ? '#8ff0ff' : '#2a6a80';
                    ctx.fillRect(sx - 3, by - 16, 6, 3);
                }
            },
        },
    },

    // Warp streaks across the whole screen, a cyan flare while your turbo burns, and the
    // turbo panel (who leads, cells banked, turbo left).
    drawFx(ctx, game, W, H) {
        const state = game.mechState;
        if (!state) return;
        const raceT = game.gameState.time;
        const turbo = warpTurbo(state, 'player', raceT);
        const speed = Math.min(Math.abs(game.train.vx) * 2 / 9, 1.7);
        const lenMul = 0.6 + speed * 0.7 + turbo * 0.9;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 34; i++) {
            const par = 1.4 + ThemeKit.hash(i + 3) * 2.6;
            const len = (36 + ThemeKit.hash(i + 9) * 150) * lenMul;
            const x = ((ThemeKit.hash(i) * (W + 400) - game.cameraX * par) % (W + 400) + W + 400) % (W + 400) - 200;
            const y = 14 + ThemeKit.hash(i + 17) * (H - 28);
            const a = (0.06 + 0.17 * ThemeKit.hash(i + 21)) * Math.min(1, speed * 1.3) * (1 + turbo * 0.8);
            const col = i % 5 === 0 ? '255,130,225' : i % 3 === 0 ? '255,255,255' : '120,232,255';
            const g = ctx.createLinearGradient(x, 0, x + len, 0);
            g.addColorStop(0, `rgba(${col},${a})`);
            g.addColorStop(1, `rgba(${col},0)`);
            ctx.strokeStyle = g;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + len, y);
            ctx.stroke();
        }
        ctx.lineCap = 'butt';
        if (turbo > 0.01) {                                  // flare at the screen edges
            const flare = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
            flare.addColorStop(0, 'rgba(90,230,255,0)');
            flare.addColorStop(1, `rgba(90,230,255,${0.34 * turbo})`);
            ctx.fillStyle = flare;
            ctx.fillRect(0, 0, W, H);
        }
        if (game.gameState.result || !game.raceStarted) return;

        // Turbo panel.
        const lead = warpLeader(game), mine = lead === 'player';
        const px = W / 2, py = 118;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = mine ? 'rgba(190,252,255,0.95)' : 'rgba(255,150,190,0.95)';
        ctx.fillText(mine ? 'YOU LEAD: GRAB THE TURBO CELLS' : 'RIVAL LEADS: CELLS LOCKED, OVERTAKE!', px, py);
        const bw = 110, bx = px - bw / 2;
        ctx.fillStyle = 'rgba(8,16,40,0.7)';
        ctx.fillRect(bx, py + 5, bw, 7);
        const left = state.turbo.player ? Math.max(0, state.turbo.player.until - raceT) : 0;
        ctx.fillStyle = turbo > 0 ? '#7ff0ff' : '#3a6a88';
        ctx.fillRect(bx, py + 5, bw * Math.min(left / WARP.cap, 1), 7);
        ctx.strokeStyle = 'rgba(150,250,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, py + 5.5, bw - 1, 6);
        ctx.fillStyle = 'rgba(210,235,255,0.9)';
        ctx.fillText(`YOU ${state.got.player}  -  RIVAL ${state.got.opponent}`, px, py + 25);
        ctx.textAlign = 'left';
    },

    mechanic: {
        tune: WARP,
        // Turbo leaves a plasma scorch on the cars; ion streaks tear off while it burns, and warp
        // motes whip past the cars all the time.
        marks: { kind: 'warp_scorch', trigger: 'any', rate: 0.05, r: [3, 6], y: [8, 44], life: 40, hot: 4, perPart: 8 },
        fx: [
            { kind: 'warp_ion', trigger: 'any', rate: 0.55, n: 2, at: 'body', r: [1.2, 2.4], vx: [-3, -1], vy: [-0.25, 0.25], g: 0, life: [0.1, 0.22], inherit: 0.85 },
            { kind: 'warp_mote', trigger: 'ambient', rate: 0.1, at: 'body', r: [0.8, 1.6], vx: [-2, 0], vy: [-0.2, 0.5], g: 0, life: [0.12, 0.3], inherit: 0.8 },
        ],

        // Turbo cells every ~2700 units from the first stretch to just before the finish.
        init(game) {
            const first = WARP.first, last = game.finishLineWorldX - WARP.lastMargin;
            const n = Math.max(4, Math.round((last - first) / WARP.spacing));
            const cells = [];
            for (let i = 0; i < n; i++) {
                const base = first + (i / (n - 1)) * (last - first);
                cells.push({ x: Math.round(base + (i > 0 && i < n - 1 ? ThemeKit.rand(-280, 280) : 0)) });
            }
            return { cells, next: 0, turbo: { player: null, opponent: null }, got: { player: 0, opponent: 0 }, bursts: [] };
        },

        // Turbo for the train named by `who`; every car of that train feels it (they all ask).
        speedMult(state, x, t, game, who) {
            return who ? 1 + WARP.boost * warpTurbo(state, who, t) : 1;
        },

        // Whoever's nose reaches a cell first is the leader, and takes it. The trailing driver
        // can never collect: the leader has always been through first.
        update(state, game) {
            const t = game.gameState.time;
            if (game.raceStarted && !game.gameState.result) {
                const P = game.train.worldX, O = game.opponent.worldX;
                const who = P >= O ? 'player' : 'opponent';
                const nose = Math.max(P, O) + TRAIN_WIDTH / 2;
                while (state.next < state.cells.length && state.cells[state.next].x <= nose) {
                    const c = state.cells[state.next++];
                    const b = state.turbo[who];
                    if (b && t < b.until) b.until = Math.min(b.until + WARP.seconds, t + WARP.cap);
                    else state.turbo[who] = { start: t, until: t + WARP.seconds };
                    state.got[who]++;
                    state.bursts.push({ x: c.x, who, t0: t });
                }
            }
            if (state.bursts.length) state.bursts = state.bursts.filter(b => t - b.t0 < 1.4);
        },

        drawZones(ctx, state, game, pass) {
            const unlocked = warpLeader(game) === 'player';
            for (let i = state.next; i < state.cells.length; i++) {
                const c = state.cells[i];
                if (c.x - game.cameraX > game.canvas.width) break;       // sorted: the rest are further ahead
                if (pass === 'ground') warpDrawPad(ctx, game, c, unlocked);
                else warpDrawCell(ctx, game, c, i, unlocked, i === state.next);
            }
            if (pass === 'over') warpDrawBursts(ctx, game, state);
        },

        minimapMarks(state) {
            return state.cells.slice(state.next).map(c => ({ x0: c.x - 260, x1: c.x + 260, color: '#6af0ff' }));
        },
    },
});
