// Jungle Monsoon — MUD: brown pits across both rails slow every train that crosses them.
// Boost taps push through: each live tap cancels part of the slowdown for the player.
registerTheme({
    id: 'jungle',
    name: 'Jungle Monsoon',
    hint: 'MUD: brown pits slow you down. Tap to push through!',

    sky: [[0, '#1f3a40'], [0.5, '#35665a'], [1, '#86b794']],
    ground: [[0, '#3f6330'], [0.3, '#2f4a22'], [1, '#1c2c17']],
    track: { tie: '#4b3a28', rail: '#92928a' },

    layers: {
        // Far: misty green ridgelines.
        mountains: {
            spawn(x) {
                return { x, w: 160 + Math.random() * 220, h: 50 + Math.random() * 80, hue: 135 + Math.random() * 25 };
            },
            draw(ctx, obj, sx) {
                const base = HORIZON_Y;
                ctx.fillStyle = `hsl(${obj.hue},32%,26%)`;
                ctx.beginPath();
                ctx.moveTo(sx, base);
                ctx.bezierCurveTo(sx + obj.w * 0.2, base - obj.h * 1.25, sx + obj.w * 0.8, base - obj.h * 1.25, sx + obj.w, base);
                ctx.closePath();
                ctx.fill();
                const mist = ctx.createLinearGradient(0, base - obj.h, 0, base);
                mist.addColorStop(0, 'rgba(210,235,225,0)');
                mist.addColorStop(1, 'rgba(210,235,225,0.55)');
                ctx.fillStyle = mist;
                ctx.fillRect(sx, base - obj.h, obj.w, obj.h);
            },
        },
        // Mid: tall trees with round canopies and hanging vines.
        trees: {
            spawn(x) {
                return { x, h: 60 + Math.random() * 50, r: 16 + Math.random() * 12, vines: 1 + Math.floor(Math.random() * 3), seed: Math.random() * 100 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev;
                const top = by - obj.h;
                ctx.fillStyle = '#4a3624';
                ctx.fillRect(sx - 3, top, 6, obj.h + 4);
                const blobs = [[0, 0, 1], [-0.7, 0.35, 0.8], [0.7, 0.35, 0.8], [0, -0.55, 0.75]];
                blobs.forEach(([dx, dy, k], i) => {
                    ctx.fillStyle = i % 2 ? '#2d5a33' : '#24492a';
                    ctx.beginPath();
                    ctx.arc(sx + dx * obj.r, top + dy * obj.r, obj.r * k, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.strokeStyle = '#3f7a45';
                ctx.lineWidth = 2;
                for (let v = 0; v < obj.vines; v++) {
                    const vx = sx + (v - 1) * obj.r * 0.7;
                    ctx.beginPath();
                    ctx.moveTo(vx, top + obj.r * 0.6);
                    ctx.lineTo(vx + Math.sin(obj.seed + v) * 3, top + obj.r * 0.6 + 18 + v * 6);
                    ctx.stroke();
                }
            },
        },
        // Near: big wet leaves and ferns.
        rocks: {
            spawn(x) {
                return { x, n: 3 + Math.floor(Math.random() * 3), s: 0.8 + Math.random() * 0.8 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev;
                for (let i = 0; i < obj.n; i++) {
                    const a = -Math.PI / 2 + (i - (obj.n - 1) / 2) * 0.55;
                    ctx.save();
                    ctx.translate(sx, by);
                    ctx.rotate(a + Math.PI / 2);
                    ctx.fillStyle = i % 2 ? '#2f6b3a' : '#3b8248';
                    ctx.beginPath();
                    ctx.ellipse(0, -16 * obj.s, 6 * obj.s, 17 * obj.s, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            },
        },
    },

    // Monsoon rain, slanted, with a little parallax.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        ctx.strokeStyle = 'rgba(200,225,235,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 110; i++) {
            const x = ((ThemeKit.hash(i) * W * 1.3 - game.cameraX * 0.8 - t * 120) % (W * 1.3) + W * 1.3) % (W * 1.3) - 40;
            const y = ((ThemeKit.hash(i + 17) * H + t * 520) % H + H) % H;
            ctx.moveTo(x, y);
            ctx.lineTo(x - 5, y + 14);
        }
        ctx.stroke();
    },

    mechanic: {
        marks: { kind: 'mud', trigger: 'penalty', rate: 0.22, r: [3, 7.5], y: [20, 42], life: 55, perPart: 16 },
        init(game) {
            const count = Math.max(4, Math.round(game.finishLineWorldX / 2900));
            return { zones: ThemeKit.placeZones(game, { count, lenMin: 350, lenMax: 600, margin: 1500, gap: 450 }) };
        },

        // 0.55 in the middle of a pit, easing in and out over 60 units.
        speedMult(state, x) {
            for (const z of state.zones) {
                if (x < z.x0 || x > z.x1) continue;
                const edge = Math.min(x - z.x0, z.x1 - x);
                return 1 - 0.45 * Math.min(edge / 60, 1);
            }
            return 1;
        },

        drawZones(ctx, state, game, pass) {
            if (pass !== 'ground') return;
            const t = Date.now() / 1000;
            for (const z of state.zones) {
                if (!ThemeKit.laneStrip(ctx, game, z.x0, z.x1, '#6e4c2c', 8)) continue;
                ThemeKit.laneStrip(ctx, game, z.x0 + 22, z.x1 - 22, '#573a20', 2);
                // Glossy puddle highlights and popping bubbles.
                const n = Math.floor((z.x1 - z.x0) / 55);
                for (let i = 0; i < n; i++) {
                    const x = z.x0 + 30 + (i / n) * (z.x1 - z.x0 - 60);
                    const sx = ThemeKit.sx(game, x);
                    const y = TRACK_BACK + 2 + ThemeKit.hash(z.x0 + i) * 44 - game.getElevation(x);
                    const pulse = (t * 0.9 + ThemeKit.hash(i + z.x0)) % 1;
                    ctx.strokeStyle = `rgba(190,150,100,${0.7 * (1 - pulse)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(sx, y, 2 + pulse * 6, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        },

        minimapMarks(state) {
            return state.zones.map(z => ({ x0: z.x0, x1: z.x1, color: '#b07a40' }));
        },
    },
});
