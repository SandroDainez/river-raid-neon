// level.js - Procedural Level Generator for River Raid - Neon Edition

class LevelGenerator {
    constructor(canvasWidth, canvasHeight) {
        this.width = canvasWidth;
        this.height = canvasHeight;
        this.segmentHeight = 40; // Height of each river slice
        this.segments = []; // Active segments currently on screen or just above
        this.nextSegmentIndex = 0;
        
        // Control points for procedural river generation
        this.currentCenterX = this.width / 2;
        this.currentWidth = 400;
        this.targetWidth = 400;
        this.targetCenterX = this.width / 2;
        
        // Island state
        this.islandActive = false;
        this.islandWidth = 0;
        this.islandCenterX = this.width / 2;
        
        // Spawn configurations
        this.bridgeInterval = 120; // Number of segments between bridges
        this.segmentsSinceLastBridge = 0;
        
        this.difficulty = 1;
    }

    reset() {
        this.segments = [];
        this.nextSegmentIndex = 0;
        this.currentCenterX = this.width / 2;
        this.currentWidth = 400;
        this.targetWidth = 400;
        this.targetCenterX = this.width / 2;
        this.islandActive = false;
        this.islandWidth = 0;
        this.segmentsSinceLastBridge = 40; // Allow some buffer at start
        this.difficulty = 1;
        
        // Pre-populate screen with safe wide river segments
        const numStartSegments = Math.ceil(this.height / this.segmentHeight) + 5;
        for (let i = 0; i < numStartSegments; i++) {
            this.generateNextSegment(true); // true means safe start (no enemies/obstacles)
        }
    }

    setDifficulty(level) {
        this.difficulty = level;
    }

    // Generate a single segment of the river
    generateNextSegment(safeStart = false) {
        const index = this.nextSegmentIndex++;
        this.segmentsSinceLastBridge++;

        // Procedural changes to river width and center
        if (index % 15 === 0) {
            // Pick new target width and center
            // High level narrows the river more often
            const minWidth = Math.max(160, 320 - this.difficulty * 15);
            const maxWidth = Math.max(280, 480 - this.difficulty * 10);
            this.targetWidth = minWidth + Math.random() * (maxWidth - minWidth);
            
            const margin = this.targetWidth / 2 + 40;
            this.targetCenterX = margin + Math.random() * (this.width - margin * 2);
        }

        // Smoothly interpolate center and width
        this.currentCenterX += (this.targetCenterX - this.currentCenterX) * 0.08;
        this.currentWidth += (this.targetWidth - this.currentWidth) * 0.08;

        // Calculate left and right wall coordinates
        let leftWallX = this.currentCenterX - this.currentWidth / 2;
        let rightWallX = this.currentCenterX + this.currentWidth / 2;

        // Clamp to screen bounds
        if (leftWallX < 20) leftWallX = 20;
        if (rightWallX > this.width - 20) rightWallX = this.width - 20;

        // Island generation logic (spawns sometimes when river is wide enough)
        if (!safeStart && this.currentWidth > 320 && !this.islandActive && Math.random() < 0.02 && this.segmentsSinceLastBridge < this.bridgeInterval - 20) {
            this.islandActive = true;
            this.islandWidth = 10;
            this.islandCenterX = this.currentCenterX;
        }

        if (this.islandActive) {
            // Grow island or shrink island
            if (this.islandWidth < 80 && Math.random() < 0.3) {
                this.islandWidth += 15;
            } else if (Math.random() < 0.1) {
                // Decay island
                this.islandWidth -= 20;
                if (this.islandWidth <= 0) {
                    this.islandActive = false;
                    this.islandWidth = 0;
                }
            }
            // Keep island centered-ish
            this.islandCenterX += (this.currentCenterX - this.islandCenterX) * 0.1;
        }

        // Determine if we spawn a bridge
        let hasBridge = false;
        if (!safeStart && this.segmentsSinceLastBridge >= this.bridgeInterval) {
            hasBridge = true;
            this.segmentsSinceLastBridge = 0;
            this.islandActive = false; // Turn off island for bridges
            this.islandWidth = 0;
        }

        let segmentY = -this.segmentHeight;
        if (this.segments.length === 0) {
            segmentY = this.height - this.segmentHeight;
        } else {
            segmentY = this.segments[0].y - this.segmentHeight;
        }

        const segment = {
            index: index,
            y: segmentY,
            leftWallX: leftWallX,
            rightWallX: rightWallX,
            islandActive: this.islandActive,
            islandCenterX: this.islandCenterX,
            islandWidth: this.islandWidth,
            hasBridge: hasBridge,
            bridgeDestroyed: false,
            bridgeYOffset: 15, // vertical position offset within segment
            enemies: [],
            fuelDepots: []
        };

        // Don't spawn entities on safe start or on bridge segments
        if (!safeStart && !hasBridge) {
            this.spawnEntities(segment);
        }

        this.segments.unshift(segment); // Add to the beginning of list (top of screen)
    }

    spawnEntities(segment) {
        // Probabilities based on difficulty
        const spawnChance = 0.12 + Math.min(0.18, this.difficulty * 0.03); // increases with level
        const fuelChance = 0.07; // Fuel is essential but should be balanced

        // Calculate clear channels
        let leftChannelWidth = segment.rightWallX - segment.leftWallX;
        let leftChannelCenter = (segment.leftWallX + segment.rightWallX) / 2;
        let rightChannelWidth = 0;
        let rightChannelCenter = 0;

        if (segment.islandActive) {
            leftChannelWidth = (segment.islandCenterX - segment.islandWidth / 2) - segment.leftWallX;
            leftChannelCenter = (segment.leftWallX + (segment.islandCenterX - segment.islandWidth / 2)) / 2;
            
            rightChannelWidth = segment.rightWallX - (segment.islandCenterX + segment.islandWidth / 2);
            rightChannelCenter = ((segment.islandCenterX + segment.islandWidth / 2) + segment.rightWallX) / 2;
        }

        // Function to place an entity in a channel
        const spawnInChannel = (center, width, isRightChannel) => {
            if (width < 60) return; // Channel too narrow to fit obstacles
            
            const roll = Math.random();
            if (roll < fuelChance) {
                // Spawn Fuel Depot
                segment.fuelDepots.push({
                    x: center + (Math.random() - 0.5) * (width - 40),
                    y: segment.y + this.segmentHeight / 2,
                    width: 30,
                    height: 30,
                    fuelAmount: 100
                });
            } else if (roll < fuelChance + spawnChance) {
                // Spawn Enemy
                const enemyRoll = Math.random();
                let enemyType = 'helicopter';
                let scoreValue = 60;
                let speed = 1 + this.difficulty * 0.2;
                
                if (enemyRoll < 0.4) {
                    enemyType = 'boat';
                    scoreValue = 30;
                    speed = 0.5 + this.difficulty * 0.1;
                } else if (enemyRoll < 0.8) {
                    enemyType = 'helicopter';
                    scoreValue = 60;
                    speed = 1.2 + this.difficulty * 0.3;
                } else {
                    enemyType = 'jet';
                    scoreValue = 100;
                    speed = 2.5 + this.difficulty * 0.5; // Fast!
                }

                // Choose motion direction
                const dir = Math.random() < 0.5 ? -1 : 1;

                segment.enemies.push({
                    type: enemyType,
                    x: center,
                    y: segment.y + this.segmentHeight / 2,
                    width: enemyType === 'jet' ? 32 : 30,
                    height: 24,
                    speedX: dir * speed,
                    scoreValue: scoreValue,
                    channelLeft: center - width / 2 + 15,
                    channelRight: center + width / 2 - 15,
                    animationFrame: 0,
                    pulseDirection: 1
                });
            }
        };

        // Spawn for left/main channel
        spawnInChannel(leftChannelCenter, leftChannelWidth, false);

        // Spawn for right channel if it exists
        if (segment.islandActive && rightChannelWidth > 50) {
            spawnInChannel(rightChannelCenter, rightChannelWidth, true);
        }
    }

    // Scroll active segments downwards
    update(scrollSpeed) {
        // Move all segments down
        for (let i = 0; i < this.segments.length; i++) {
            this.segments[i].y += scrollSpeed;
            
            // Also update Y positions of enemies and fuel depots
            this.segments[i].enemies.forEach(enemy => {
                enemy.y += scrollSpeed;
                // Move horizontal enemies
                enemy.x += enemy.speedX;

                // Animate rotor/wing pulses
                enemy.animationFrame += 0.25;

                // Check channel walls for bouncing
                if (enemy.x <= enemy.channelLeft) {
                    enemy.x = enemy.channelLeft;
                    enemy.speedX *= -1;
                } else if (enemy.x >= enemy.channelRight) {
                    enemy.x = enemy.channelRight;
                    enemy.speedX *= -1;
                }
            });

            this.segments[i].fuelDepots.forEach(depot => {
                depot.y += scrollSpeed;
            });
        }

        // If the bottom-most segment has scrolled off the screen, remove it
        if (this.segments.length > 0 && this.segments[this.segments.length - 1].y > this.height) {
            this.segments.pop();
        }

        // If there's space at the top, generate a new segment
        if (this.segments.length > 0 && this.segments[0].y > 0) {
            this.generateNextSegment(false);
        }
    }

    // Draw the entire river bank terrain
    draw(ctx) {
        // Draw the main dark river background (already handled by canvas clearing, but we draw banks here)
        ctx.fillStyle = '#060517'; // Cyber blue/black space river background
        ctx.fillRect(0, 0, this.width, this.height);

        // Grid lines inside the river (aesthetic neon grid)
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
        ctx.lineWidth = 1;
        const gridOffset = (this.segments.length > 0) ? (this.segments[0].y % 40) : 0;
        for (let y = gridOffset; y < this.height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }

        if (this.segments.length === 0) return;

        // Draw Left and Right Banks
        ctx.fillStyle = '#17002e'; // Dark purple land
        ctx.strokeStyle = '#ff007f'; // Neon pink border
        ctx.lineWidth = 3;

        // Draw left bank polygon
        ctx.beginPath();
        ctx.moveTo(0, this.height);
        for (let i = this.segments.length - 1; i >= 0; i--) {
            ctx.lineTo(this.segments[i].leftWallX, this.segments[i].y + this.segmentHeight);
            ctx.lineTo(this.segments[i].leftWallX, this.segments[i].y);
        }
        ctx.lineTo(0, this.segments[0].y);
        ctx.closePath();
        ctx.fill();
        
        // Draw left bank stroke
        ctx.beginPath();
        for (let i = this.segments.length - 1; i >= 0; i--) {
            if (i === this.segments.length - 1) {
                ctx.moveTo(this.segments[i].leftWallX, this.segments[i].y + this.segmentHeight);
            }
            ctx.lineTo(this.segments[i].leftWallX, this.segments[i].y);
        }
        ctx.stroke();

        // Draw right bank polygon
        ctx.fillStyle = '#17002e';
        ctx.beginPath();
        ctx.moveTo(this.width, this.height);
        for (let i = this.segments.length - 1; i >= 0; i--) {
            ctx.lineTo(this.segments[i].rightWallX, this.segments[i].y + this.segmentHeight);
            ctx.lineTo(this.segments[i].rightWallX, this.segments[i].y);
        }
        ctx.lineTo(this.width, this.segments[0].y);
        ctx.closePath();
        ctx.fill();

        // Draw right bank stroke
        ctx.beginPath();
        for (let i = this.segments.length - 1; i >= 0; i--) {
            if (i === this.segments.length - 1) {
                ctx.moveTo(this.segments[i].rightWallX, this.segments[i].y + this.segmentHeight);
            }
            ctx.lineTo(this.segments[i].rightWallX, this.segments[i].y);
        }
        ctx.stroke();

        // Draw Islands
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.islandActive && seg.islandWidth > 0) {
                ctx.fillStyle = '#17002e';
                ctx.strokeStyle = '#00ffcc'; // Neon cyan for islands
                ctx.lineWidth = 3;
                
                const leftX = seg.islandCenterX - seg.islandWidth / 2;
                const rightX = seg.islandCenterX + seg.islandWidth / 2;

                ctx.fillRect(leftX, seg.y, seg.islandWidth, this.segmentHeight + 1);
                
                // Draw borders
                ctx.beginPath();
                ctx.moveTo(leftX, seg.y);
                ctx.lineTo(leftX, seg.y + this.segmentHeight + 1);
                ctx.moveTo(rightX, seg.y);
                ctx.lineTo(rightX, seg.y + this.segmentHeight + 1);
                ctx.stroke();
            }
        }

        // Draw Bridges
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.hasBridge) {
                const bridgeY = seg.y + seg.bridgeYOffset;
                
                if (seg.bridgeDestroyed) {
                    // Draw destroyed bridge remains on river banks
                    ctx.fillStyle = '#555555';
                    ctx.strokeStyle = '#ff3300';
                    ctx.lineWidth = 2;
                    
                    // Left bank scrap
                    ctx.fillRect(seg.leftWallX, bridgeY - 8, 20, 16);
                    ctx.strokeRect(seg.leftWallX, bridgeY - 8, 20, 16);

                    // Right bank scrap
                    ctx.fillRect(seg.rightWallX - 20, bridgeY - 8, 20, 16);
                    ctx.strokeRect(seg.rightWallX - 20, bridgeY - 8, 20, 16);
                } else {
                    // Draw complete solid bridge (neon yellow / orange barricade)
                    const bridgeWidth = seg.rightWallX - seg.leftWallX;

                    // Neon shadow glow
                    ctx.shadowColor = '#ffff00';
                    ctx.shadowBlur = 10;
                    
                    ctx.fillStyle = '#ffb700'; // Retro orange bridge structure
                    ctx.fillRect(seg.leftWallX, bridgeY - 10, bridgeWidth, 20);

                    ctx.strokeStyle = '#ffff00'; // Glowing yellow highlights
                    ctx.lineWidth = 3;
                    ctx.strokeRect(seg.leftWallX, bridgeY - 10, bridgeWidth, 20);

                    // Caution stripes pattern
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    for (let bx = seg.leftWallX + 10; bx < seg.rightWallX; bx += 30) {
                        ctx.moveTo(bx, bridgeY - 10);
                        ctx.lineTo(bx + 15, bridgeY + 10);
                    }
                    ctx.stroke();
                    
                    // Reset shadow glow
                    ctx.shadowBlur = 0;
                }
            }
        }
    }
}

// Global level engine
window.LevelGenerator = LevelGenerator;
