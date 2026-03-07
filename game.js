const FINISH_LINE_WORLD_X = 10000;
const TRAIN_WIDTH  = 160;  // 40px * 4 scale
const TRAIN_HEIGHT = 72;   // body (64px) + wheels protrude 8px below body origin
const CAMERA_LERP  = 0.08;

// Track ground-line y positions (where wheel bottoms sit)
const TRACK_BACK  = 252;   // opponent — higher = visually further back
const TRACK_FRONT = 278;   // player  — lower  = visually in front

class TrainGame {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.renderer = new SpriteRenderer(this.canvas, 4);

        this.train = {
            worldX: 0,
            y: TRACK_FRONT - TRAIN_HEIGHT,  // wheels sit on front track
            vx: 0,
            maxSpeed: 8,
            acceleration: 0.2,
            friction: 0.95,
        };

        this.cameraX = 0;

        const equilibriumSpeed = this.train.acceleration / (1 - this.train.friction);
        this.opponent = {
            worldX: -200,
            y: TRACK_BACK - TRAIN_HEIGHT,   // wheels sit on back track
            vx: 0,
            topSpeed: equilibriumSpeed * 0.88,
            wheelFrame: 0,
            initialRampDone: false,
        };

        this.gameState = {
            distance: 0,
            time: 0,
            isRunning: true,
            result: null,
        };

        this.wheelFrame = 0;
        this.wheelAnimationSpeed = 0.15;

        this.layers = [
            { name: 'mountains', speed: 0.3, objects: [], nextSpawnX: 0 },
            { name: 'trees',     speed: 0.6, objects: [], nextSpawnX: 0 },
            { name: 'rocks',     speed: 0.9, objects: [], nextSpawnX: 0 },
        ];

        this.generateInitialScenery();

        this.keys = {};
        this.setupInputListeners();

        this.lastTime = Date.now();
        this.gameLoop();
    }

    worldToScreen(worldX) {
        return worldX - this.cameraX + this.canvas.width / 2 - TRAIN_WIDTH / 2;
    }

    generateInitialScenery() {
        for (let layer of this.layers) {
            let x = 0;
            while (x < this.canvas.width * 2) {
                this.spawnObjectForLayer(layer, x);
                x += Math.random() * 200 + 150;
            }
        }
    }

    spawnObjectForLayer(layer, x) {
        let sprite, y;
        if (layer.name === 'mountains') {
            sprite = SCENERY_SPRITES.mountain;
            y = 90;
        } else if (layer.name === 'trees') {
            sprite = SCENERY_SPRITES.tree;
            y = TRACK_BACK - 40;   // sit just above back track
        } else {
            sprite = SCENERY_SPRITES.rock;
            y = TRACK_FRONT - 12;  // sit just above front track
        }
        layer.objects.push({ x, sprite, y });
    }

    setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key] = true;
            if (e.key === 'ArrowRight' || e.key === 'd')
                this.train.vx = Math.min(this.train.vx + this.train.acceleration, this.train.maxSpeed);
            if (e.key === 'ArrowLeft' || e.key === 'a')
                this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.train.maxSpeed * 0.5);
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key] = false; });
    }

    checkFinish() {
        const playerFinished   = this.train.worldX    >= FINISH_LINE_WORLD_X;
        const opponentFinished = this.opponent.worldX >= FINISH_LINE_WORLD_X;
        if (playerFinished || opponentFinished) {
            this.gameState.isRunning = false;
            if (playerFinished && opponentFinished) this.gameState.result = 'tie';
            else if (playerFinished)                this.gameState.result = 'win';
            else                                    this.gameState.result = 'lose';
        }
    }

    update(deltaTime) {
        if (this.keys['ArrowRight'] || this.keys['d'])
            this.train.vx = Math.min(this.train.vx + this.train.acceleration, this.train.maxSpeed);
        if (this.keys['ArrowLeft'] || this.keys['a'])
            this.train.vx = Math.max(this.train.vx - this.train.acceleration, -this.train.maxSpeed * 0.5);

        this.train.vx    *= this.train.friction;
        this.train.worldX += this.train.vx;
        this.cameraX     += (this.train.worldX - this.cameraX) * CAMERA_LERP;

        if (this.train.vx > 0) this.gameState.distance += this.train.vx;

        this.wheelFrame += Math.abs(this.train.vx) * this.wheelAnimationSpeed;
        if (this.wheelFrame >= TRAIN_SPRITES.wheels.length) this.wheelFrame = 0;

        for (let layer of this.layers) {
            const layerScroll = this.cameraX * layer.speed;
            layer.objects = layer.objects.filter(obj => {
                const sx = obj.x - layerScroll;
                return sx > -200 && sx < this.canvas.width + 200;
            });
            const rightmost = layer.objects.length > 0
                ? Math.max(...layer.objects.map(o => o.x))
                : this.train.worldX;
            while (rightmost + layer.nextSpawnX < this.train.worldX + this.canvas.width * 1.5) {
                this.spawnObjectForLayer(layer, rightmost + 150 + Math.random() * 200);
                layer.nextSpawnX += 150 + Math.random() * 200;
            }
        }

        const gap = this.opponent.worldX - this.train.worldX;
        const tooFarAhead  =  this.canvas.width * 0.55;
        const tooFarBehind = -this.canvas.width * 0.55;

        let targetSpeed;
        if      (gap > tooFarAhead)  targetSpeed = this.opponent.topSpeed * 0.4;
        else if (gap < tooFarBehind) targetSpeed = Math.max(this.train.vx + 1.5, this.opponent.topSpeed);
        else                         targetSpeed = this.opponent.topSpeed * 0.85;

        const diff = targetSpeed - this.opponent.vx;
        if (!this.opponent.initialRampDone) {
            this.opponent.vx += diff * 0.08;
            if (Math.abs(diff) < 0.05) this.opponent.initialRampDone = true;
        } else {
            const maxDelta = this.opponent.topSpeed / (15 * 60);
            this.opponent.vx += Math.sign(diff) * Math.min(Math.abs(diff), maxDelta);
        }

        this.opponent.worldX    += this.opponent.vx;
        this.opponent.wheelFrame += this.opponent.vx * this.wheelAnimationSpeed;
        if (this.opponent.wheelFrame >= TRAIN_SPRITES.wheels.length) this.opponent.wheelFrame = 0;

        this.checkFinish();
        this.gameState.time += deltaTime;
    }

    // Draw a single track (rails + scrolling ties) at a given ground y
    drawTrack(ctx, groundY, scrollSpeed) {
        const offset = (this.cameraX * scrollSpeed) % 24;

        // Ties (wooden sleepers)
        ctx.fillStyle = '#5C3D1E';
        for (let x = -offset; x < this.canvas.width + 24; x += 24) {
            ctx.fillRect(x - 1, groundY - 5, 7, 5);
        }
        // Rails
        ctx.fillStyle = '#A0A0A0';
        ctx.fillRect(0, groundY - 6, this.canvas.width, 2);
        ctx.fillRect(0, groundY - 2, this.canvas.width, 2);
    }

    drawFinishLine(ctx) {
        const screenX = this.worldToScreen(FINISH_LINE_WORLD_X);
        if (screenX < -24 || screenX > this.canvas.width + 24) return;
        const tileSize = 8;
        for (let y = 0; y < this.canvas.height; y += tileSize) {
            for (let col = 0; col < 3; col++) {
                ctx.fillStyle = (Math.floor(y / tileSize) + col) % 2 === 0 ? '#111' : '#fff';
                ctx.fillRect(screenX + col * tileSize, y, tileSize, tileSize);
            }
        }
    }

    drawResult(ctx) {
        const { result } = this.gameState;
        const label = result === 'win' ? 'YOU WIN!' : result === 'lose' ? 'YOU LOSE' : 'TIE!';
        const color = result === 'win' ? '#2ecc71'  : result === 'lose' ? '#e74c3c'  : '#f1c40f';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.font = 'bold 72px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(label, this.canvas.width / 2, this.canvas.height / 2 - 10);
        ctx.font = '24px monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText('Refresh to play again', this.canvas.width / 2, this.canvas.height / 2 + 40);
        ctx.textAlign = 'left';
    }

    draw() {
        const ctx = this.renderer.ctx;
        const W = this.canvas.width, H = this.canvas.height;

        // Sky — gradient from blue to greenish horizon
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0,    '#87CEEB');  // sky blue
        sky.addColorStop(0.55, '#B8E0A0');  // light green at horizon
        sky.addColorStop(0.62, '#8B7355');  // hard cut to ground
        sky.addColorStop(1,    '#6b5335');  // darker earth
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Mountains (back parallax — drawn over sky)
        const mountainScroll = this.cameraX * 0.3;
        for (let obj of this.layers.find(l => l.name === 'mountains').objects) {
            this.renderer.renderSprite(obj.sprite, obj.x - mountainScroll, obj.y);
        }

        // Trees (mid parallax — between tracks)
        const treeScroll = this.cameraX * 0.6;
        for (let obj of this.layers.find(l => l.name === 'trees').objects) {
            this.renderer.renderSprite(obj.sprite, obj.x - treeScroll, obj.y);
        }

        // Back track + opponent train
        this.drawTrack(ctx, TRACK_BACK, 0.85);

        // Opponent — uses opponent.y so it sits on the back track
        const opponentScreenX = this.worldToScreen(this.opponent.worldX);
        this.renderer.renderSprite(OPPONENT_SPRITES.idle[0], opponentScreenX, this.opponent.y);
        this.renderer.renderSprite(
            OPPONENT_SPRITES.wheels[Math.floor(this.opponent.wheelFrame)],
            opponentScreenX, this.opponent.y + 40
        );

        // Rocks (foreground parallax — near front track)
        const rockScroll = this.cameraX * 0.9;
        for (let obj of this.layers.find(l => l.name === 'rocks').objects) {
            this.renderer.renderSprite(obj.sprite, obj.x - rockScroll, obj.y);
        }

        // Front track + player train
        this.drawTrack(ctx, TRACK_FRONT, 1.0);
        this.drawFinishLine(ctx);

        const trainScreenX = this.worldToScreen(this.train.worldX);
        this.renderer.renderSprite(TRAIN_SPRITES.idle[0], trainScreenX, this.train.y);
        this.renderer.renderSprite(
            TRAIN_SPRITES.wheels[Math.floor(this.wheelFrame)],
            trainScreenX, this.train.y + 40
        );

        if (this.gameState.result) this.drawResult(ctx);

        document.getElementById('speed').textContent = Math.round(this.train.vx * 10) / 10;
        document.getElementById('distance').textContent =
            `${Math.round(this.gameState.distance)} / ${FINISH_LINE_WORLD_X}`;
    }

    gameLoop = () => {
        const now = Date.now();
        const deltaTime = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (this.gameState.isRunning) this.update(deltaTime);
        this.draw();
        requestAnimationFrame(this.gameLoop);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    new TrainGame('gameCanvas');
});
