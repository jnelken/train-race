// Sugar Hills — SYRUP: caramel pools across both rails slow every train that crosses them. A second
// candy world built on the shared hill generator: tall, wide rolling hills with no flat plains, in
// mint, lavender and peach instead of the pink of Candy Clouds. Boost taps push through the syrup.

// Sticky caramel drips clinging to the cars, with a glossy highlight.
ThemeKit.marks.syrup = (ctx, m, x, y, age) => {
    const h = (k) => ThemeKit.hash(m.seed + k);
    const len = m.r * (1.6 + h(1) * 1.8) + Math.min(age * 1.5, 4);
    ctx.fillStyle = h(0) > 0.5 ? 'rgba(176,96,34,0.8)' : 'rgba(205,128,48,0.8)';
    ctx.beginPath();
    ctx.ellipse(x, y, m.r * 1.1, m.r * 0.8, 0, 0, Math.PI * 2);   // the splat
    ctx.fill();
    ctx.fillRect(x - m.r * 0.35, y, m.r * 0.7, len);               // the drip
    ctx.beginPath();
    ctx.arc(x, y + len, m.r * 0.5, 0, Math.PI * 2);                // the bead
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,170,0.75)';
    ctx.fillRect(x - m.r * 0.5, y - m.r * 0.4, m.r * 0.5, 1.6);
};

// A blob of syrup flung off a wheel.
ThemeKit.fx.syrup = (ctx, p, x, y, k) => {
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
    ctx.fillStyle = ThemeKit.hash(p.seed) > 0.5 ? '#b0601f' : '#d0802f';
    ctx.beginPath();
    ctx.ellipse(x, y, p.r * 1.2, p.r * (p.landed ? 0.5 : 1), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,170,0.8)';
    ctx.fillRect(x - p.r * 0.5, y - p.r * 0.5, 1.4, 1.4);
};

function sugarLolly(ctx, sx, by, h, r, hue) {
    ctx.fillStyle = '#f6efe4';
    ctx.fillRect(sx - 2, by - h, 4, h + 3);
    ctx.fillStyle = `hsl(${hue},70%,72%)`;
    ctx.beginPath();
    ctx.arc(sx, by - h, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue + 30},75%,90%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < 9; a += 0.4) {
        const rr = (a / 9) * (r - 2);
        const px = sx + Math.cos(a * 1.9) * rr, py = by - h + Math.sin(a * 1.9) * rr;
        a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
}

registerTheme({
    id: 'candy2',
    name: 'Sugar Hills',
    hint: 'SYRUP: caramel pools slow you down. Tap to push through!',

    sky: [[0, '#8fd6d0'], [0.5, '#c7e8ee'], [1, '#fbe4ea']],
    lightHud: true,
    ground: [[0, '#9fe0b8'], [0.3, '#7cc9a2'], [1, '#4f9f86']],
    track: { tie: '#b5838d', rail: '#fff3f6' },

    // Big rolling hills with no flat stretches.
    terrain(finishX) {
        return hillTerrain(finishX, { maxHeight: 800, rolliness: 0.9 });
    },

    layers: {
        // Far: cotton-candy mounds in lavender and peach.
        mountains: {
            spawn(x) {
                return { x, w: 170 + Math.random() * 220, h: 50 + Math.random() * 80, hue: Math.random() < 0.5 ? 275 + Math.random() * 20 : 20 + Math.random() * 15 };
            },
            draw(ctx, obj, sx) {
                const base = HORIZON_Y;
                ctx.fillStyle = `hsl(${obj.hue},60%,82%)`;
                ctx.beginPath();
                ctx.moveTo(sx, base);
                ctx.bezierCurveTo(sx + obj.w * 0.15, base - obj.h * 1.3, sx + obj.w * 0.85, base - obj.h * 1.3, sx + obj.w, base);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.ellipse(sx + obj.w * 0.4, base - obj.h * 0.8, obj.w * 0.16, obj.h * 0.16, 0, 0, Math.PI * 2);
                ctx.fill();
            },
        },
        // Mid: swirl lollipops.
        trees: {
            spawn(x) {
                return { x, h: 40 + Math.random() * 40, r: 12 + Math.random() * 10, hue: [330, 170, 45, 270][Math.floor(Math.random() * 4)] };
            },
            draw(ctx, obj, sx, game, elev) {
                sugarLolly(ctx, sx, HORIZON_Y - elev, obj.h, obj.r, obj.hue);
            },
        },
        // Near: gumdrops.
        rocks: {
            spawn(x) {
                return { x, s: 0.8 + Math.random() * 0.8, hue: [350, 160, 40, 280][Math.floor(Math.random() * 4)] };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev;
                ctx.fillStyle = `hsl(${obj.hue},75%,68%)`;
                ctx.beginPath();
                ctx.ellipse(sx, by - 7 * obj.s, 12 * obj.s, 9 * obj.s, 0, Math.PI, 0);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillRect(sx - 6 * obj.s, by - 13 * obj.s, 4 * obj.s, 2);
            },
        },
    },

    // Drifting sugar sparkles.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        for (let i = 0; i < 40; i++) {
            const x = ((ThemeKit.hash(i) * W * 1.2 - game.cameraX * 0.5 - t * 14) % (W * 1.2) + W * 1.2) % (W * 1.2) - 20;
            const y = ((ThemeKit.hash(i + 11) * H * 0.7 + t * 10) % (H * 0.7));
            ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.abs(Math.sin(t * 1.5 + i))})`;
            ctx.fillRect(x, y, 2, 2);
        }
    },

    mechanic: {
        marks: { kind: 'syrup', trigger: 'penalty', rate: 0.22, r: [3, 7], y: [20, 42], life: 55, perPart: 16 },
        fx: { kind: 'syrup', trigger: 'penalty', rate: 0.7, r: [1.8, 4], vx: [-2.4, -0.3], vy: [2, 5], g: 0.3, life: [0.5, 1.3], land: 'splat', inherit: 0.9 },
        init(game) {
            const count = Math.max(4, Math.round(game.finishLineWorldX / 2900));
            return { zones: ThemeKit.placeZones(game, { count, lenMin: 350, lenMax: 600, margin: 1500, gap: 450 }) };
        },
        // 0.55 in the middle of a pool, easing in and out over 60 units.
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
                if (!ThemeKit.laneStrip(ctx, game, z.x0, z.x1, '#c9822f', 8)) continue;
                ThemeKit.laneStrip(ctx, game, z.x0 + 22, z.x1 - 22, '#a8651f', 2);
                const n = Math.floor((z.x1 - z.x0) / 55);
                for (let i = 0; i < n; i++) {
                    const x = z.x0 + 30 + (i / n) * (z.x1 - z.x0 - 60);
                    const y = TRACK_BACK + 2 + ThemeKit.hash(z.x0 + i) * 44 - game.getElevation(x);
                    const pulse = (t * 0.7 + ThemeKit.hash(i + z.x0)) % 1;
                    ctx.strokeStyle = `rgba(255,225,160,${0.7 * (1 - pulse)})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(ThemeKit.sx(game, x), y, 2 + pulse * 6, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
            ThemeKit.eachCar(game, (who, train, part, cx) => {
                if (train.vx < 1 || !state.zones.some(z => cx > z.x0 && cx < z.x1)) return;
                if (Math.abs(cx - game.cameraX) > game.canvas.width / 2 + 120) return;
                ctx.lineWidth = 1.5;
                TRAIN_RIG.wheelX.forEach((wx, i) => {
                    const x = cx - TRAIN_WIDTH + wx;
                    const q = (t * 1.4 + part * 0.37 + i * 0.25) % 1;
                    ctx.strokeStyle = `rgba(255,215,150,${0.7 * (1 - q)})`;
                    ctx.beginPath();
                    ctx.ellipse(ThemeKit.sx(game, x), ThemeKit.railY(game, who, x) - 2, 4 + q * 16, 1.5 + q * 5, 0, 0, Math.PI * 2);
                    ctx.stroke();
                });
            });
        },
        minimapMarks(state) {
            return state.zones.map(z => ({ x0: z.x0, x1: z.x1, color: '#c9822f' }));
        },
    },
});
