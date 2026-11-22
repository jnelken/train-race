// Deep Sea Tube — CURRENTS: green arrows are a tailwind that speeds you up, pink arrows a
// headwind that drags you back. The arrows stream across the track so you can read them
// from afar. Taps cut the drag of a headwind.
registerTheme({
    id: 'deepsea',
    name: 'Deep Sea Tube',
    hint: 'CURRENTS: green pushes you ahead, pink drags you back.',

    sky: [[0, '#08324f'], [0.5, '#0d5782'], [1, '#1b86a8']],
    ground: [[0, '#d2bb82'], [0.3, '#b09a63'], [1, '#6e5f3d']],
    track: { tie: '#46505c', rail: '#c9dde4' },

    // Sun shafts sweeping down through the water.
    drawSky(ctx, game, W, H) {
        const t = Date.now() / 1000;
        for (let i = 0; i < 6; i++) {
            const x = ((i * 170 + 40 - game.cameraX * 0.05) % (W + 200) + W + 200) % (W + 200) - 100;
            const lean = 70 + Math.sin(t * 0.4 + i) * 22;
            const grad = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 60);
            grad.addColorStop(0, 'rgba(190,240,255,0.20)');
            grad.addColorStop(1, 'rgba(190,240,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 46, 0);
            ctx.lineTo(x + 46 - lean, HORIZON_Y + 60);
            ctx.lineTo(x - lean, HORIZON_Y + 60);
            ctx.closePath();
            ctx.fill();
        }
    },

    // Sand ripples on the sea floor.
    drawGround(ctx, game, W, H) {
        const v = ThemeKit.visible(game, 40);
        ctx.strokeStyle = 'rgba(255,245,210,0.3)';
        ctx.lineWidth = 2;
        const cell = 90;
        ctx.beginPath();
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            const h = ThemeKit.hash(c * 5 + 1);
            const sx = ThemeKit.sx(game, c * cell);
            const y = HORIZON_Y + 24 + h * 160;
            ctx.moveTo(sx, y);
            ctx.quadraticCurveTo(sx + 14, y - 5, sx + 30 + h * 20, y);
        }
        ctx.stroke();
    },

    layers: {
        // Far: dark reef rocks, now and then a sunken wreck.
        mountains: {
            spawn(x) {
                const wreck = Math.random() < 0.14;
                return { x, wreck, w: wreck ? 150 : 110 + Math.random() * 170, h: 40 + Math.random() * 70, hue: 190 + Math.random() * 20 };
            },
            draw(ctx, obj, sx) {
                const base = HORIZON_Y;
                ctx.fillStyle = `hsl(${obj.hue},45%,22%)`;
                if (obj.wreck) {
                    ctx.beginPath();
                    ctx.moveTo(sx, base - 14);
                    ctx.lineTo(sx + obj.w, base - 34);
                    ctx.lineTo(sx + obj.w - 22, base);
                    ctx.lineTo(sx + 16, base);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillRect(sx + obj.w * 0.45, base - 78, 4, 56);
                    ctx.fillRect(sx + obj.w * 0.25, base - 56, 4, 34);
                    return;
                }
                ctx.beginPath();
                ctx.moveTo(sx, base);
                ctx.bezierCurveTo(sx + obj.w * 0.15, base - obj.h * 1.3, sx + obj.w * 0.85, base - obj.h * 1.3, sx + obj.w, base);
                ctx.closePath();
                ctx.fill();
                const fog = ctx.createLinearGradient(0, base - obj.h, 0, base);
                fog.addColorStop(0, 'rgba(60,150,180,0)');
                fog.addColorStop(1, 'rgba(60,150,180,0.5)');
                ctx.fillStyle = fog;
                ctx.fillRect(sx, base - obj.h, obj.w, obj.h);
            },
        },
        // Mid: swaying kelp.
        trees: {
            spawn(x) {
                return { x, n: 2 + Math.floor(Math.random() * 3), h: 46 + Math.random() * 54, seed: Math.random() * 10 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev + 2;
                const t = Date.now() / 1000;
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                for (let i = 0; i < obj.n; i++) {
                    const bx = sx + i * 9;
                    ctx.strokeStyle = i % 2 ? '#2f8a4a' : '#3aa65a';
                    ctx.beginPath();
                    for (let k = 0; k <= 8; k++) {
                        const y = by - (obj.h * (0.7 + i * 0.15)) * (k / 8);
                        const x = bx + Math.sin(t * 1.3 + obj.seed + k * 0.55 + i) * (k * 1.1);
                        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                    }
                    ctx.stroke();
                }
                ctx.lineCap = 'butt';
            },
        },
        // Near: coral clumps.
        rocks: {
            spawn(x) {
                return { x, hue: ThemeKit.pick([340, 20, 290, 160]), arms: 3 + Math.floor(Math.random() * 3), s: 0.8 + Math.random() * 0.7 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev;
                ctx.strokeStyle = `hsl(${obj.hue},65%,58%)`;
                ctx.fillStyle = ctx.strokeStyle;
                ctx.lineWidth = 3;
                for (let i = 0; i < obj.arms; i++) {
                    const a = -Math.PI / 2 + (i - (obj.arms - 1) / 2) * 0.5;
                    const len = (14 + (i % 2) * 7) * obj.s;
                    const ex = sx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
                    ctx.beginPath();
                    ctx.moveTo(sx, by + 2);
                    ctx.lineTo(ex, ey);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(ex, ey, 3 * obj.s, 0, Math.PI * 2);
                    ctx.fill();
                }
            },
        },
    },

    // Rising bubbles and little fish drifting by.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        ctx.strokeStyle = 'rgba(220,245,255,0.6)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 34; i++) {
            const par = 0.5 + ThemeKit.hash(i + 3) * 0.6;
            const x = ((ThemeKit.hash(i) * W - game.cameraX * par + Math.sin(t * 1.5 + i) * 6) % W + W) % W;
            const y = H - ((ThemeKit.hash(i + 40) * H + t * (24 + ThemeKit.hash(i + 8) * 30)) % H);
            ctx.beginPath();
            ctx.arc(x, y, 1.5 + ThemeKit.hash(i + 2) * 3, 0, Math.PI * 2);
            ctx.stroke();
        }
        for (let i = 0; i < 9; i++) {
            const dir = ThemeKit.hash(i + 70) < 0.5 ? -1 : 1;
            const span = W + 120;
            const x = (((ThemeKit.hash(i + 60) * span + dir * t * (24 + i * 4) - game.cameraX * 0.35) % span) + span) % span - 60;
            const y = 40 + ThemeKit.hash(i + 61) * 150;
            ctx.fillStyle = `hsl(${ThemeKit.pick([30, 50, 190, 330])},80%,62%)`;
            ctx.beginPath();
            ctx.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x - dir * 6, y);
            ctx.lineTo(x - dir * 12, y - 4);
            ctx.lineTo(x - dir * 12, y + 4);
            ctx.closePath();
            ctx.fill();
        }
    },

    mechanic: {
        marks: { kind: 'kelp', trigger: 'any', rate: 0.06, r: [7, 12], y: [10, 34], life: 24, perPart: 6 },
        init(game) {
            const count = Math.max(5, Math.round(game.finishLineWorldX / 2300));
            const zones = ThemeKit.placeZones(game, { count, lenMin: 520, lenMax: 820, margin: 1400, gap: 350 });
            zones.forEach((z, i) => { z.dir = (i % 2 === 0) === (Math.random() < 0.7) ? 1 : -1; });
            return { zones };
        },

        // Tailwind 1.3x, headwind 0.7x, easing in and out over 80 units.
        speedMult(state, x) {
            for (const z of state.zones) {
                if (x < z.x0 || x > z.x1) continue;
                const w = Math.min(Math.min(x - z.x0, z.x1 - x) / 80, 1);
                return 1 + z.dir * 0.3 * w;
            }
            return 1;
        },

        drawZones(ctx, state, game, pass) {
            // Water rushing past the train: streaks drift along each current in front of the
            // cars, so a tailwind carries you along and a headwind visibly rushes at you.
            if (pass === 'over') {
                const t = Date.now() / 1000;
                const vis = ThemeKit.visible(game, 120);
                for (const z of state.zones) {
                    if (z.x1 < vis.x0 || z.x0 > vis.x1) continue;
                    const len = z.x1 - z.x0;
                    const col = z.dir > 0 ? '170,255,225' : '255,170,195';
                    const n = Math.floor(len / 22);
                    ctx.lineCap = 'round';
                    for (let i = 0; i < n; i++) {
                        const h = (k) => ThemeKit.hash(z.x0 * 0.013 + i * 7.1 + k);
                        const L = 40 + h(1) * 90;
                        const x = z.x0 + ((((h(2) * len + z.dir * (150 + h(3) * 90) * t) % len) + len) % len);
                        const head = x, tail = x - z.dir * L;
                        const lo = Math.min(head, tail), hi = Math.max(head, tail);
                        if (hi < vis.x0 || lo > vis.x1) continue;
                        const edge = Math.min(Math.min(x - z.x0, z.x1 - x) / 70, 1);
                        if (edge <= 0) continue;
                        const y = TRACK_BACK - 46 + h(4) * 112 - game.getElevation(x) + Math.sin(t * 3 + i) * 2;
                        const sh = ThemeKit.sx(game, head), st = ThemeKit.sx(game, tail);
                        const grad = ctx.createLinearGradient(st, 0, sh, 0);
                        grad.addColorStop(0, `rgba(${col},0)`);
                        grad.addColorStop(1, `rgba(${col},${0.75 * edge})`);
                        ctx.strokeStyle = grad;
                        ctx.lineWidth = 1.5 + h(5) * 2;
                        ctx.beginPath();
                        ctx.moveTo(st, y);
                        ctx.quadraticCurveTo((st + sh) / 2, y + Math.sin(t * 4 + i * 1.3) * 3, sh, y);
                        ctx.stroke();
                        if (h(6) > 0.78) {   // the odd bubble tumbling along
                            ctx.strokeStyle = `rgba(230,250,255,${0.7 * edge})`;
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.arc(sh, y - 5 + Math.sin(t * 5 + i) * 3, 1.8 + h(7) * 2, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                    }
                    ctx.lineCap = 'butt';
                }
                return;
            }
            if (pass !== 'ground') return;
            const t = Date.now() / 1000;
            for (const z of state.zones) {
                const col = z.dir > 0 ? '88,242,192' : '255,107,138';
                if (!ThemeKit.laneStrip(ctx, game, z.x0, z.x1, `rgba(${col},0.20)`, 14)) continue;
                // Chevrons streaming with (or against) the train.
                ctx.strokeStyle = `rgba(${col},0.85)`;
                ctx.lineWidth = 3;
                const gap = 70, vis = ThemeKit.visible(game, 20);
                const a = Math.max(z.x0 + 20, vis.x0), b = Math.min(z.x1 - 20, vis.x1);
                const phase = (t * 90 * z.dir) % gap;
                for (let x = Math.floor((a - phase) / gap) * gap + phase; x < b; x += gap) {
                    if (x < z.x0 + 20 || x > z.x1 - 20) continue;
                    const sx = ThemeKit.sx(game, x);
                    const y = (TRACK_BACK + TRACK_FRONT) / 2 - game.getElevation(x);
                    ctx.beginPath();
                    ctx.moveTo(sx - z.dir * 9, y - 12);
                    ctx.lineTo(sx + z.dir * 9, y);
                    ctx.lineTo(sx - z.dir * 9, y + 12);
                    ctx.stroke();
                }
            }
        },

        minimapMarks(state) {
            return state.zones.map(z => ({ x0: z.x0, x1: z.x1, color: z.dir > 0 ? '#58f2c0' : '#ff6b8a' }));
        },
    },
});
