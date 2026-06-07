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
        this.sector = 1;
        this.bossActive = false;
        this.scrollOffset = 0;
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
        this.sector = 1;
        this.bossActive = false;
        this.scrollOffset = 0;
        
        // Pre-populate screen with safe wide river segments
        const numStartSegments = Math.ceil(this.height / this.segmentHeight) + 5;
        for (let i = 0; i < numStartSegments; i++) {
            this.generateNextSegment(true); // true means safe start (no enemies/obstacles)
        }
    }

    setDifficulty(level) {
        this.difficulty = level;
    }

    setSector(sector) {
        this.sector = sector;
        if (sector !== 10) {
            this.bossActive = false;
        }
    }

    // Generate a single segment of the river
    generateNextSegment(safeStart = false) {
        const index = this.nextSegmentIndex++;
        this.segmentsSinceLastBridge++;

        // Procedural changes to river width and center
        if (index % 15 === 0) {
            let minWidth = Math.max(160, 320 - this.difficulty * 15);
            let maxWidth = Math.max(280, 480 - this.difficulty * 10);
            
            if (this.sector === 8) {
                minWidth = 170;
                maxWidth = 240; // narrow maze canyon!
            } else if (this.sector === 10 && this.segmentsSinceLastBridge > this.bridgeInterval - 20) {
                // Prepare flat wide river for boss arena
                minWidth = 520;
                maxWidth = 520;
            }
            
            this.targetWidth = minWidth + Math.random() * (maxWidth - minWidth);
            
            let targetCenterX = this.width / 2;
            if (!(this.sector === 10 && this.segmentsSinceLastBridge > this.bridgeInterval - 20)) {
                const margin = this.targetWidth / 2 + 40;
                targetCenterX = margin + Math.random() * (this.width - margin * 2);
            }
            this.targetCenterX = targetCenterX;
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
        const approachBoss = this.sector === 10 && this.segmentsSinceLastBridge > this.bridgeInterval - 25;
        const isSector8 = this.sector === 8;
        const isBossActive = this.bossActive;
        
        if (!safeStart && !approachBoss && !isBossActive) {
            const spawnIslandRoll = Math.random();
            const spawnIslandChance = isSector8 ? 0.09 : 0.02; // Sector 8 has high island spawn rate
            const requiredWidth = isSector8 ? 220 : 320;
            
            if (this.currentWidth > requiredWidth && !this.islandActive && spawnIslandRoll < spawnIslandChance && this.segmentsSinceLastBridge < this.bridgeInterval - 20) {
                this.islandActive = true;
                this.islandWidth = 10;
                this.islandCenterX = this.currentCenterX;
            }
        }

        if (this.islandActive && (approachBoss || isBossActive)) {
            this.islandActive = false;
            this.islandWidth = 0;
        }

        if (this.islandActive) {
            // Grow island or shrink island
            const maxIslandWidth = isSector8 ? 50 : 80;
            if (this.islandWidth < maxIslandWidth && Math.random() < 0.3) {
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
            if (this.sector !== 10) {
                hasBridge = true;
            }
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
        if (this.bossActive) {
            // Spawning in boss arena: only spawn fuel depots occasionally!
            if (Math.random() < 0.06) {
                segment.fuelDepots.push({
                    x: segment.leftWallX + 40 + Math.random() * (segment.rightWallX - segment.leftWallX - 80),
                    y: segment.y + this.segmentHeight / 2,
                    width: 48,
                    height: 48,
                    fuelAmount: 100
                });
            }
            return;
        }

        // Shore turrets spawn in Sectors 6, 7, 9, 10
        const hasTurrets = [6, 7, 9, 10].includes(this.sector);
        if (hasTurrets && Math.random() < 0.15) {
            const onLeftShore = Math.random() < 0.5;
            const turretX = onLeftShore ? segment.leftWallX - 22 : segment.rightWallX + 22;
            segment.enemies.push({
                type: 'turret',
                x: turretX,
                y: segment.y + this.segmentHeight / 2,
                width: 32,
                height: 32,
                speedX: 0,
                scoreValue: 150,
                shootCooldown: Math.random() * 80 + 40,
                channelLeft: turretX,
                channelRight: turretX,
                animationFrame: 0,
                pulseDirection: 1
            });
        }

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
            if (width < 90) return; // Channel too narrow to fit obstacles
            
            const roll = Math.random();
            if (roll < fuelChance) {
                // Spawn Fuel Depot
                segment.fuelDepots.push({
                    x: center + (Math.random() - 0.5) * (width - 60),
                    y: segment.y + this.segmentHeight / 2,
                    width: 48,
                    height: 48,
                    fuelAmount: 100
                });
            } else if (roll < fuelChance + spawnChance) {
                // Spawn Enemy
                const enemyRoll = Math.random();
                let enemyType = 'helicopter';
                let scoreValue = 60;
                let speed = 1 + this.difficulty * 0.2;
                
                if (this.sector === 1) {
                    // Only boats in Sector 1
                    enemyType = 'boat';
                    scoreValue = 30;
                    speed = 0.5 + this.difficulty * 0.1;
                } else if (this.sector === 2) {
                    // Only boats and helicopters in Sector 2
                    if (enemyRoll < 0.5) {
                        enemyType = 'boat';
                        scoreValue = 30;
                        speed = 0.5 + this.difficulty * 0.1;
                    } else {
                        enemyType = 'helicopter';
                        scoreValue = 60;
                        speed = 1.2 + this.difficulty * 0.3;
                    }
                } else {
                    // All enemy types in Sector 3+
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
                }

                const dir = Math.random() < 0.5 ? -1 : 1;
                let eWidth = 30;
                let eHeight = 24;
                if (enemyType === 'boat') {
                    eWidth = 70;
                    eHeight = 22;
                } else if (enemyType === 'helicopter') {
                    eWidth = 60;
                    eHeight = 45;
                } else if (enemyType === 'jet') {
                    eWidth = 70;
                    eHeight = 48;
                }

                segment.enemies.push({
                    type: enemyType,
                    x: center,
                    y: segment.y + this.segmentHeight / 2,
                    width: eWidth,
                    height: eHeight,
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
        this.scrollOffset += scrollSpeed;
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

    // Draw the entire river bank terrain with realistic textures
    draw(ctx, forestPattern = null, waterPattern = null) {
        // 1. Draw flowing river water background
        if (waterPattern) {
            const matrix = new DOMMatrix();
            // Scroll the water texture downward based on cumulative scroll + flow speed
            const flowOffset = (this.scrollOffset * 0.5 + Date.now() * 0.05) % 512;
            matrix.translateSelf(0, flowOffset);
            waterPattern.setTransform(matrix);
            ctx.fillStyle = waterPattern;
        } else {
            ctx.fillStyle = '#0f2647'; // Realistic deep blue river water fallback
        }
        ctx.fillRect(0, 0, this.width, this.height);

        if (this.segments.length === 0) return;

        // Configure forest pattern for land banks
        if (forestPattern) {
            const matrix = new DOMMatrix();
            // The forest scrolls exactly with the land segments
            const landScroll = this.scrollOffset % 512;
            matrix.translateSelf(0, landScroll);
            forestPattern.setTransform(matrix);
            ctx.fillStyle = forestPattern;
        } else {
            ctx.fillStyle = '#1e3f20'; // Realistic dark green forest fallback
        }

        ctx.strokeStyle = '#e8cfa4'; // Sandy shoreline color
        ctx.lineWidth = 3.5;

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
        
        // Draw left bank shoreline stroke
        ctx.beginPath();
        for (let i = this.segments.length - 1; i >= 0; i--) {
            if (i === this.segments.length - 1) {
                ctx.moveTo(this.segments[i].leftWallX, this.segments[i].y + this.segmentHeight);
            }
            ctx.lineTo(this.segments[i].leftWallX, this.segments[i].y);
        }
        ctx.stroke();

        // Draw right bank polygon
        ctx.beginPath();
        ctx.moveTo(this.width, this.height);
        for (let i = this.segments.length - 1; i >= 0; i--) {
            ctx.lineTo(this.segments[i].rightWallX, this.segments[i].y + this.segmentHeight);
            ctx.lineTo(this.segments[i].rightWallX, this.segments[i].y);
        }
        ctx.lineTo(this.width, this.segments[0].y);
        ctx.closePath();
        ctx.fill();

        // Draw right bank shoreline stroke
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
                if (forestPattern) {
                    ctx.fillStyle = forestPattern;
                } else {
                    ctx.fillStyle = '#1e3f20';
                }
                
                const leftX = seg.islandCenterX - seg.islandWidth / 2;
                const rightX = seg.islandCenterX + seg.islandWidth / 2;

                ctx.fillRect(leftX, seg.y, seg.islandWidth, this.segmentHeight + 1);
                
                // Draw borders (sandy shorelines)
                ctx.strokeStyle = '#e8cfa4';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.moveTo(leftX, seg.y);
                ctx.lineTo(leftX, seg.y + this.segmentHeight + 1);
                ctx.moveTo(rightX, seg.y);
                ctx.lineTo(rightX, seg.y + this.segmentHeight + 1);
                ctx.stroke();
            }
        }

        // Draw Bridges (realistic steel truss design)
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.hasBridge) {
                const bridgeY = seg.y + seg.bridgeYOffset;
                
                if (seg.bridgeDestroyed) {
                    // Draw destroyed bridge remains on river banks
                    ctx.fillStyle = '#444444';
                    ctx.strokeStyle = '#222222';
                    ctx.lineWidth = 2;
                    
                    // Left bank remains
                    ctx.fillRect(seg.leftWallX, bridgeY - 8, 20, 16);
                    ctx.strokeRect(seg.leftWallX, bridgeY - 8, 20, 16);

                    // Right bank remains
                    ctx.fillRect(seg.rightWallX - 20, bridgeY - 8, 20, 16);
                    ctx.strokeRect(seg.rightWallX - 20, bridgeY - 8, 20, 16);

                    // Debris dipping into water
                    ctx.strokeStyle = '#333333';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(seg.leftWallX + 20, bridgeY - 4);
                    ctx.lineTo(seg.leftWallX + 30, bridgeY + 8);
                    ctx.moveTo(seg.rightWallX - 20, bridgeY - 4);
                    ctx.lineTo(seg.rightWallX - 30, bridgeY + 8);
                    ctx.stroke();
                } else {
                    // Draw complete solid bridge (grey concrete deck + steel trusses)
                    const bridgeWidth = seg.rightWallX - seg.leftWallX;

                    // Concrete support pillars on banks
                    ctx.fillStyle = '#777777';
                    ctx.fillRect(seg.leftWallX - 8, bridgeY - 12, 16, 24);
                    ctx.fillRect(seg.rightWallX - 8, bridgeY - 12, 16, 24);
                    
                    // Road deck
                    ctx.fillStyle = '#3a3a3a';
                    ctx.fillRect(seg.leftWallX, bridgeY - 8, bridgeWidth, 16);

                    // Steel trusses
                    ctx.strokeStyle = '#888888';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(seg.leftWallX, bridgeY - 8);
                    ctx.lineTo(seg.rightWallX, bridgeY - 8);
                    ctx.moveTo(seg.leftWallX, bridgeY + 8);
                    ctx.lineTo(seg.rightWallX, bridgeY + 8);
                    ctx.stroke();

                    // Criss-cross steel beam pattern
                    ctx.strokeStyle = '#555555';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    for (let bx = seg.leftWallX + 15; bx < seg.rightWallX - 10; bx += 25) {
                        ctx.moveTo(bx, bridgeY - 8);
                        ctx.lineTo(bx + 15, bridgeY + 8);
                        ctx.moveTo(bx + 15, bridgeY - 8);
                        ctx.lineTo(bx, bridgeY + 8);
                    }
                    ctx.stroke();
                }
            }
        }
    }
}

// Global level engine
window.LevelGenerator = LevelGenerator;
