// Volcano Rim — VENTS: vents on the track erupt on a timer. They glow and shake before
// they blow; a train caught on a vent while it erupts is knocked almost to a stop.
// The cycle is the same for both trains, so time your approach with boost taps.
const VOLCANO_PERIOD = 6.0;   // seconds per vent cycle
const VOLCANO_WARN   = 1.5;   // glow + shake before the blast
const VOLCANO_BLAST  = 1.1;   // seconds the vent is erupting

registerTheme({
    id: 'volcano',
    name: 'Volcano Rim',
    hint: 'VENTS erupt on a timer. Do not be on one when it blows!',

    sky: [[0, '#180808'], [0.4, '#4a1410'], [0.8, '#c2461a'], [1, '#f08a2a']],
    ground: [[0, '#4d3c39'], [0.25, '#2f2524'], [1, '#161010']],
    track: { tie: '#2a2020', rail: '#a69a94' },

    // A hazy glow behind the cones and drifting ash.
    drawSky(ctx, game, W, H) {
        const glow = ctx.createRadialGradient(W * 0.7, HORIZON_Y, 10, W * 0.7, HORIZON_Y, W * 0.7);
        glow.addColorStop(0, 'rgba(255,150,40,0.45)');
        glow.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
    },

    terrain(finishX) {
        return hillTerrain(finishX, { maxHeight: 900, rolliness: 0.25 });
    },

    // Glowing lava cracks in the rock.
    drawGround(ctx, game, W, H) {
        const t = Date.now() / 1000;
        const v = ThemeKit.visible(game, 60);
        const cell = 170;
        ctx.lineJoin = 'round';
        for (let c = Math.floor(v.x0 / cell); c <= Math.ceil(v.x1 / cell); c++) {
            const h = ThemeKit.hash(c * 3);
            if (h < 0.35) continue;
            const x = c * cell + h * 90;
            const y0 = HORIZON_Y - game.getElevation(x) + 16 + ThemeKit.hash(c) * 150;
            const pts = [];
            for (let k = 0; k < 5; k++) {
                pts.push([ThemeKit.sx(game, x) + k * 17, y0 + (ThemeKit.hash(c * 7 + k) - 0.5) * 14]);
            }
            const pulse = 0.55 + 0.35 * Math.sin(t * 1.6 + c);
            for (const [w, col] of [[5, `rgba(255,90,20,${0.25 * pulse})`], [2, `rgba(255,200,80,${pulse})`]]) {
                ctx.strokeStyle = col;
                ctx.lineWidth = w;
                ctx.beginPath();
                pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
                ctx.stroke();
            }
        }
    },

    layers: {
        // Far: volcano cones with glowing craters and smoke.
        mountains: {
            spawn(x) {
                const w = 160 + Math.random() * 200;
                return { x, w, h: 70 + Math.random() * 100, peakX: w / 2, crater: 0.14 + Math.random() * 0.1, seed: Math.random() * 10 };
            },
            draw(ctx, obj, sx) {
                const base = HORIZON_Y, cw = obj.w * obj.crater, topY = base - obj.h, mid = sx + obj.peakX;
                ctx.fillStyle = '#35252a';
                ctx.beginPath();
                ctx.moveTo(sx, base);
                ctx.lineTo(mid - cw, topY);
                ctx.lineTo(mid + cw, topY);
                ctx.lineTo(sx + obj.w, base);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#251a1f';
                ctx.beginPath();
                ctx.moveTo(mid + cw, topY);
                ctx.lineTo(sx + obj.w, base);
                ctx.lineTo(mid + obj.w * 0.12, base);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#ff8a22';
                ctx.beginPath();
                ctx.ellipse(mid, topY, cw, 4, 0, 0, Math.PI * 2);
                ctx.fill();
                const t = Date.now() / 1000;
                for (let i = 0; i < 3; i++) {
                    const p = (t * 0.25 + i / 3 + obj.seed) % 1;
                    ctx.fillStyle = `rgba(70,55,58,${0.5 * (1 - p)})`;
                    ctx.beginPath();
                    ctx.arc(mid + Math.sin(p * 5 + obj.seed) * 8, topY - p * 60, 7 + p * 14, 0, Math.PI * 2);
                    ctx.fill();
                }
            },
        },
        // Mid: charred, leafless trees.
        trees: {
            spawn(x) {
                return { x, h: 28 + Math.random() * 30, branches: 2 + Math.floor(Math.random() * 3), seed: Math.random() * 10 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = HORIZON_Y - elev;
                ctx.strokeStyle = '#150f10';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(sx, by + 2);
                ctx.lineTo(sx, by - obj.h);
                for (let i = 0; i < obj.branches; i++) {
                    const y = by - obj.h * (0.35 + i * 0.2);
                    const d = (i % 2 ? 1 : -1) * (8 + obj.seed % 5);
                    ctx.moveTo(sx, y);
                    ctx.lineTo(sx + d, y - 10);
                }
                ctx.stroke();
            },
        },
        // Near: obsidian shards with an ember glint.
        rocks: {
            spawn(x) {
                return { x, w: 18 + Math.random() * 26, h: 10 + Math.random() * 16, glint: Math.random() < 0.5 };
            },
            draw(ctx, obj, sx, game, elev) {
                const by = TRACK_FRONT - 12 - elev;
                ctx.fillStyle = '#1b1416';
                ctx.beginPath();
                ctx.moveTo(sx, by + 2);
                ctx.lineTo(sx + obj.w * 0.3, by - obj.h);
                ctx.lineTo(sx + obj.w * 0.62, by - obj.h * 0.5);
                ctx.lineTo(sx + obj.w, by + 2);
                ctx.closePath();
                ctx.fill();
                if (obj.glint) {
                    ctx.fillStyle = 'rgba(255,140,40,0.8)';
                    ctx.fillRect(sx + obj.w * 0.3, by - obj.h + 2, 3, 3);
                }
            },
        },
    },

    // Rising embers and falling ash.
    drawFx(ctx, game, W, H) {
        const t = Date.now() / 1000;
        for (let i = 0; i < 46; i++) {
            const ember = i % 3 === 0;
            const par = 0.5 + ThemeKit.hash(i + 5) * 0.7;
            const x = ((ThemeKit.hash(i) * W - game.cameraX * par + Math.sin(t * 0.8 + i) * 14) % W + W) % W;
            const speed = ember ? -34 : 22;
            const y = ((ThemeKit.hash(i + 21) * H + t * speed * (0.6 + ThemeKit.hash(i + 9))) % H + H) % H;
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = ember ? '#ffae3a' : '#a89a96';
            ctx.fillRect(x, y, ember ? 2 : 2.5, ember ? 2 : 2.5);
        }
        ctx.globalAlpha = 1;
    },

    mechanic: {
        marks: { kind: 'lava', trigger: 'penalty', rate: 0.16, r: [4, 9], y: [8, 40], hot: 7, perPart: 16 },
        // A car caught on a blowing vent throws sparks off its wheels.
        fx: { kind: 'ember', trigger: 'penalty', rate: 0.55, n: 2, r: [1.5, 3], vx: [-3, 0.5], vy: [3, 7], g: 0.28, life: [0.4, 0.9], inherit: 0.8 },
        init(game) {
            const count = Math.max(6, Math.round(game.finishLineWorldX / 1800));
            const zones = ThemeKit.placeZones(game, { count, lenMin: 190, lenMax: 240, margin: 1400, gap: 350 });
            zones.forEach((z, i) => { z.offset = ThemeKit.hash(i * 11 + 3) * VOLCANO_PERIOD; });
            return { zones };
        },

        // A vent mid-blast almost stops anything on top of it (0.12 of normal speed).
        speedMult(state, x, t) {
            for (const z of state.zones) {
                if (x < z.x0 || x > z.x1) continue;
                const p = ThemeKit.pulse(t, VOLCANO_PERIOD, VOLCANO_WARN, VOLCANO_BLAST, z.offset);
                return p.phase === 'active' ? 0.12 : 1;
            }
            return 1;
        },

        drawZones(ctx, state, game, pass) {
            const t = game.gameState.time;
            const clock = Date.now() / 1000;
            for (const z of state.zones) {
                const p = ThemeKit.pulse(t, VOLCANO_PERIOD, VOLCANO_WARN, VOLCANO_BLAST, z.offset);
                const cx = (z.x0 + z.x1) / 2;
                const sx = ThemeKit.sx(game, cx);
                const baseY = TRACK_FRONT - game.getElevation(cx) + 6;
                if (pass === 'ground') {
                    if (!ThemeKit.laneStrip(ctx, game, z.x0, z.x1, '#241818', 4)) continue;
                    const heat = p.phase === 'warn' ? 0.35 + 0.5 * Math.abs(Math.sin(p.t * Math.PI * 5))
                        : p.phase === 'active' ? 1 : 0.18;
                    ThemeKit.laneStrip(ctx, game, z.x0 + 30, z.x1 - 30, `rgba(255,${100 + 80 * heat},20,${0.35 + 0.6 * heat})`, 0);
                } else if (pass === 'over') {
                    if (sx < -120 || sx > game.canvas.width + 120) continue;
                    if (p.phase === 'warn') {
                        // Warning triangle that blinks faster as the blast nears.
                        const on = Math.sin(p.t * p.t * 40 + clock) > -0.3;
                        if (on) {
                            const y = baseY - 118;
                            ctx.fillStyle = '#ffd23a';
                            ctx.beginPath();
                            ctx.moveTo(sx, y - 12);
                            ctx.lineTo(sx + 12, y + 8);
                            ctx.lineTo(sx - 12, y + 8);
                            ctx.closePath();
                            ctx.fill();
                            ctx.fillStyle = '#4a1410';
                            ctx.fillRect(sx - 1.5, y - 4, 3, 8);
                        }
                    } else if (p.phase === 'active') {
                        // Lava spout: tall gradient column with sparks.
                        const rise = Math.min(p.t * 4, 1);
                        const h = 150 * rise * (1 - 0.3 * p.t);
                        const grad = ctx.createLinearGradient(0, baseY, 0, baseY - h);
                        grad.addColorStop(0, 'rgba(255,230,120,0.95)');
                        grad.addColorStop(0.5, 'rgba(255,130,30,0.85)');
                        grad.addColorStop(1, 'rgba(200,40,10,0)');
                        ctx.fillStyle = grad;
                        ctx.beginPath();
                        ctx.moveTo(sx - 34, baseY);
                        ctx.lineTo(sx - 14, baseY - h);
                        ctx.lineTo(sx + 14, baseY - h);
                        ctx.lineTo(sx + 34, baseY);
                        ctx.closePath();
                        ctx.fill();
                        ctx.fillStyle = '#ffd36a';
                        for (let i = 0; i < 10; i++) {
                            const a = ThemeKit.hash(i + Math.floor(clock * 14)) - 0.5;
                            ctx.fillRect(sx + a * 90, baseY - h * ThemeKit.hash(i * 5 + 2) - 10, 3, 3);
                        }
                    }
                    this.drawVentSmoke(ctx, sx, baseY, p, clock);
                    this.drawVentGobs(ctx, game, z, t, baseY);
                }
            }
        },

        // Smoke curling off a vent: faint while it sleeps, thick as the blast nears.
        drawVentSmoke(ctx, sx, baseY, p, clock) {
            const heat = p.phase === 'warn' ? 0.5 + 0.5 * p.t : p.phase === 'idle' ? 0.35 : 0;
            if (heat <= 0) return;
            for (let i = 0; i < 6; i++) {
                const q = (clock * 0.45 + i / 6) % 1;
                ctx.fillStyle = `rgba(62,48,50,${0.42 * (1 - q) * heat})`;
                ctx.beginPath();
                ctx.arc(sx + Math.sin(q * 5 + i * 2.1) * 7 * (1 + q), baseY - 4 - q * 72 * heat, 5 + q * 12, 0, Math.PI * 2);
                ctx.fill();
            }
        },

        // Gobs of lava thrown up when a vent blows. Each follows a ballistic arc (same cycle
        // for both trains), glows as it flies, and splats on the ground where it lands.
        drawVentGobs(ctx, game, z, t, baseY) {
            const c = (((t + z.offset) % VOLCANO_PERIOD) + VOLCANO_PERIOD) % VOLCANO_PERIOD;
            const blastAt = VOLCANO_PERIOD - VOLCANO_BLAST;
            const since = c >= blastAt ? c - blastAt : c + VOLCANO_BLAST;
            if (since > VOLCANO_BLAST + 2.2) return;
            const cycle = Math.floor((t + z.offset) / VOLCANO_PERIOD) - (c >= blastAt ? 0 : 1);
            const cx = (z.x0 + z.x1) / 2;
            for (let i = 0; i < 14; i++) {
                const h = (k) => ThemeKit.hash(cycle * 31 + z.x0 * 0.01 + i * 5.3 + k);
                const f = (since - h(3) * 0.6) * 60;          // frames since this gob left the vent
                if (f < 0) continue;
                const ang = (h(1) - 0.5) * 1.5, v = 6 + h(2) * 6.5, g = 0.3;
                const x = cx + Math.sin(ang) * v * f, up = Math.cos(ang) * v * f - 0.5 * g * f * f;
                const sx = ThemeKit.sx(game, x), r = 2.5 + h(4) * 2.5;
                if (up < 0) {                                  // landed: a cooling splat
                    const age = (f - 2 * Math.cos(ang) * v / g) / 60;
                    if (age > 0.9) continue;
                    ctx.fillStyle = `rgba(255,${Math.round(120 + 80 * (1 - age))},30,${0.8 * (1 - age / 0.9)})`;
                    ctx.beginPath();
                    ctx.ellipse(sx, baseY - game.getElevation(x) + 2, r * 1.8, r * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    continue;
                }
                const y = baseY - game.getElevation(x) - up;
                const vy = Math.cos(ang) * v - g * f, vx = Math.sin(ang) * v;
                ctx.strokeStyle = 'rgba(255,120,30,0.55)';
                ctx.lineWidth = r;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(sx, y);
                ctx.lineTo(sx - vx * 2.4, y + vy * 2.4);
                ctx.stroke();
                ctx.fillStyle = '#ff9a2a';
                ctx.beginPath();
                ctx.arc(sx, y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffe9a0';
                ctx.beginPath();
                ctx.arc(sx - r * 0.2, y - r * 0.2, r * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.lineCap = 'butt';
        },

        minimapMarks(state) {
            return state.zones.map(z => ({ x0: z.x0, x1: z.x1, color: '#ff7a1a' }));
        },
    },
});
