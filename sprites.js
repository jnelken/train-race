// Pixel color palette
const COLORS = {
    transparent: 'transparent',
    black: '#1a1a1a',
    darkGray: '#404040',
    gray: '#a0a0a0',
    lightGray: '#d0d0d0',
    red: '#e74c3c',
    darkRed: '#c0392b',
    blue: '#3498db',
    darkBlue: '#2980b9',
    white: '#ffffff',
    yellow: '#f1c40f',
    orange: '#e67e22',
    brown: '#8B7355',
    green: '#27ae60',
};

// Train sprite data - each frame is a pixel grid
// Scale: 1 pixel in grid = 4 pixels on screen
const TRAIN_SPRITES = {
    idle: [
        {
            width: 40,
            height: 16,
            pixels: [
                // Row 0
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                // Row 1 - Top stripe
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                // Row 2 - Red stripe
                [0,0,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,0,0,0],
                // Row 3 - Body start
                [0,2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2,0],
                // Row 4 - Windows row 1
                [0,2,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,3,2,0],
                // Row 5 - Windows row 2
                [0,2,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,8,3,3,8,8,8,3,2,0],
                // Row 6 - Doors row 1
                [0,2,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,3,2,0],
                // Row 7 - Doors row 2
                [0,2,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,4,3,4,4,4,4,3,2,0],
                // Row 8 - Body lower
                [0,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,0],
                // Row 9 - Connector
                [0,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,0],
                // Row 10 - Axle
                [0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],
                // Row 11 - Wheel area (animated separately)
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                // Row 12 - Wheel area
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                // Row 13
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                // Row 14
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                // Row 15
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            ],
            colorMap: {
                0: COLORS.transparent,
                1: COLORS.darkGray,
                2: COLORS.darkGray,
                3: COLORS.lightGray,
                4: COLORS.darkGray,
                5: COLORS.red,
                8: COLORS.blue,
            }
        }
    ],

    wheels: [
        // Wheel rotation frame 1
        {
            width: 40,
            height: 8,
            pixels: [
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            ],
            colorMap: {
                0: COLORS.transparent,
                1: COLORS.darkGray,
            }
        },
        // Wheel rotation frame 2
        {
            width: 40,
            height: 8,
            pixels: [
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            ],
            colorMap: {
                0: COLORS.transparent,
                1: COLORS.darkGray,
            }
        },
    ]
};

// Sprite renderer utility
class SpriteRenderer {
    constructor(canvas, pixelSize = 4) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.pixelSize = pixelSize;
    }

    renderSprite(sprite, x, y) {
        const { width, height, pixels, colorMap } = sprite;

        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const colorIndex = pixels[row][col];
                const color = colorMap[colorIndex];

                if (color !== COLORS.transparent) {
                    this.ctx.fillStyle = color;
                    this.ctx.fillRect(
                        x + col * this.pixelSize,
                        y + row * this.pixelSize,
                        this.pixelSize,
                        this.pixelSize
                    );
                }
            }
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Background scenery sprites
const SCENERY_SPRITES = {
    mountain: {
        width: 20,
        height: 12,
        pixels: [
            [0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0],
            [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
            [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
            [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
            [2,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2],
            [2,2,2,2,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2],
            [2,2,2,2,2,2,1,1,1,1,1,1,1,1,2,2,2,2,2,2],
        ],
        colorMap: {
            0: COLORS.transparent,
            1: COLORS.orange,
            2: COLORS.brown,
        }
    },
    tree: {
        width: 6,
        height: 10,
        pixels: [
            [0,0,3,3,0,0],
            [0,3,3,3,3,0],
            [0,3,3,3,3,0],
            [3,3,3,3,3,3],
            [3,3,3,3,3,3],
            [0,0,4,4,0,0],
            [0,0,4,4,0,0],
            [0,0,4,4,0,0],
            [0,0,4,4,0,0],
            [0,0,4,4,0,0],
        ],
        colorMap: {
            0: COLORS.transparent,
            3: COLORS.green,
            4: COLORS.brown,
        }
    },
    rock: {
        width: 5,
        height: 3,
        pixels: [
            [0,1,1,1,0],
            [1,1,1,1,1],
            [1,1,1,1,1],
        ],
        colorMap: {
            0: COLORS.transparent,
            1: COLORS.darkGray,
        }
    }
};

// Opponent train — same pixel data, different colorMap (blue line)
const OPPONENT_SPRITES = {
    idle: [
        {
            ...TRAIN_SPRITES.idle[0],
            colorMap: {
                0: COLORS.transparent,
                1: COLORS.darkGray,
                2: COLORS.darkGray,
                3: COLORS.lightGray,
                4: COLORS.darkGray,
                5: COLORS.blue,      // blue stripe instead of red
                8: COLORS.darkBlue,  // darker windows
            }
        }
    ],
    wheels: TRAIN_SPRITES.wheels,
};

// Export for use in game
window.TRAIN_SPRITES = TRAIN_SPRITES;
window.OPPONENT_SPRITES = OPPONENT_SPRITES;
window.SpriteRenderer = SpriteRenderer;
window.COLORS = COLORS;
window.SCENERY_SPRITES = SCENERY_SPRITES;
