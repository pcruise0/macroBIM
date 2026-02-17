// --- 물리 엔진 ---
const Physics = {
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null; const OPPOSITE_THRESHOLD = -0.9; 
        walls.forEach(w => {
            let dot = w.nx * segNormal.x + w.ny * segNormal.y; if (dot > OPPOSITE_THRESHOLD) return;
            let shiftedP1 = { x: w.x1 + w.nx * CONFIG.COVER, y: w.y1 + w.ny * CONFIG.COVER }; 
            let shiftedP2 = { x: w.x2 + w.nx * CONFIG.COVER, y: w.y2 + w.ny * CONFIG.COVER };
            let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, shiftedP1, shiftedP2);
            if (hit && hit.dist < minDist) { minDist = hit.dist; target = { x: hit.x, y: hit.y }; }
        }); return target;
    },

    updatePhysics: (rebar, walls) => {
        if (rebar.state === "FORMED") return;
        const { GRAVITY_K, DAMPING, CONVERGE } = CONFIG.PHYSICS; 
        rebar.debugPoints = []; let allSegmentsSettled = true;

        rebar.segments.forEach((seg, idx) => {
            if (seg.state === "WAITING") { 
                allSegmentsSettled = false; 
                if (idx > 0 && rebar.segments[idx-1].state === "SETTLED") seg.state = "FITTING"; 
            }
            if (seg.state === "FITTING") {
                allSegmentsSettled = false; let segEnergy = 0; let maxPosError = 0; let validTargets = 0;
                seg.nodes.forEach(node => {
                    let target = Physics.getGravityTarget(node.x, node.y, seg.normal, walls);
                    if (target) {
                        validTargets++; rebar.debugPoints.push(target); 
                        let dx = target.x - node.x; let dy = target.y - node.y;
                        let err = MathUtils.hypot(dx, dy); if (err > maxPosError) maxPosError = err; 
                        node.vx += dx * GRAVITY_K; node.vy += dy * GRAVITY_K;
                    }
                    node.vx *= DAMPING; node.vy *= DAMPING; node.x += node.vx; node.y += node.vy; 
                    segEnergy += Math.abs(node.vx) + Math.abs(node.vy);
                });
                if (validTargets === seg.nodes.length && segEnergy < CONVERGE && maxPosError < 1.0) { 
                    seg.state = "SETTLED"; 
                    Physics.restoreSegmentLine(seg); 
                }
            }
        });

        if (allSegmentsSettled && rebar.state !== "FORMED") { 
            rebar.finalize();
            rebar.state = "FORMED"; 
        }
    },

    restoreSegmentLine: (seg) => {
        let n1 = seg.nodes[0]; let n2 = seg.nodes[1]; let cx = (n1.x + n2.x) / 2; let cy = (n1.y + n2.y) / 2;
        let dx = n2.x - n1.x; let dy = n2.y - n1.y; let dist = MathUtils.hypot(dx, dy); let ux, uy;
        if (dist > 0.01) { 
            ux = dx / dist; uy = dy / dist; 
            if (ux * seg.uDir.x + uy * seg.uDir.y < 0) { ux = -ux; uy = -uy; } 
        } else { 
            ux = seg.uDir.x; uy = seg.uDir.y; 
        }
        let halfLen = seg.initialLen / 2; 
        seg.p1 = { x: cx - ux * halfLen, y: cy - uy * halfLen }; 
        seg.p2 = { x: cx + ux * halfLen, y: cy + uy * halfLen };
    }
};
