// game.js - Core Game Engine for River Raid - Neon Edition

// Safe localStorage wrapper to prevent SecurityError on file:// protocol in some browsers
const safeStorage = {
    data: {},
    getItem(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            return this.data[key] || null;
        }
    },
    setItem(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            this.data[key] = String(value);
        }
    }
};
const localStorage = safeStorage;

class RiverRaidGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Game dimensions
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Game states
        this.state = 'MENU'; // MENU, PLAYING, RESPAWNING, CRASHED, GAMEOVER, PAUSED
        this.score = 0;
        this.highScore = 0;
        this.level = 1;
        this.lives = 4;
        this.baseScrollSpeed = 2.5;
        this.scrollSpeed = this.baseScrollSpeed;
        
        // Instantiate procedural level generator
        this.levelGen = new LevelGenerator(this.width, this.height);
        
        // Player properties
        this.player = {
            x: this.width / 2,
            y: this.height - 150,
            width: 34,
            height: 30,
            speedX: 5,
            targetX: this.width / 2, // for mouse/touch steering
            fuel: 100,
            fuelBurnRate: 0.04, // percent per frame
            refuelRate: 0.6, // percent gained per frame
            score: 0,
            lives: 4,
            isBlinking: false,
            blinkTimer: 0
        };

        // Entities
        this.bullets = [];
        this.particles = [];
        this.bulletCooldown = 0;
        this.bulletMaxCooldown = 15; // frames between shots
        
        // Sound and controls references
        this.sound = window.audioPlayer;
        
        // Keyboard Input State
        this.keys = {};
        
        // Score list (local storage)
        this.highScoresList = [];
        
        // Bridge score count (to transition levels)
        this.bridgesDestroyed = 0;

        // Load Sprite Assets
        this.playerSprite = new Image();
        this.playerSprite.src = 'images/player_jet.png';
        this.playerSpriteLoaded = false;
        this.playerSpriteCanvas = null;
        
        this.playerSprite.onload = () => {
            this.playerSpriteCanvas = this.makeImageTransparent(this.playerSprite);
            this.playerSpriteLoaded = true;
        };

        // Initialize game
        this.init();
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.loadHighScores();
        this.renderHighScores();
        this.updateHUD();
        this.renderLives();
        
        // Start animation loop
        requestAnimationFrame((timestamp) => this.loop(timestamp));
    }

    loadSettings() {
        // Mute state
        const savedMute = localStorage.getItem('riverRaid_muted') === 'true';
        document.getElementById('muteToggle').checked = savedMute;
        if (savedMute) this.sound.muted = true;

        // CRT State
        const savedCrt = localStorage.getItem('riverRaid_crt') !== 'false';
        document.getElementById('crtToggle').checked = savedCrt;
        if (!savedCrt) {
            document.getElementById('arcadeCabinet').classList.add('crt-off');
        }
        
        // Difficulty
        const savedDiff = localStorage.getItem('riverRaid_difficulty') || '1';
        this.updateDifficultySelection(savedDiff);

        // High Score
        this.highScore = parseInt(localStorage.getItem('riverRaid_highScore')) || 0;
        document.getElementById('highScore').textContent = this.formatScore(this.highScore);
    }

    updateDifficultySelection(val) {
        const buttons = document.querySelectorAll('#difficultyGroup .diff-btn');
        buttons.forEach(btn => {
            if (btn.getAttribute('data-value') === val) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('riverRaid_difficulty', val);
        this.levelGen.setDifficulty(parseInt(val));
    }

    setupEventListeners() {
        // Keyboard Inputs
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // Start game on Enter
            if (e.code === 'Enter' && this.state === 'MENU') {
                this.startGame();
            }
            if (e.code === 'Space' && (this.state === 'PLAYING' || this.state === 'RESPAWNING')) {
                // Prevent scrolling page when spacebar pressed
                e.preventDefault();
            }
            // Pause toggle on Escape
            if (e.code === 'Escape') {
                if (this.state === 'PLAYING') {
                    this.pauseGame();
                } else if (this.state === 'PAUSED') {
                    this.resumeGame();
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse Steering inside Canvas
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.state !== 'PLAYING' && this.state !== 'RESPAWNING') return;
            const rect = this.canvas.getBoundingClientRect();
            const root = document.documentElement;
            // Calculate relative mouse position
            const mouseX = e.clientX - rect.left - (this.player.width / 2);
            // Move player to targetX
            this.player.targetX = Math.max(30, Math.min(this.width - 30, mouseX + this.player.width/2));
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.state !== 'PLAYING') return;
            this.shoot();
        });

        // Start button click
        document.getElementById('startGameBtn').addEventListener('click', () => {
            this.startGame();
        });

        // Restart button click
        document.getElementById('restartGameBtn').addEventListener('click', () => {
            this.startGame();
        });

        // Pause resume button click
        document.getElementById('resumeGameBtn').addEventListener('click', () => {
            this.resumeGame();
        });

        // Difficulty button group clicks
        const diffButtons = document.querySelectorAll('#difficultyGroup .diff-btn');
        diffButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.target.getAttribute('data-value');
                this.updateDifficultySelection(val);
            });
        });

        // Mute Toggle change
        document.getElementById('muteToggle').addEventListener('change', (e) => {
            const isMuted = this.sound.toggleMute();
            localStorage.setItem('riverRaid_muted', isMuted);
        });

        // CRT Toggle change
        document.getElementById('crtToggle').addEventListener('change', (e) => {
            const cabinet = document.getElementById('arcadeCabinet');
            if (e.target.checked) {
                cabinet.classList.remove('crt-off');
                localStorage.setItem('riverRaid_crt', 'true');
            } else {
                cabinet.classList.add('crt-off');
                localStorage.setItem('riverRaid_crt', 'false');
            }
        });

        // High Score Form Submit
        document.getElementById('submitScoreBtn').addEventListener('click', () => {
            this.saveHighScore();
        });

        // Detect touch device to show mobile controls
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            document.getElementById('touchControls').style.display = 'flex';
            this.setupTouchControls();
        }
    }

    setupTouchControls() {
        const leftBtn = document.getElementById('touchLeft');
        const rightBtn = document.getElementById('touchRight');
        const shootBtn = document.getElementById('touchShoot');

        let leftInterval, rightInterval;

        leftBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['ArrowLeft'] = true;
        });
        leftBtn.addEventListener('touchend', () => {
            this.keys['ArrowLeft'] = false;
        });

        rightBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.keys['ArrowRight'] = true;
        });
        rightBtn.addEventListener('touchend', () => {
            this.keys['ArrowRight'] = false;
        });

        shootBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.shoot();
        });
    }

    startGame() {
        this.sound.init();
        this.sound.playStartMelody();
        
        // Hide overlays
        this.hideAllOverlays();
        
        // Setup initial stats
        this.score = 0;
        this.level = 1;
        this.lives = 4;
        this.bridgesDestroyed = 0;
        this.player.fuel = 100;
        this.player.x = this.width / 2;
        this.player.targetX = this.width / 2;
        this.player.isBlinking = true;
        this.player.blinkTimer = 120; // invincible frames at start

        this.bullets = [];
        this.particles = [];
        
        // Set generator difficulty
        const difficulty = parseInt(localStorage.getItem('riverRaid_difficulty') || '1');
        this.levelGen.reset();
        this.levelGen.setDifficulty(difficulty + this.level - 1);
        
        // Reset base scroll speed based on difficulty
        this.baseScrollSpeed = 2 + difficulty * 0.5;
        this.scrollSpeed = this.baseScrollSpeed;
        
        this.updateHUD();
        this.renderLives();
        
        this.state = 'PLAYING';
    }

    pauseGame() {
        if (this.state !== 'PLAYING') return;
        this.state = 'PAUSED';
        this.sound.stopLowFuelWarning();
        document.getElementById('pauseScreen').classList.add('active');
    }

    resumeGame() {
        if (this.state !== 'PAUSED') return;
        this.state = 'PLAYING';
        document.getElementById('pauseScreen').classList.remove('active');
    }

    hideAllOverlays() {
        document.getElementById('startScreen').classList.remove('active');
        document.getElementById('gameOverScreen').classList.remove('active');
        document.getElementById('pauseScreen').classList.remove('active');
    }

    gameOver() {
        this.state = 'GAMEOVER';
        this.sound.stopLowFuelWarning();
        this.sound.playGameOverMelody();
        
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverScreen').classList.add('active');
        
        // Check if top score
        const isNewRecord = this.checkIsNewHighScore();
        if (isNewRecord) {
            document.getElementById('highScoreForm').style.display = 'block';
            document.getElementById('playerNameInput').focus();
        } else {
            document.getElementById('highScoreForm').style.display = 'none';
        }
        
        // Update high score text
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('riverRaid_highScore', this.highScore);
            document.getElementById('highScore').textContent = this.formatScore(this.highScore);
        }
    }

    // Input Handling & Updates
    handleInput() {
        if (this.state !== 'PLAYING' && this.state !== 'RESPAWNING') return;

        // 1. Keyboard Speed adjustment W/S, Up/Down
        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            this.scrollSpeed = this.baseScrollSpeed * 1.7; // Speed up
            this.player.fuelBurnRate = 0.08; // Consumes fuel faster
        } else if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            this.scrollSpeed = this.baseScrollSpeed * 0.5; // Slow down
            this.player.fuelBurnRate = 0.02; // Consumes fuel slower
        } else {
            this.scrollSpeed = this.baseScrollSpeed;
            this.player.fuelBurnRate = 0.04;
        }

        // 2. Keyboard Horizontal Movement Keys
        let dx = 0;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            dx = -this.player.speedX;
        } else if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            dx = this.player.speedX;
        }

        if (dx !== 0) {
            this.player.x += dx;
            this.player.targetX = this.player.x;
        } else {
            // Smoothly move towards mouse/touch targetX using proportional speed (feels incredibly responsive!)
            const diff = this.player.targetX - this.player.x;
            if (Math.abs(diff) > 1) {
                const speed = Math.min(12, Math.abs(diff) * 0.2); // Faster follow for large distances, capped at 12px/frame
                this.player.x += Math.sign(diff) * speed;
            }
        }

        // 3. Physical Gamepad (Joystick) support
        this.handleGamepadInput();

        // Keep player inside screen
        this.player.x = Math.max(30, Math.min(this.width - 30, this.player.x));

        // Keyboard Shoot bullets
        if (this.keys['Space']) {
            this.shoot();
        }
    }

    handleGamepadInput() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let activeGamepad = null;
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                activeGamepad = gamepads[i];
                break;
            }
        }

        const indicator = document.getElementById('gamepadIndicator');
        if (activeGamepad) {
            if (indicator) indicator.style.display = 'flex';
            
            // Steering: Analog Stick (Axis 0) or D-pad Left/Right (Buttons 14/15)
            let steer = 0;
            const axisX = activeGamepad.axes[0];
            if (Math.abs(axisX) > 0.15) {
                steer = axisX;
            } else if (activeGamepad.buttons[14].pressed) {
                steer = -1.0;
            } else if (activeGamepad.buttons[15].pressed) {
                steer = 1.0;
            }

            if (steer !== 0) {
                this.player.x += steer * this.player.speedX * 1.5;
                this.player.targetX = this.player.x;
            }

            // Speed: Analog Stick (Axis 1) or D-pad Up/Down (Buttons 12/13)
            let vertical = 0;
            const axisY = activeGamepad.axes[1];
            if (Math.abs(axisY) > 0.2) {
                vertical = axisY;
            } else if (activeGamepad.buttons[12].pressed) {
                vertical = -1.0;
            } else if (activeGamepad.buttons[13].pressed) {
                vertical = 1.0;
            }

            if (vertical < -0.3) {
                this.scrollSpeed = this.baseScrollSpeed * 1.7; // Speed up
                this.player.fuelBurnRate = 0.08;
            } else if (vertical > 0.3) {
                this.scrollSpeed = this.baseScrollSpeed * 0.5; // Slow down
                this.player.fuelBurnRate = 0.02;
            }

            // Shoot: Button 0 (A/Cross), Button 2 (X/Square), or Button 7 (RT)
            const shootPressed = activeGamepad.buttons[0].pressed || activeGamepad.buttons[2].pressed || (activeGamepad.buttons[7] && activeGamepad.buttons[7].pressed);
            if (shootPressed) {
                this.shoot();
            }

            // Pause: Button 9 (Start)
            const pausePressed = activeGamepad.buttons[9].pressed;
            if (pausePressed && !this.lastGamepadPauseState) {
                if (this.state === 'PLAYING') {
                    this.pauseGame();
                } else if (this.state === 'PAUSED') {
                    this.resumeGame();
                }
            }
            this.lastGamepadPauseState = pausePressed;
        } else {
            if (indicator) indicator.style.display = 'none';
        }
    }

    shoot() {
        if (this.bulletCooldown > 0 || this.state !== 'PLAYING') return;

        this.bullets.push({
            x: this.player.x,
            y: this.player.y - 15,
            width: 4,
            height: 12
        });

        this.sound.playLaser();
        this.bulletCooldown = this.bulletMaxCooldown;
    }

    // Main Game Loop
    loop(timestamp) {
        this.update();
        this.render();
        requestAnimationFrame((timestamp) => this.loop(timestamp));
    }

    update() {
        if (this.state === 'PLAYING' || this.state === 'RESPAWNING') {
            this.handleInput();
            
            // Decrease bullet cooldown
            if (this.bulletCooldown > 0) this.bulletCooldown--;

            // Handle player blinking/invincible timer
            if (this.player.isBlinking) {
                this.player.blinkTimer--;
                if (this.player.blinkTimer <= 0) {
                    this.player.isBlinking = false;
                }
            }

            // Burn fuel
            if (this.state === 'PLAYING') {
                this.player.fuel -= this.player.fuelBurnRate;
                if (this.player.fuel <= 0) {
                    this.player.fuel = 0;
                    this.triggerCrash('FUEL EMPTY');
                }
            }

            // Low Fuel Sound Warning
            if (this.player.fuel < 25 && this.player.fuel > 0) {
                this.sound.startLowFuelWarning();
                document.getElementById('fuelGauge').classList.add('warning');
                document.getElementById('fuelWarning').classList.add('active');
            } else {
                this.sound.stopLowFuelWarning();
                document.getElementById('fuelGauge').classList.remove('warning');
                document.getElementById('fuelWarning').classList.remove('active');
            }

            // Scroll river & update active segments
            this.levelGen.update(this.scrollSpeed);

            // Update Bullets
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                this.bullets[i].y -= 10; // bullet speed
                if (this.bullets[i].y < 0) {
                    this.bullets.splice(i, 1);
                }
            }

            // Refueling detection logic
            let isRefueling = false;

            // Collision checks
            this.checkCollisions((refuel) => {
                if (refuel) isRefueling = true;
            });

            // Refuel tick sound and amount increase
            if (isRefueling && this.state === 'PLAYING') {
                this.player.fuel = Math.min(100, this.player.fuel + this.player.refuelRate);
                if (Math.random() < 0.15) {
                    this.sound.playRefuelTick();
                    this.createRefuelSparks();
                }
            }

            this.createEngineTrail();
            this.updateHUD();
        }

        // Always update particles
        this.updateParticles();
    }

    // Check overlaps & collisions
    checkCollisions(onRefueling) {
        if (this.state !== 'PLAYING') return;

        const pBox = {
            left: this.player.x - this.player.width / 2,
            right: this.player.x + this.player.width / 2,
            top: this.player.y - this.player.height / 2,
            bottom: this.player.y + this.player.height / 2
        };

        // 1. Check Player against River Banks & Bridges
        const activeSegs = this.levelGen.segments;
        
        for (let i = 0; i < activeSegs.length; i++) {
            const seg = activeSegs[i];
            
            // Check if segment overlaps with player Y
            const segTop = seg.y;
            const segBottom = seg.y + this.levelGen.segmentHeight;
            
            if (pBox.bottom > segTop && pBox.top < segBottom) {
                
                // Check river left wall (invincibility bypasses wall crashes)
                if (!this.player.isBlinking && pBox.left < seg.leftWallX) {
                    this.triggerCrash('RIVER BANK CRASH');
                    return;
                }
                // Check river right wall
                if (!this.player.isBlinking && pBox.right > seg.rightWallX) {
                    this.triggerCrash('RIVER BANK CRASH');
                    return;
                }
                
                // Check island walls if island is active
                if (!this.player.isBlinking && seg.islandActive && seg.islandWidth > 0) {
                    const islandLeft = seg.islandCenterX - seg.islandWidth / 2;
                    const islandRight = seg.islandCenterX + seg.islandWidth / 2;
                    
                    if (pBox.right > islandLeft && pBox.left < islandRight) {
                        this.triggerCrash('ISLAND CRASH');
                        return;
                    }
                }

                // Check bridge barrier collision
                if (!this.player.isBlinking && seg.hasBridge && !seg.bridgeDestroyed) {
                    const bridgeY = seg.y + seg.bridgeYOffset;
                    if (pBox.bottom > bridgeY - 10 && pBox.top < bridgeY + 10) {
                        this.triggerCrash('BRIDGE COLLISION');
                        return;
                    }
                }
            }
        }

        // 2. Check Player against Enemies & Fuel Depots
        for (let i = 0; i < activeSegs.length; i++) {
            const seg = activeSegs[i];

            // Fuel Depots
            for (let j = seg.fuelDepots.length - 1; j >= 0; j--) {
                const f = seg.fuelDepots[j];
                const fBox = {
                    left: f.x - f.width / 2,
                    right: f.x + f.width / 2,
                    top: f.y - f.height / 2,
                    bottom: f.y + f.height / 2
                };

                // Player overlaps fuel depot
                if (pBox.right > fBox.left && pBox.left < fBox.right &&
                    pBox.bottom > fBox.top && pBox.top < fBox.bottom) {
                    // Refuel player
                    onRefueling(true);
                }
            }

            // Enemies
            for (let j = seg.enemies.length - 1; j >= 0; j--) {
                const e = seg.enemies[j];
                const eBox = {
                    left: e.x - e.width / 2,
                    right: e.x + e.width / 2,
                    top: e.y - e.height / 2,
                    bottom: e.y + e.height / 2
                };

                // Player overlaps enemy
                if (pBox.right > eBox.left && pBox.left < eBox.right &&
                    pBox.bottom > eBox.top && pBox.top < eBox.bottom) {
                    if (!this.player.isBlinking) {
                        this.triggerCrash('ENEMY CRASH');
                        return;
                    }
                }
            }
        }

        // 3. Check Bullets collision
        for (let bIdx = this.bullets.length - 1; bIdx >= 0; bIdx--) {
            const b = this.bullets[bIdx];
            const bBox = {
                left: b.x - b.width / 2,
                right: b.x + b.width / 2,
                top: b.y - b.height / 2,
                bottom: b.y + b.height / 2
            };

            let bulletRemoved = false;

            // Check against bridges
            for (let i = 0; i < activeSegs.length; i++) {
                const seg = activeSegs[i];
                if (seg.hasBridge && !seg.bridgeDestroyed) {
                    const bridgeY = seg.y + seg.bridgeYOffset;
                    if (bBox.bottom > bridgeY - 10 && bBox.top < bridgeY + 10 && bBox.right > seg.leftWallX && bBox.left < seg.rightWallX) {
                        // Destroy bridge!
                        seg.bridgeDestroyed = true;
                        this.bullets.splice(bIdx, 1);
                        bulletRemoved = true;
                        
                        this.score += 500;
                        this.bridgesDestroyed++;
                        this.sound.playBridgeExplosion();
                        this.createExplosionParticles(b.x, bridgeY, '#ffff00', 35);
                        
                        // Check if we level up
                        if (this.bridgesDestroyed % 4 === 0) {
                            this.levelUp();
                        }
                        break;
                    }
                }
            }

            if (bulletRemoved) continue;

            // Check against walls
            for (let i = 0; i < activeSegs.length; i++) {
                const seg = activeSegs[i];
                if (bBox.bottom > seg.y && bBox.top < seg.y + this.levelGen.segmentHeight) {
                    if (bBox.left < seg.leftWallX || bBox.right > seg.rightWallX) {
                        this.bullets.splice(bIdx, 1);
                        bulletRemoved = true;
                        this.createExplosionParticles(b.x, b.y, '#ff007f', 3);
                        break;
                    }
                    if (seg.islandActive && seg.islandWidth > 0) {
                        const islandLeft = seg.islandCenterX - seg.islandWidth / 2;
                        const islandRight = seg.islandCenterX + seg.islandWidth / 2;
                        if (bBox.right > islandLeft && bBox.left < islandRight) {
                            this.bullets.splice(bIdx, 1);
                            bulletRemoved = true;
                            this.createExplosionParticles(b.x, b.y, '#00ffcc', 3);
                            break;
                        }
                    }
                }
            }

            if (bulletRemoved) continue;

            // Check against enemies and fuel depots
            for (let i = 0; i < activeSegs.length; i++) {
                const seg = activeSegs[i];
                
                // Enemies
                for (let eIdx = seg.enemies.length - 1; eIdx >= 0; eIdx--) {
                    const e = seg.enemies[eIdx];
                    const eBox = {
                        left: e.x - e.width / 2,
                        right: e.x + e.width / 2,
                        top: e.y - e.height / 2,
                        bottom: e.y + e.height / 2
                    };

                    if (bBox.right > eBox.left && bBox.left < eBox.right &&
                        bBox.bottom > eBox.top && bBox.top < eBox.bottom) {
                        
                        // Destroy enemy
                        seg.enemies.splice(eIdx, 1);
                        this.bullets.splice(bIdx, 1);
                        bulletRemoved = true;

                        this.score += e.scoreValue;
                        this.sound.playExplosion();
                        
                        // Particle color depends on enemy
                        let pColor = '#ff007f';
                        if (e.type === 'boat') pColor = '#00ffcc';
                        if (e.type === 'helicopter') pColor = '#ffb700';
                        if (e.type === 'jet') pColor = '#ffffff';

                        this.createExplosionParticles(e.x, e.y, pColor, 18);
                        break;
                    }
                }

                if (bulletRemoved) break;

                // Fuel Depots (can shoot fuel for extra points, but destroys refuel capability!)
                for (let fIdx = seg.fuelDepots.length - 1; fIdx >= 0; fIdx--) {
                    const f = seg.fuelDepots[fIdx];
                    const fBox = {
                        left: f.x - f.width / 2,
                        right: f.x + f.width / 2,
                        top: f.y - f.height / 2,
                        bottom: f.y + f.height / 2
                    };

                    if (bBox.right > fBox.left && bBox.left < fBox.right &&
                        bBox.bottom > fBox.top && bBox.top < fBox.bottom) {
                        
                        // Destroy fuel depot
                        seg.fuelDepots.splice(fIdx, 1);
                        this.bullets.splice(bIdx, 1);
                        bulletRemoved = true;

                        this.score += 150; // Points for fuel
                        this.sound.playExplosion();
                        this.createExplosionParticles(f.x, f.y, '#00ffcc', 12);
                        break;
                    }
                }

                if (bulletRemoved) break;
            }
        }
    }

    triggerCrash(reason) {
        if (this.state !== 'PLAYING') return;

        this.state = 'CRASHED';
        this.lives--;
        this.sound.stopLowFuelWarning();
        this.sound.playBridgeExplosion();
        
        // Spawn massive explosion particles
        this.createExplosionParticles(this.player.x, this.player.y, '#ff007f', 50);
        this.createExplosionParticles(this.player.x, this.player.y, '#ffb700', 30);
        
        this.renderLives();

        setTimeout(() => {
            if (this.lives <= 0) {
                this.gameOver();
            } else {
                this.respawnPlayer();
            }
        }, 1500);
    }

    respawnPlayer() {
        this.state = 'RESPAWNING';
        
        // Find safe spawn X (center of the playable river channel at player's current Y position)
        let spawnX = this.width / 2;
        const playerY = this.player.y;
        
        // Locate the segment containing the player
        const targetSeg = this.levelGen.segments.find(seg => {
            const segTop = seg.y;
            const segBottom = seg.y + this.levelGen.segmentHeight;
            return playerY >= segTop && playerY < segBottom;
        });

        if (targetSeg) {
            if (targetSeg.islandActive && targetSeg.islandWidth > 0) {
                // Spawn in the wider of the two channels
                const islandLeft = targetSeg.islandCenterX - targetSeg.islandWidth / 2;
                const islandRight = targetSeg.islandCenterX + targetSeg.islandWidth / 2;
                
                const leftChannelWidth = islandLeft - targetSeg.leftWallX;
                const rightChannelWidth = targetSeg.rightWallX - islandRight;
                
                if (leftChannelWidth > rightChannelWidth) {
                    spawnX = (targetSeg.leftWallX + islandLeft) / 2;
                } else {
                    spawnX = (islandRight + targetSeg.rightWallX) / 2;
                }
            } else {
                // Spawn in the exact center of the river walls
                spawnX = (targetSeg.leftWallX + targetSeg.rightWallX) / 2;
            }
        }

        this.player.x = spawnX;
        this.player.targetX = spawnX;
        this.player.fuel = 100;
        this.player.isBlinking = true;
        this.player.blinkTimer = 120; // 2 seconds invincibility

        // Clear local obstacles in immediate area to make respawning safe
        this.levelGen.segments.forEach(seg => {
            if (seg.y > this.player.y - 300 && seg.y < this.player.y + 100) {
                seg.enemies = [];
                seg.hasBridge = false; // ensure bridge is gone if respawning nearby
            }
        });

        this.state = 'PLAYING';
    }

    levelUp() {
        this.level++;
        
        // Increase difficulty
        const difficulty = parseInt(localStorage.getItem('riverRaid_difficulty') || '1');
        this.levelGen.setDifficulty(difficulty + this.level - 1);
        
        this.baseScrollSpeed = 2 + difficulty * 0.5 + this.level * 0.3;
        this.scrollSpeed = this.baseScrollSpeed;
        
        this.updateHUD();
        this.createExplosionParticles(this.width / 2, this.height / 2, '#00f3ff', 60);
    }

    // Particle FX Systems
    createExplosionParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 6;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                color: color,
                alpha: 1,
                decay: 0.015 + Math.random() * 0.02
            });
        }
    }

    createRefuelSparks() {
        for (let i = 0; i < 2; i++) {
            this.particles.push({
                x: this.player.x + (Math.random() - 0.5) * this.player.width,
                y: this.player.y + this.player.height / 2,
                vx: (Math.random() - 0.5) * 2,
                vy: 2 + Math.random() * 3, // fly downwards/behind
                size: 2 + Math.random() * 2,
                color: '#00ffcc',
                alpha: 1,
                decay: 0.04
            });
        }
    }

    createEngineTrail() {
        if (this.state !== 'PLAYING') return;

        // Number of exhaust particles scales with velocity/scroll speed
        const particleCount = this.scrollSpeed > this.baseScrollSpeed ? 3 : (this.scrollSpeed < this.baseScrollSpeed ? 1 : 2);
        
        for (let i = 0; i < particleCount; i++) {
            const xOffset = (Math.random() - 0.5) * 8; // spread slightly
            this.particles.push({
                x: this.player.x + xOffset,
                y: this.player.y + this.player.height / 2,
                vx: (Math.random() - 0.5) * 1.5,
                vy: this.scrollSpeed * 0.7 + Math.random() * 2, // shoot backwards
                size: 2 + Math.random() * 4,
                color: Math.random() < 0.65 ? '#ff5e00' : '#ff007f', // mixture of orange and pink thruster flame!
                alpha: 0.8,
                decay: 0.03 + Math.random() * 0.04
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    // UI Updates
    updateHUD() {
        document.getElementById('currentScore').textContent = this.formatScore(this.score);
        document.getElementById('currentLevel').textContent = String(this.level).padStart(2, '0');
        
        const fuelFill = document.getElementById('fuelFill');
        if (fuelFill) {
            fuelFill.style.width = `${this.player.fuel}%`;
        }
    }

    renderLives() {
        const livesContainer = document.getElementById('livesContainer');
        if (!livesContainer) return;
        
        livesContainer.innerHTML = '';
        const jetSVG = `
            <svg class="life-icon" viewBox="0 0 24 24">
                <path d="M12 2L9 8h6L12 2zm0 6L6 18h12L12 8zm0 4h-2v3h4v-3z"/>
            </svg>
        `;
        
        for (let i = 0; i < this.lives; i++) {
            livesContainer.innerHTML += jetSVG;
        }
    }

    formatScore(num) {
        return String(Math.floor(num)).padStart(5, '0');
    }

    // Canvas Rendering
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw procedurally generated river banks and islands
        this.levelGen.draw(this.ctx);

        // Render Enemies and Fuel Depots
        const activeSegs = this.levelGen.segments;
        for (let i = 0; i < activeSegs.length; i++) {
            const seg = activeSegs[i];
            
            // Draw Fuel Depots
            seg.fuelDepots.forEach(depot => {
                this.drawFuelDepot(depot);
            });

            // Draw Enemies
            seg.enemies.forEach(enemy => {
                this.drawEnemy(enemy);
            });
        }

        // Draw Bullets
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#00f3ff';
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            this.ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
        }
        this.ctx.shadowBlur = 0; // reset glow

        // Draw Player Jet
        if (this.state === 'PLAYING' || this.state === 'RESPAWNING') {
            const blinkState = !this.player.isBlinking || Math.floor(Date.now() / 100) % 2 === 0;
            if (blinkState) {
                this.drawPlayerJet();
            }
        }

        // Draw Particles
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    drawPlayerJet() {
        const x = this.player.x;
        const y = this.player.y;
        const w = this.player.width;
        const h = this.player.height;

        this.ctx.save();
        
        // Draw thruster fire if moving/scrolling
        const thrusterSize = 8 + Math.random() * 8;
        this.ctx.shadowColor = '#ff5e00';
        this.ctx.fillStyle = '#ff5e00';
        this.ctx.beginPath();
        this.ctx.moveTo(x - w/8, y + h/2);
        this.ctx.lineTo(x, y + h/2 + thrusterSize);
        this.ctx.lineTo(x + w/8, y + h/2);
        this.ctx.closePath();
        this.ctx.fill();

        if (this.playerSpriteLoaded && this.playerSpriteCanvas) {
            // Draw premium transparent jet sprite centered at player coordinates
            this.ctx.shadowColor = '#00f3ff';
            this.ctx.shadowBlur = 12;
            this.ctx.drawImage(this.playerSpriteCanvas, x - w, y - h, w * 2, h * 2);
        } else {
            // Fallback vector outline jet fighter
            this.ctx.shadowColor = '#00f3ff';
            this.ctx.shadowBlur = 12;
            this.ctx.strokeStyle = '#00f3ff';
            this.ctx.fillStyle = 'rgba(0, 243, 255, 0.25)';
            this.ctx.lineWidth = 2.5;

            this.ctx.beginPath();
            this.ctx.moveTo(x, y - h/2);
            this.ctx.lineTo(x + w/2, y + h/3);
            this.ctx.lineTo(x + w/4, y + h/3);
            this.ctx.lineTo(x + w/6, y + h/2);
            this.ctx.lineTo(x - w/6, y + h/2);
            this.ctx.lineTo(x - w/4, y + h/3);
            this.ctx.lineTo(x - w/2, y + h/3);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    makeImageTransparent(image, colorToReplace = {r: 0, g: 0, b: 0, tolerance: 35}) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.width;
        tempCanvas.height = image.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0);
        
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            const dist = Math.sqrt(
                Math.pow(r - colorToReplace.r, 2) +
                Math.pow(g - colorToReplace.g, 2) +
                Math.pow(b - colorToReplace.b, 2)
            );
            
            if (dist < colorToReplace.tolerance) {
                data[i+3] = 0; // Transparent
            }
        }
        
        tempCtx.putImageData(imgData, 0, 0);
        return tempCanvas;
    }

    drawFuelDepot(depot) {
        const x = depot.x;
        const y = depot.y;
        const w = depot.width;
        const h = depot.height;

        this.ctx.save();
        this.ctx.shadowColor = '#00ffcc';
        this.ctx.shadowBlur = 8;

        // Draw capsule background
        this.ctx.fillStyle = 'rgba(0, 255, 204, 0.15)';
        this.ctx.strokeStyle = '#00ffcc';
        this.ctx.lineWidth = 2;
        
        // Draw capsule rounded rect
        this.ctx.beginPath();
        if (this.ctx.roundRect) {
            this.ctx.roundRect(x - w/2, y - h/2, w, h, 6);
        } else {
            this.ctx.rect(x - w/2, y - h/2, w, h);
        }
        this.ctx.fill();
        this.ctx.stroke();

        // Draw FUEL letters vertically
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 8px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        this.ctx.fillText('F', x, y - 12);
        this.ctx.fillText('U', x, y - 4);
        this.ctx.fillText('E', x, y + 4);
        this.ctx.fillText('L', x, y + 12);

        this.ctx.restore();
    }

    drawEnemy(enemy) {
        const x = enemy.x;
        const y = enemy.y;
        const w = enemy.width;
        const h = enemy.height;

        this.ctx.save();

        if (enemy.type === 'boat') {
            // Neon cyan ship
            this.ctx.shadowColor = '#00ffcc';
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = '#00ffcc';
            this.ctx.fillStyle = 'rgba(0, 255, 204, 0.2)';
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            this.ctx.moveTo(x - w/2, y + h/3);
            this.ctx.lineTo(x - w/3, y - h/3);
            this.ctx.lineTo(x + w/3, y - h/3);
            this.ctx.lineTo(x + w/2, y + h/3);
            this.ctx.lineTo(x + w/4, y + h/2);
            this.ctx.lineTo(x - w/4, y + h/2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();

            // Radar dome
            this.ctx.beginPath();
            this.ctx.arc(x, y - h/6, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fill();
        } 
        else if (enemy.type === 'helicopter') {
            // Neon yellow chopper
            this.ctx.shadowColor = '#ffb700';
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = '#ffb700';
            this.ctx.fillStyle = 'rgba(255, 183, 0, 0.2)';
            this.ctx.lineWidth = 2;

            // Main body circle
            this.ctx.beginPath();
            this.ctx.arc(x - 2, y + 2, 8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();

            // Tail
            this.ctx.beginPath();
            this.ctx.moveTo(x - 10, y + 2);
            this.ctx.lineTo(x - w/2, y);
            this.ctx.lineTo(x - w/2, y - 4);
            this.ctx.stroke();

            // Rotor blade spinning animation
            this.ctx.shadowColor = '#ff007f';
            this.ctx.strokeStyle = '#ff007f';
            const spin = Math.sin(enemy.animationFrame) * (w / 2);
            this.ctx.beginPath();
            this.ctx.moveTo(x - 2 - spin, y - 8);
            this.ctx.lineTo(x - 2 + spin, y - 8);
            this.ctx.stroke();
            
            // Rotor shaft
            this.ctx.strokeStyle = '#ffb700';
            this.ctx.beginPath();
            this.ctx.moveTo(x - 2, y - 6);
            this.ctx.lineTo(x - 2, y + 2);
            this.ctx.stroke();
        } 
        else if (enemy.type === 'jet') {
            // Neon pink fighter plane
            this.ctx.shadowColor = '#ff007f';
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = '#ff007f';
            this.ctx.fillStyle = 'rgba(255, 0, 127, 0.2)';
            this.ctx.lineWidth = 2;

            this.ctx.beginPath();
            // Point forward (based on flying direction speedX)
            const dirSign = Math.sign(enemy.speedX);
            
            if (dirSign >= 0) {
                // Flying Right
                this.ctx.moveTo(x + w/2, y);
                this.ctx.lineTo(x - w/4, y - h/2);
                this.ctx.lineTo(x - w/2, y - h/2);
                this.ctx.lineTo(x - w/3, y);
                this.ctx.lineTo(x - w/2, y + h/2);
                this.ctx.lineTo(x - w/4, y + h/2);
            } else {
                // Flying Left
                this.ctx.moveTo(x - w/2, y);
                this.ctx.lineTo(x + w/4, y - h/2);
                this.ctx.lineTo(x + w/2, y - h/2);
                this.ctx.lineTo(x + w/3, y);
                this.ctx.lineTo(x + w/2, y + h/2);
                this.ctx.lineTo(x + w/4, y + h/2);
            }
            
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    // High Scores list operations
    loadHighScores() {
        const scores = localStorage.getItem('riverRaid_highScores');
        if (scores) {
            this.highScoresList = JSON.parse(scores);
        } else {
            // Initial mock leaderboard
            this.highScoresList = [
                { name: 'CAROL', score: 10000, level: 5 },
                { name: 'BOB', score: 7500, level: 4 },
                { name: 'ALICE', score: 5000, level: 3 },
                { name: 'PLAYER 1', score: 2500, level: 2 }
            ];
            this.saveLeaderboard();
        }
    }

    saveLeaderboard() {
        localStorage.setItem('riverRaid_highScores', JSON.stringify(this.highScoresList));
    }

    checkIsNewHighScore() {
        if (this.score === 0) return false;
        if (this.highScoresList.length < 5) return true;
        // Check if score beats the lowest on leaderboard
        const lowestScore = this.highScoresList[this.highScoresList.length - 1].score;
        return this.score > lowestScore;
    }

    saveHighScore() {
        const nameInput = document.getElementById('playerNameInput');
        const name = nameInput.value.trim().toUpperCase() || 'PILOTO';
        
        // Add new score
        const newScore = {
            name: name,
            score: this.score,
            level: this.level
        };

        this.highScoresList.push(newScore);
        
        // Sort descending
        this.highScoresList.sort((a, b) => b.score - a.score);
        
        // Keep top 5
        if (this.highScoresList.length > 5) {
            this.highScoresList.pop();
        }

        this.saveLeaderboard();
        this.renderHighScores();

        // Hide form and reload screen info
        document.getElementById('highScoreForm').style.display = 'none';
    }

    renderHighScores() {
        const container = document.getElementById('highScoreList');
        if (!container) return;

        container.innerHTML = '';
        
        this.highScoresList.forEach((entry, idx) => {
            const isHighlight = entry.score === this.score && this.state === 'GAMEOVER';
            const rowClass = isHighlight ? 'score-row highlight' : 'score-row';
            
            container.innerHTML += `
                <div class="${rowClass}">
                    <span class="score-rank">${idx + 1}. ${entry.name}</span>
                    <span class="score-points">${this.formatScore(entry.score)} (Niv. ${entry.level})</span>
                </div>
            `;
        });
    }
}

// Instantiate the game
window.addEventListener('DOMContentLoaded', () => {
    window.gameEngine = new RiverRaidGame();
});
