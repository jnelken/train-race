// Arctic Tundra — ICE: the rails are slick, so speeding up and slowing down both take
// about twice as long (same top speed). Tap early; the boost builds slowly and fades slowly.
registerTheme({
    id: 'arctic',
    name: 'Arctic Tundra',
    hint: 'ICE: slow to speed up, slow to stop. Tap early!',
    lightHud: true,

    sky: [[0, '#0b1d3a'], [0.45, '#2f6aa3'], [0.8, '#a9d3ee'], [1, '#e3f3ff']],

    // Stars and a slow green/teal/violet aurora, drifting with a little parallax.
    drawSky(ctx, game, W, H) {
        const t = Date.now() / 1000;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 40; i++) {
            const x = ThemeKit.hash(i) * W;
            const y = ThemeKit.hash(i + 99) * HORIZON_Y * 0.55;
            ctx.globalAlpha = 0.35 + 0.4 * Math.sin(t * 1.3 + i);
            ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
        const ribbons = [
            { y: 62, amp: 16, hue: 150, a: 0.28 },
            { y: 82, amp: 12, hue: 175, a: 0.22 },
            { y: 48, amp: 20, hue: 285, a: 0.16 },
        ];
        const drift = game.cameraX * 0.04;
        ribbons.forEach((r, i) => {
            const grad = ctx.createLinearGradient(0, r.y - 30, 0, r.y + 46);
            grad.addColorStop(0, `hsla(${r.hue},80%,65%,0)`);
            grad.addColorStop(0.35, `hsla(${r.hue},80%,65%,${r.a})`);
            grad.addColorStop(1, `hsla(${r.hue},80%,65%,0)`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = grad;
            ctx.beginPath();
            const yAt = (x) => r.y + Math.sin((x + drift) * 0.012 + t * 0.5 + i * 2) * r.amp
                + Math.sin((x + drift) * 0.027 - t * 0.3) * r.amp * 0.4;
            ctx.moveTo(0, yAt(0) - 30);
            for (let x = 0; x <= W; x += 12) ctx.lineTo(x, yAt(x) - 30);
            for (let x = W; x >= 0; x -= 12) ctx.lineTo(x, yAt(x) + 46);
            ctx.closePath();
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    },

    ground: [[0, '#f6fbff'], [0.2, '#dcecf8'], [1, '#a6c3da']],
    track: { tie: '#56677a', rail: '#d6ecfa' },

    // Snow ridges: the shared ridge terrain, a touch lower than the rest.
    terrain(finishX) {
        const hills = makeSaharaHills(finishX, 0.8);
        return {
            elevation: (x) => getBumpElevation(x, hills),
            slope: (x) => getBumpSlope(x, hills),
            ampMax: Math.max(...hills.map(h => h.amp)),
        };
    },

    layers: {
        // Far: icy blue peaks with bright snow caps.
        mountains: {
            spawn(x) {
                const w = 120 + Math.random() * 190;
                const h = 70 + Math.random() * 110;
                const hue = 202 + Math.random() * 14;
                return {
                    x, w, h, peakX: w * (0.3 + Math.random() * 0.4),
                    color: `hsl(${hue},38%,64%)`, shadow: `hsl(${hue + 4},44%,48%)`,
                    snowH: h * (0.35 + Math.random() * 0.2),
                };
            },
            draw(ctx, obj, sx, game) { game.drawMountain(ctx, obj, sx); },
        },
        // Mid: snow-laden pines in small groves.
        trees: {
            spawn(x) {
                const n = 1 + Math.floor(Math.random() * 3);
                const trees = [];
                let dx = 0;
                for (let i = 0; i < n; i++) {
                    trees.push({ dx, h: 34 + Math.random() * 34, w: 20 + Math.random() * 12 });
                    dx += 18 + Math.random() * 22;
                }
                return { x, trees };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev;
                for (const t of obj.trees) {
                    const cx = sx + t.dx;
                    ctx.fillStyle = '#5b4636';
                    ctx.fillRect(cx - 2, by - 6, 4, 8);
                    for (let k = 0; k < 3; k++) {
                        const w = t.w * (1 - k * 0.28);
                        const top = by - 6 - t.h * (k + 1) / 3;
                        const bot = by - 6 - t.h * k / 3 + 2;
                        ctx.fillStyle = '#2f5d58';
                        ctx.beginPath();
                        ctx.moveTo(cx, top);
                        ctx.lineTo(cx + w / 2, bot);
                        ctx.lineTo(cx - w / 2, bot);
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = '#f4fbff';  // snow on the upper half of each tier
                        ctx.beginPath();
                        ctx.moveTo(cx, top);
                        ctx.lineTo(cx + w * 0.28, top + (bot - top) * 0.55);
                        ctx.lineTo(cx - w * 0.28, top + (bot - top) * 0.55);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
            },
        },
        // Near: snow mounds, some with ice crystals.
        rocks: {
            spawn(x) {
                return { x, w: 30 + Math.random() * 46, h: 8 + Math.random() * 12, crystal: Math.random() < 0.4 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 14 - elev;
                ctx.fillStyle = '#c4dcee';
                ctx.beginPath();
                ctx.ellipse(sx + obj.w / 2, by + 2, obj.w / 2, obj.h * 0.9, 0, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(sx + obj.w / 2, by, obj.w / 2, obj.h, 0, Math.PI, 0);
                ctx.fill();
                if (obj.crystal) {
                    ctx.fillStyle = 'rgba(140,210,245,0.9)';
                    const cx = sx + obj.w * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(cx, by - obj.h - 12);
                    ctx.lineTo(cx + 5, by - obj.h + 2);
                    ctx.lineTo(cx - 5, by - obj.h + 2);
                    ctx.closePath();
                    ctx.fill();
                }
            },
        },
    },

    // Falling snow, with a little parallax from the camera.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 70; i++) {
            const par = 0.4 + ThemeKit.hash(i + 7) * 0.9;
            const x = ((ThemeKit.hash(i) * W - game.cameraX * par + Math.sin(t + i) * 12) % W + W) % W;
            const y = ((ThemeKit.hash(i + 31) * H + t * (28 + ThemeKit.hash(i + 53) * 44)) % H + H) % H;
            const r = 1 + ThemeKit.hash(i + 71) * 1.6;
            ctx.globalAlpha = 0.55 + 0.35 * ThemeKit.hash(i + 13);
            ctx.fillRect(x, y, r, r);
        }
        ctx.globalAlpha = 1;
    },

    mechanic: {
        marks: { kind: 'frost', trigger: 'ambient', rate: 0.02, r: [4, 9], y: [8, 42], life: 30, perPart: 8 },
        // Ice shards and powder thrown up off the slick rails as the wheels skate along.
        fx: [
            { kind: 'ice', trigger: 'ambient', rate: 0.14, r: [1.5, 3], y: [2, 8], vx: [-2.2, 0.2], vy: [1.5, 4], g: 0.18, life: [0.4, 0.8], inherit: 0.85 },
            { kind: 'powder', trigger: 'ambient', rate: 0.09, r: [2, 4], y: [1, 5], vx: [-1.5, 0], vy: [0.3, 1.2], g: -0.02, life: [0.7, 1.2], inherit: 0.7 },
        ],
        physics: { inertia: 0.5 },

        // The rails gleam: a glossy band across both lanes with drifting glints.
        drawZones(ctx, state, game, pass) {
            if (pass !== 'ground') return;
            const v = ThemeKit.visible(game, 40);
            ThemeKit.laneStrip(ctx, game, v.x0, v.x1, 'rgba(188,224,250,0.5)', 6);
            const t = Date.now() / 700;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const cell = 110;
            for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
                const h = ThemeKit.hash(c);
                if (h < 0.45) continue;
                const x = c * cell + h * 60;
                const y = TRACK_BACK + 14 + h * 34 - game.getElevation(x);
                const sx = ThemeKit.sx(game, x);
                ctx.globalAlpha = 0.35 + 0.4 * Math.sin(t + c);
                ctx.beginPath();
                ctx.moveTo(sx, y);
                ctx.lineTo(sx + 26 + h * 20, y - 6);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        },
    },
});
