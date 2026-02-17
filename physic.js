// --- 물리 엔진 ---
const Physics = {
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null; const OPPOSITE_THRESHOLD = -0.9; 
        
        walls.forEach(w => {
            // 1. 철근이 향하는 방향과 마주보는 벽인지 확인
            let dot = w.nx * segNormal.x + w.ny * segNormal.y; 
            if (dot > OPPOSITE_THRESHOLD) return;
            
            // 2. 피복 두께(COVER)가 적용된 실제 벽의 양 끝점 계산
            let shiftedP1 = { x: w.x1 + w.nx * CONFIG.COVER, y: w.y1 + w.ny * CONFIG.COVER }; 
            let shiftedP2 = { x: w.x2 + w.nx * CONFIG.COVER, y: w.y2 + w.ny * CONFIG.COVER };
            
            // ==========================================================
            // ⭐ [추가된 로직] 벽 최소 길이 500mm(0.5m) 보장 확장 기능 ⭐
            // ==========================================================
            let dx = shiftedP2.x - shiftedP1.x;
            let dy = shiftedP2.y - shiftedP1.y;
            let len = Math.sqrt(dx * dx + dy * dy); // 현재 벽의 길이
            
            // 벽의 길이가 500mm 미만이라면 중심을 기준으로 양쪽으로 늘림
            if (len > 0 && len < 500) {
                let midX = (shiftedP1.x + shiftedP2.x) / 2;
                let midY = (shiftedP1.y + shiftedP2.y) / 2;
                let ux = dx / len; // 방향 벡터 X
                let uy = dy / len; // 방향 벡터 Y
                let halfLen = 250; // 목표 길이 500mm의 절반
                
                // 가상으로 확장된 양 끝점 갱신
                shiftedP1 = { x: midX - ux * halfLen, y: midY - uy * halfLen };
                shiftedP2 = { x: midX + ux * halfLen, y: midY + uy * halfLen };
            }
            // ==========================================================

            // 3. 확장된(또는 원래의) 벽을 대상으로 레이캐스팅 수행
            let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, shiftedP1, shiftedP2);
            if (hit && hit.dist < minDist) { 
                minDist = hit.dist; 
                target = { x: hit.x, y: hit.y }; 
            }
        }); 
        return target;
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
