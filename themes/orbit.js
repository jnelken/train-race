// Orbit Rail — ZERO-G: each boost tap lasts twice as long but gives half the kick, and the
// train has heavy momentum (slower to speed up and to slow down, same top speed).
// Tap steadily rather than mashing; the stack builds and fades gently.
registerTheme({
    id: 'orbit',
    name: 'Orbit Rail',
    hint: 'ZERO-G: boosts last twice as long, momentum is heavy.',

    sky: [[0, '#02030a'], [0.5, '#0a0f2a'], [1, '#1a1850']],

    // Stars, a nebula, a ringed planet and a small moon, all in slow parallax.
    drawSky(ctx, game, W, H) {
        const t = Date.now() / 1000;
        const neb = ctx.createRadialGradient(W * 0.28, 70, 10, W * 0.28, 70, W * 0.5);
        neb.addColorStop(0, 'rgba(150,70,200,0.30)');
        neb.addColorStop(0.5, 'rgba(60,70,200,0.14)');
        neb.addColorStop(1, 'rgba(60,70,200,0)');
        ctx.fillStyle = neb;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 90; i++) {
            const par = 0.015 + ThemeKit.hash(i + 200) * 0.04;
            const x = ((ThemeKit.hash(i) * W - game.cameraX * par) % W + W) % W;
            const y = ThemeKit.hash(i + 50) * (HORIZON_Y + 10);
            ctx.globalAlpha = 0.3 + 0.6 * Math.abs(Math.sin(t * (0.5 + ThemeKit.hash(i + 9)) + i));
            const s = ThemeKit.hash(i + 4) > 0.9 ? 3 : 2;
            ctx.fillRect(Math.round(x), Math.round(y), s, s);
        }
        ctx.globalAlpha = 1;
        // Ringed planet.
        const px = ((W * 0.72 - game.cameraX * 0.03) % (W + 260) + W + 260) % (W + 260) - 130;
        const py = 92;
        const body = ctx.createRadialGradient(px - 14, py - 14, 6, px, py, 46);
        body.addColorStop(0, '#f2b97a');
        body.addColorStop(1, '#8a4a36');
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(px, py, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(235,215,180,0.75)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(px, py, 72, 15, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        // Moon.
        const mx = ((W * 0.18 - game.cameraX * 0.05) % (W + 100) + W + 100) % (W + 100) - 50;
        ctx.fillStyle = '#cfd3de';
        ctx.beginPath();
        ctx.arc(mx, 54, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120,125,145,0.6)';
        ctx.beginPath();
        ctx.arc(mx - 4, 51, 3.5, 0, Math.PI * 2);
        ctx.arc(mx + 4, 58, 2.5, 0, Math.PI * 2);
        ctx.fill();
    },

    ground: [[0, '#2d3342'], [0.2, '#1d222e'], [1, '#10131b']],
    track: { tie: '#6b7488', rail: '#dfe8ff' },

    // Metal deck plating with blinking lights.
    drawGround(ctx, game, W, H) {
        const v = ThemeKit.visible(game, 40);
        const t = Date.now() / 1000;
        ctx.strokeStyle = 'rgba(150,170,210,0.22)';
        ctx.lineWidth = 1;
        const cell = 80;
        ctx.beginPath();
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            const sx = ThemeKit.sx(game, c * cell);
            ctx.moveTo(sx, HORIZON_Y + 6);
            ctx.lineTo(sx - 18, H);
        }
        for (const y of [HORIZON_Y + 30, HORIZON_Y + 78, HORIZON_Y + 140]) {
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
        }
        ctx.stroke();
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            if (ThemeKit.hash(c + 3) < 0.6) continue;
            const on = Math.sin(t * 2 + c) > 0;
            ctx.fillStyle = on ? '#ff5d5d' : '#5a2a2a';
            ctx.fillRect(ThemeKit.sx(game, c * cell + 40), HORIZON_Y + 12, 4, 4);
        }
    },

    layers: {
        // Far: drifting asteroids and the odd space station.
        mountains: {
            spawn(x) {
                const station = Math.random() < 0.18;
                return { x, station, w: station ? 120 : 40 + Math.random() * 70, h: station ? 36 : 26 + Math.random() * 44, y: 40 + Math.random() * 90, seed: Math.random() * 6 };
            },
            draw(ctx, obj, sx) {
                const t = Date.now() / 1000;
                const y = obj.y + Math.sin(t * 0.4 + obj.seed) * 4;
                if (obj.station) {
                    ctx.fillStyle = '#7c86a4';
                    ctx.fillRect(sx + 40, y, 40, 14);
                    ctx.fillStyle = '#5a6482';
                    ctx.fillRect(sx + 52, y - 12, 16, 12);
                    ctx.fillStyle = '#3a6fd0';
                    ctx.fillRect(sx, y + 2, 34, 10);
                    ctx.fillRect(sx + 86, y + 2, 34, 10);
                    ctx.fillStyle = '#ffd96a';
                    ctx.fillRect(sx + 58, y + 5, 4, 4);
                    return;
                }
                ctx.fillStyle = '#585e72';
                ctx.beginPath();
                ctx.moveTo(sx, y + obj.h * 0.5);
                ctx.lineTo(sx + obj.w * 0.25, y);
                ctx.lineTo(sx + obj.w * 0.8, y + obj.h * 0.12);
                ctx.lineTo(sx + obj.w, y + obj.h * 0.6);
                ctx.lineTo(sx + obj.w * 0.55, y + obj.h);
                ctx.lineTo(sx + obj.w * 0.1, y + obj.h * 0.85);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#434859';
                ctx.beginPath();
                ctx.arc(sx + obj.w * 0.4, y + obj.h * 0.5, obj.w * 0.1, 0, Math.PI * 2);
                ctx.fill();
            },
        },
        // Mid: antenna masts and solar panel stands on the deck.
        trees: {
            spawn(x) {
                return { x, panel: Math.random() < 0.5, h: 28 + Math.random() * 30 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev + 4;
                ctx.fillStyle = '#8b93ab';
                ctx.fillRect(sx - 1.5, by - obj.h, 3, obj.h);
                if (obj.panel) {
                    ctx.fillStyle = '#2f5fc0';
                    ctx.fillRect(sx - 16, by - obj.h, 32, 10);
                    ctx.fillStyle = '#7ea5f0';
                    ctx.fillRect(sx - 16, by - obj.h, 32, 2);
                } else {
                    ctx.fillStyle = (Math.floor(Date.now() / 500 + sx) % 2) ? '#ff5d5d' : '#6a2c2c';
                    ctx.fillRect(sx - 2, by - obj.h - 4, 5, 5);
                }
            },
        },
        // Near: cargo crates.
        rocks: {
            spawn(x) {
                return { x, s: 0.8 + Math.random() * 0.8, hue: ThemeKit.pick([30, 205, 0]) };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev;
                const w = 20 * obj.s, h = 14 * obj.s;
                ctx.fillStyle = `hsl(${obj.hue},45%,42%)`;
                ctx.fillRect(sx, by - h, w, h);
                ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(sx + 1, by - h + 1, w - 2, h - 2);
                ctx.beginPath();
                ctx.moveTo(sx, by - h);
                ctx.lineTo(sx + w, by);
                ctx.stroke();
            },
        },
    },

    // Slow dust motes drifting in the void plus the odd shooting star.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        ctx.fillStyle = '#cfd8ff';
        for (let i = 0; i < 24; i++) {
            const par = 0.3 + ThemeKit.hash(i + 5) * 0.8;
            const x = ((ThemeKit.hash(i) * W - game.cameraX * par + t * 6) % W + W) % W;
            const y = (ThemeKit.hash(i + 30) * H + Math.sin(t * 0.7 + i) * 8 + H) % H;
            ctx.globalAlpha = 0.35;
            ctx.fillRect(x, y, 2, 2);
        }
        const cycle = t % 7;
        if (cycle < 0.7) {
            const p = cycle / 0.7;
            const x0 = W * (0.15 + 0.5 * ThemeKit.hash(Math.floor(t / 7)));
            ctx.globalAlpha = 1 - p;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x0 + p * 180, 20 + p * 80);
            ctx.lineTo(x0 + p * 180 - 40, 20 + p * 80 - 18);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    },

    mechanic: {
        marks: { kind: 'scratch', trigger: 'ambient', rate: 0.012, r: [6, 12], y: [8, 42], perPart: 10 },
        // Heavy momentum; boost taps last 2 s at +2.5% each (the same total as +5% for 1 s).
        physics: { inertia: 0.6, boostMs: 2000, boostPer: 0.025 },
    },
});
