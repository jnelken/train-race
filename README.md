# train-race

A browser-based side-scrolling train racing game with terrain physics, sprite-based graphics, and multiple environment themes. Trains race across procedurally segmented terrain — through the Sahara, city blocks, mountain passes, and a cloud-rainbow-candy world — with slope physics affecting speed and momentum. Built entirely in vanilla JavaScript with the Canvas API.

**Current progress:** Fully playable. The core game engine (65KB) implements terrain generation with elevation curves, slope physics with gravity, camera following with lerp smoothing, a sprite system, and a win-scaled 20,000–30,000-unit world with a finish line. Themes include Sahara, city, mountain, and cloud-rainbow-candy.

**Final objective:** A polished, shareable browser game. Potential additions include multiplayer racing, more biome themes, and a high-score system.

## Tech Stack

- **Language:** Vanilla JavaScript
- **Rendering:** Canvas API
- **Serving:** Static HTML with `serve`
