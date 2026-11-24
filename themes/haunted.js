// Haunted Hollow — FOG + HAUNTED PATCHES. Fog hides the rival: the other train fades with
// distance and the minimap never shows it, so you race on feel. Graveyard-mist patches on the
// rails haunt every train that crosses them (speed x0.7); ghosts rise from the rails before you
// reach one, and ectoplasm slime splats onto the cars while you drag through.
const HAUNT_SLOW = 0.7;

// Glowing ectoplasm splat that drips and pulses faintly.
ThemeKit.marks.haunted_ecto = (ctx, m, x, y, age) => {
    const h = (k) => ThemeKit.hash(m.seed + k);
    const pulse = 0.65 + 0.35 * Math.sin(age * 2.2 + m.seed);
    ctx.fillStyle = 'rgba(70,150,110,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, m.r * 1.15, m.r * 0.85, h(1) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(160,255,205,${0.35 + 0.35 * pulse})`;
    ctx.beginPath();
    ctx.ellipse(x - m.r * 0.15, y - m.r * 0.1, m.r * 0.62, m.r * 0.45, h(2) * 3, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
        const a = h(i + 3) * 6.28, d = m.r * (1 + h(i + 9) * 0.9);
        ctx.fillStyle = 'rgba(110,210,160,0.6)';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 0.9 + h(i + 14) * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }
    // A slow drip running down the paint.
    const drip = m.r * (1.2 + 1.6 * ((age * 0.12 + h(5)) % 1));
    ctx.fillStyle = 'rgba(120,230,175,0.7)';
    ctx.fillRect(x + m.r * 0.2, y + m.r * 0.5, 1.8, drip);
    ctx.fillStyle = `rgba(210,255,230,${0.5 * pulse})`;
    ctx.fillRect(x + m.r * 0.2 - 0.5, y + m.r * 0.5 + drip, 2.8, 2.2);
};

// A spirit orb: soft glow with a bright core, flickering as it drifts up.
ThemeKit.fx.haunted_wisp = (ctx, p, x, y, k) => {
    const flick = 0.7 + 0.3 * Math.sin(p.age * 14 + p.seed);
    const a = Math.min(1, (1 - k) * 2.2, k * 9) * flick;
    const r = p.r * (1 + k * 0.8);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    grad.addColorStop(0, `rgba(210,255,235,${0.85 * a})`);
    grad.addColorStop(0.35, `rgba(120,230,190,${0.4 * a})`);
    grad.addColorStop(1, 'rgba(120,230,190,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
    // A faint tail curling below it.
    ctx.strokeStyle = `rgba(170,245,215,${0.35 * a})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.sin(p.age * 5 + p.seed) * 5, y + r * 3, x - Math.sin(p.age * 4) * 3, y + r * 6);
    ctx.stroke();
};

// A ghost: dome head, wavy hem, hollow eyes. cx = centre x, by = hem y.
function hauntGhost(ctx, cx, by, s, alpha, t, seed) {
    const w = 15 * s, hgt = 30 * s;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#d8fff0';
    ctx.beginPath();
    ctx.moveTo(cx - w, by);
    ctx.lineTo(cx - w, by - hgt * 0.65);
    ctx.bezierCurveTo(cx - w, by - hgt * 1.25, cx + w, by - hgt * 1.25, cx + w, by - hgt * 0.65);
    ctx.lineTo(cx + w, by);
    const teeth = 4;
    for (let i = 0; i < teeth; i++) {
        const x0 = cx + w - (i * 2 * w) / teeth;
        ctx.quadraticCurveTo(x0 - w / teeth, by + 7 * s * (0.6 + 0.4 * Math.sin(t * 4 + i + seed)), x0 - (2 * w) / teeth, by);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b2a2a';
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.38, by - hgt * 0.68, 2.6 * s, 3.8 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + w * 0.38, by - hgt * 0.68, 2.6 * s, 3.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, by - hgt * 0.38, 2.4 * s, 3.2 * s * (0.8 + 0.4 * Math.sin(t * 3 + seed)), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

registerTheme({
    id: 'haunted',
    name: 'Haunted Hollow',
    hint: 'FOG hides the rival and the minimap. Ghost patches drag you down!',

    sky: [[0, '#07050f'], [0.45, '#1b1233'], [0.8, '#3a2a55'], [1, '#5e4a72']],
    ground: [[0, '#2b3a33'], [0.25, '#1b2622'], [1, '#0c1210']],
    track: { tie: '#2a2220', rail: '#8c8a96' },

    // The rails and ground stay flat; the hills are a ghost lifting the trains off them, so there is
    // no climbing or descending to slow anyone (slopeGain 0 turns the hill speed effect off).
    flatTrack: true,
    slopeGain: 0,
    terrain(finishX) {
        return hillTerrain(finishX, { maxHeight: 340, rolliness: 0.6 });
    },

    drawSky(ctx, game, W, H) {
        const t = Date.now() / 1000;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 46; i++) {
            ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * (0.4 + ThemeKit.hash(i + 3)) + i));
            ctx.fillRect(Math.round(ThemeKit.hash(i) * W), Math.round(ThemeKit.hash(i + 60) * HORIZON_Y * 0.7), 2, 2);
        }
        ctx.globalAlpha = 1;
        // A huge sickly moon with a halo.
        const mx = ((W * 0.72 - game.cameraX * 0.015) % (W + 200) + W + 200) % (W + 200) - 100, my = 72;
        const halo = ctx.createRadialGradient(mx, my, 20, mx, my, 150);
        halo.addColorStop(0, 'rgba(190,255,220,0.35)');
        halo.addColorStop(1, 'rgba(190,255,220,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(mx - 160, my - 160, 320, 320);
        ctx.fillStyle = '#e6f6dc';
        ctx.beginPath();
        ctx.arc(mx, my, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(150,175,140,0.5)';
        for (const [dx, dy, r] of [[-12, -8, 9], [10, 12, 6], [14, -14, 4], [-8, 16, 5]]) {
            ctx.beginPath();
            ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
            ctx.fill();
        }
        // Thin clouds crossing the moon.
        ctx.fillStyle = 'rgba(40,30,70,0.55)';
        for (let i = 0; i < 4; i++) {
            const cx = ((ThemeKit.hash(i + 7) * (W + 300) + t * (8 + i * 3) - game.cameraX * 0.04) % (W + 300) + W + 300) % (W + 300) - 150;
            const cy = 40 + i * 26;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 90, 7, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 40, cy - 3, 60, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // Bats flapping across.
        ctx.fillStyle = '#0a0612';
        for (let i = 0; i < 6; i++) {
            const sp = 28 + ThemeKit.hash(i + 21) * 36;
            const bx = ((ThemeKit.hash(i + 30) * (W + 120) + t * sp) % (W + 120)) - 60;
            const by = 30 + ThemeKit.hash(i + 40) * 90 + Math.sin(t * 2.2 + i) * 10;
            const flap = Math.sin(t * 14 + i * 2) * 5;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(bx - 7, by - 6 - flap, bx - 13, by - flap * 0.3);
            ctx.quadraticCurveTo(bx - 7, by + 1, bx, by + 3);
            ctx.quadraticCurveTo(bx + 7, by + 1, bx + 13, by - flap * 0.3);
            ctx.quadraticCurveTo(bx + 7, by - 6 - flap, bx, by);
            ctx.fill();
        }
    },

    // Mossy graveyard soil with sunken mist pools.
    drawGround(ctx, game, W, H) {
        const v = ThemeKit.visible(game, 60);
        const t = Date.now() / 1000;
        const cell = 130;
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            const h = ThemeKit.hash(c * 5 + 2);
            if (h < 0.4) continue;
            const x = ThemeKit.sx(game, c * cell + h * 70);
            const y = HORIZON_Y + 24 + ThemeKit.hash(c) * 140;
            ctx.fillStyle = 'rgba(60,90,70,0.3)';
            ctx.beginPath();
            ctx.ellipse(x, y, 30 + h * 30, 4 + h * 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(170,230,200,${0.05 + 0.04 * Math.sin(t + c)})`;
            ctx.beginPath();
            ctx.ellipse(x + 8, y - 2, 40 + h * 20, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    layers: {
        // Far: jagged ridges, now and then a manor with flickering windows.
        mountains: {
            spawn(x) {
                const manor = Math.random() < 0.14;
                const w = manor ? 190 : 140 + Math.random() * 200;
                return { x, w, h: manor ? 120 : 50 + Math.random() * 80, manor, seed: Math.random() * 100 };
            },
            draw(ctx, obj, sx) {
                const base = HORIZON_Y, h = (k) => ThemeKit.hash(obj.seed + k);
                ctx.fillStyle = '#1a1432';
                ctx.beginPath();
                ctx.moveTo(sx, base);
                const n = 7;
                for (let i = 0; i <= n; i++) {
                    const px = sx + (obj.w * i) / n;
                    const peak = Math.sin((i / n) * Math.PI) * obj.h * (0.55 + 0.45 * h(i));
                    ctx.lineTo(px, base - peak);
                }
                ctx.lineTo(sx + obj.w, base);
                ctx.closePath();
                ctx.fill();
                if (obj.manor) {
                    const mx = sx + obj.w * 0.5, top = base - obj.h * 0.9;
                    ctx.fillStyle = '#0d0a1c';
                    ctx.fillRect(mx - 46, top + 18, 92, 54);
                    ctx.beginPath();                      // roof
                    ctx.moveTo(mx - 52, top + 20);
                    ctx.lineTo(mx, top - 8);
                    ctx.lineTo(mx + 52, top + 20);
                    ctx.closePath();
                    ctx.fill();
                    for (const tx of [-58, 50]) {          // towers
                        ctx.fillRect(mx + tx, top + 4, 12, 70);
                        ctx.beginPath();
                        ctx.moveTo(mx + tx - 3, top + 6);
                        ctx.lineTo(mx + tx + 6, top - 22);
                        ctx.lineTo(mx + tx + 15, top + 6);
                        ctx.closePath();
                        ctx.fill();
                    }
                    const t = Date.now() / 1000;
                    for (let i = 0; i < 6; i++) {
                        const lit = Math.sin(t * (0.6 + h(i + 20)) + i * 3) > -0.4;
                        ctx.fillStyle = lit ? (i % 3 ? '#ffd86a' : '#9dffc8') : '#171024';
                        ctx.fillRect(mx - 38 + (i % 3) * 28, top + 28 + Math.floor(i / 3) * 22, 8, 12);
                    }
                }
                const mist = ctx.createLinearGradient(0, base - obj.h, 0, base);
                mist.addColorStop(0, 'rgba(140,120,190,0)');
                mist.addColorStop(1, 'rgba(140,120,190,0.45)');
                ctx.fillStyle = mist;
                ctx.fillRect(sx, base - obj.h, obj.w, obj.h);
            },
        },
        // Mid: dead, twisted trees with the odd crow.
        trees: {
            spawn(x) {
                return { x, h: 50 + Math.random() * 46, lean: (Math.random() - 0.5) * 14, seed: Math.random() * 100, crow: Math.random() < 0.3, glow: Math.random() < 0.15 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev, h = (k) => ThemeKit.hash(obj.seed + k);
                ctx.strokeStyle = '#0f0a19';
                ctx.fillStyle = '#0f0a19';
                // Tapered trunk.
                ctx.beginPath();
                ctx.moveTo(sx - 6, by + 3);
                ctx.quadraticCurveTo(sx - 3 + obj.lean * 0.4, by - obj.h * 0.5, sx + obj.lean - 2, by - obj.h);
                ctx.lineTo(sx + obj.lean + 2, by - obj.h);
                ctx.quadraticCurveTo(sx + 4 + obj.lean * 0.4, by - obj.h * 0.5, sx + 6, by + 3);
                ctx.closePath();
                ctx.fill();
                // Gnarled branches.
                ctx.lineCap = 'round';
                for (let i = 0; i < 5; i++) {
                    const y0 = by - obj.h * (0.35 + i * 0.13);
                    const side = i % 2 ? 1 : -1;
                    const len = 12 + h(i) * 16;
                    const x0 = sx + obj.lean * (0.35 + i * 0.13);
                    ctx.lineWidth = 3 - i * 0.4;
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    ctx.quadraticCurveTo(x0 + side * len * 0.6, y0 - 6, x0 + side * len, y0 - 4 - h(i + 9) * 12);
                    ctx.moveTo(x0 + side * len * 0.55, y0 - 5);
                    ctx.lineTo(x0 + side * len * 0.8, y0 - 14);
                    ctx.stroke();
                }
                ctx.lineCap = 'butt';
                if (obj.crow) {
                    ctx.fillStyle = '#05030a';
                    const cx = sx + obj.lean * 0.7 - 12, cy = by - obj.h * 0.62;
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, 5, 3, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillRect(cx - 7, cy - 2, 3, 1.5);
                }
                if (obj.glow) {   // a knot hole with eyes
                    const t = Date.now() / 1000;
                    ctx.fillStyle = `rgba(160,255,200,${0.6 + 0.4 * Math.sin(t * 2 + obj.seed)})`;
                    ctx.fillRect(sx - 3, by - obj.h * 0.3, 2, 2);
                    ctx.fillRect(sx + 2, by - obj.h * 0.3, 2, 2);
                }
            },
        },
        // Near: tombstones, crosses, iron fence, jack-o'-lanterns.
        rocks: {
            spawn(x) {
                const r = Math.random();
                return { x, type: r < 0.4 ? 'tomb' : r < 0.6 ? 'cross' : r < 0.8 ? 'fence' : 'pumpkin', s: 0.8 + Math.random() * 0.7, seed: Math.random() * 100 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev, s = obj.s;
                if (obj.type === 'tomb') {
                    const w = 22 * s, hgt = 28 * s;
                    ctx.fillStyle = '#5b5f6e';
                    ctx.beginPath();
                    ctx.moveTo(sx, by + 2);
                    ctx.lineTo(sx, by - hgt + w / 2);
                    ctx.arc(sx + w / 2, by - hgt + w / 2, w / 2, Math.PI, 0);
                    ctx.lineTo(sx + w, by + 2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(sx + w * 0.62, by - hgt + w / 2, w * 0.38, hgt - w / 2 + 2);
                    ctx.fillStyle = '#3d7a50';                 // moss
                    ctx.fillRect(sx, by - 3, w, 5);
                    ctx.fillStyle = '#3a3e4c';
                    ctx.fillRect(sx + w * 0.3, by - hgt * 0.7, w * 0.4, 2);
                    ctx.fillRect(sx + w * 0.3, by - hgt * 0.55, w * 0.4, 2);
                } else if (obj.type === 'cross') {
                    ctx.fillStyle = '#6a6e7e';
                    ctx.fillRect(sx + 6 * s, by - 34 * s, 5 * s, 36 * s);
                    ctx.fillRect(sx, by - 26 * s, 17 * s, 5 * s);
                    ctx.fillStyle = '#3d7a50';
                    ctx.fillRect(sx + 6 * s, by - 2, 5 * s, 4);
                } else if (obj.type === 'fence') {
                    ctx.fillStyle = '#16111f';
                    for (let i = 0; i < 5; i++) {
                        const px = sx + i * 9 * s;
                        ctx.fillRect(px, by - 24 * s, 3, 26 * s);
                        ctx.beginPath();
                        ctx.moveTo(px - 1.5, by - 24 * s);
                        ctx.lineTo(px + 1.5, by - 31 * s);
                        ctx.lineTo(px + 4.5, by - 24 * s);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.fillRect(sx, by - 17 * s, 40 * s, 3);
                    ctx.fillRect(sx, by - 7 * s, 40 * s, 3);
                } else {
                    const t = Date.now() / 1000, r = 11 * s;
                    ctx.fillStyle = '#d9731c';
                    ctx.beginPath();
                    ctx.ellipse(sx + r, by - r * 0.7, r, r * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#7a3b0d';
                    ctx.fillRect(sx + r - 1.5, by - r * 1.6, 3, 5);
                    const lit = 0.75 + 0.25 * Math.sin(t * 6 + obj.seed);
                    ctx.fillStyle = `rgba(255,220,90,${lit})`;
                    ctx.beginPath();
                    ctx.moveTo(sx + r * 0.45, by - r * 0.95);
                    ctx.lineTo(sx + r * 0.8, by - r * 1.25);
                    ctx.lineTo(sx + r * 0.95, by - r * 0.95);
                    ctx.moveTo(sx + r * 1.05, by - r * 0.95);
                    ctx.lineTo(sx + r * 1.2, by - r * 1.25);
                    ctx.lineTo(sx + r * 1.55, by - r * 0.95);
                    ctx.moveTo(sx + r * 0.5, by - r * 0.45);
                    ctx.lineTo(sx + r * 1.5, by - r * 0.45);
                    ctx.lineTo(sx + r * 1.3, by - r * 0.2);
                    ctx.lineTo(sx + r * 0.7, by - r * 0.2);
                    ctx.fill();
                }
            },
        },
    },

    // Drifting ground fog banks and spore-like motes in front of everything.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        for (let b = 0; b < 3; b++) {
            const y = HORIZON_Y + 4 + b * 58;
            const grad = ctx.createLinearGradient(0, y - 26, 0, y + 30);
            grad.addColorStop(0, 'rgba(170,150,210,0)');
            grad.addColorStop(0.5, `rgba(170,150,210,${0.16 - b * 0.03})`);
            grad.addColorStop(1, 'rgba(170,150,210,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, y - 26, W, 56);
            for (let i = 0; i < 4; i++) {
                const par = 0.25 + b * 0.18;
                const x = ((ThemeKit.hash(i + b * 9) * (W + 400) + t * (6 + b * 3) - game.cameraX * par) % (W + 400) + W + 400) % (W + 400) - 200;
                ctx.fillStyle = `rgba(200,185,235,${0.07 + 0.02 * Math.sin(t * 0.7 + i + b)})`;
                ctx.beginPath();
                ctx.ellipse(x, y + Math.sin(t * 0.5 + i) * 4, 140, 12, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.fillStyle = '#b9ffe0';
        for (let i = 0; i < 26; i++) {
            const x = ((ThemeKit.hash(i + 70) * W - game.cameraX * 0.4 + Math.sin(t * 0.6 + i) * 18) % W + W) % W;
            const y = ((ThemeKit.hash(i + 80) * H - t * (6 + ThemeKit.hash(i + 90) * 10)) % H + H) % H;
            ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t * 2 + i);
            ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
    },

    mechanic: {
        hideOpponentOnMinimap: true,
        marks: { kind: 'haunted_ecto', trigger: 'penalty', rate: 0.2, r: [3, 8], y: [10, 44], life: 40, perPart: 14 },
        fx: { kind: 'haunted_wisp', trigger: 'penalty', rate: 0.16, at: 'body', r: [2, 3.6], vx: [-0.4, 0.4], vy: [0.5, 1.5], g: -0.01, life: [1.2, 2.2], inherit: 0.9 },

        init(game) {
            const count = Math.max(5, Math.round(game.finishLineWorldX / 3300));
            return { zones: ThemeKit.placeZones(game, { count, lenMin: 300, lenMax: 480, margin: 1500, gap: 450 }) };
        },

        // Ghostly drag: x0.7 in the middle of a patch, easing in and out over 60 units.
        speedMult(state, x) {
            for (const z of state.zones) {
                if (x < z.x0 || x > z.x1) continue;
                const edge = Math.min(x - z.x0, z.x1 - x);
                return 1 - (1 - HAUNT_SLOW) * Math.min(edge / 60, 1);
            }
            return 1;
        },

        // The rival fades into the murk with distance, and more so while you drag through a patch.
        opponentAlpha(state, game) {
            const gap = Math.abs(game.opponent.worldX - game.train.worldX);
            let a = 1 - Math.min(Math.max((gap - 140) / 520, 0), 1) * 0.93;
            const cx = game.train.worldX + TRAIN_WIDTH / 2;
            if (state.zones.some(z => cx >= z.x0 && cx <= z.x1)) a *= 0.72;
            return Math.max(a, 0.05);
        },

        drawZones(ctx, state, game, pass) {
            const t = Date.now() / 1000;
            const vis = ThemeKit.visible(game, 120);
            if (pass === 'ground') {
                // A pale beam from the rails up to every car the ghost has lifted.
                ThemeKit.eachCar(game, (who, train, part, cx) => {
                    if (Math.abs(cx - game.cameraX) > game.canvas.width / 2 + 160) return;
                    const lift = part === 0 ? train.elev : (train.carts[part - 1] || { elev: 0 }).elev;
                    if (lift < 6) return;
                    const left = ThemeKit.sx(game, cx - TRAIN_WIDTH), rail = ThemeKit.railY(game, who, cx - TRAIN_WIDTH / 2);
                    const a = Math.min(lift / 60, 1) * 0.3;
                    const grad = ctx.createLinearGradient(0, rail - lift, 0, rail);
                    grad.addColorStop(0, `rgba(170,255,215,0)`);
                    grad.addColorStop(1, `rgba(170,255,215,${a})`);
                    ctx.fillStyle = grad;
                    ctx.fillRect(left + 8, rail - lift, TRAIN_WIDTH - 16, lift);
                });
            }
            for (const z of state.zones) {
                if (z.x1 < vis.x0 || z.x0 > vis.x1) continue;
                if (pass === 'ground') {
                    // Pale sickly glow over the rails; brighter pulse toward the middle.
                    if (!ThemeKit.laneStrip(ctx, game, z.x0, z.x1, 'rgba(120,230,180,0.14)', 12)) continue;
                    ThemeKit.laneStrip(ctx, game, z.x0 + 40, z.x1 - 40, `rgba(160,255,210,${0.1 + 0.06 * Math.sin(t * 2 + z.x0)})`, 4);
                    // Grave-mist swirls creeping over the lane.
                    const n = Math.floor((z.x1 - z.x0) / 48);
                    for (let i = 0; i < n; i++) {
                        const h = (k) => ThemeKit.hash(z.x0 * 0.01 + i * 3.7 + k);
                        const x = z.x0 + 20 + h(1) * (z.x1 - z.x0 - 40);
                        const sx = ThemeKit.sx(game, x);
                        const y = TRACK_BACK + 4 + h(2) * 44 - game.getElevation(x);
                        ctx.fillStyle = `rgba(190,255,225,${0.1 + 0.1 * Math.sin(t * 1.3 + i)})`;
                        ctx.beginPath();
                        ctx.ellipse(sx + Math.sin(t * 0.6 + i) * 10, y, 22 + h(3) * 18, 3 + h(4) * 3, 0, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (pass === 'over') {
                    // Ghosts rising from the rails along the whole patch.
                    const n = Math.max(3, Math.floor((z.x1 - z.x0) / 90));
                    for (let i = 0; i < n; i++) {
                        const h = (k) => ThemeKit.hash(z.x0 * 0.02 + i * 5.1 + k);
                        const q = (t * (0.16 + h(1) * 0.1) + h(2)) % 1;
                        const x = z.x0 + 30 + ((i + 0.5 + Math.sin(t * 0.5 + i) * 0.2) / n) * (z.x1 - z.x0 - 60);
                        const edge = Math.min(Math.min(x - z.x0, z.x1 - x) / 50, 1);
                        const sx = ThemeKit.sx(game, x + Math.sin(q * 6 + i) * 12);
                        if (sx < -40 || sx > game.canvas.width + 40) continue;
                        const baseY = TRACK_BACK + 4 + h(3) * 40 - game.getElevation(x);
                        const alpha = Math.sin(q * Math.PI) * 0.55 * edge;
                        hauntGhost(ctx, sx, baseY - q * 62, 0.8 + h(4) * 0.5, alpha, t, i);
                    }
                }
            }
        },

        minimapMarks(state) {
            return state.zones.map(z => ({ x0: z.x0, x1: z.x1, color: '#8affc8' }));
        },
    },
});
