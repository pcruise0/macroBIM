// --- 물리 엔진 (v014 - 부위별 동적 피복 런타임 적용) ---
const Physics = {
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null;
        const OPPOSITE_THRESHOLD = -0.5; 
        
        walls.forEach(w => {
            let dot = w.nx * segNormal.x + w.ny * segNormal.y; 
            if (dot > OPPOSITE_THRESHOLD) return;
            
            // ⭐ [핵심 복구] 박사님의 런타임 시프트 부활 + 3중 피복 태그 적용
            let cType = w.tag ? w.tag.toLowerCase() : 'outer';
            let coverVal = Domain.currentSection.covers[cType] || 50;
            
            let shiftedP1 = { x: w.x1 + w.nx * coverVal, y: w.y1 + w.ny * coverVal }; 
            let shiftedP2 = { x: w.x2 + w.nx * coverVal, y: w.y2 + w.ny * coverVal };
            
            // (무한선, 500mm 강제연장 모두 삭제. 정직한 교차판정만 수행)
            let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, shiftedP1, shiftedP2);
            if (hit && hit.dist < minDist) { 
                minDist = hit.dist; 
                target = { x: hit.x, y: hit.y, wall: w }; 
            }
        }); 
        return target;
    },

    updatePhysics: (rebar, walls) => {
        if (rebar.state === "FORMED") return;
        const { GRAVITY_K, DAMPING, CONVERGE } = CONFIG.PHYSICS; 
        rebar.debugPoints = []; 
        let allSegmentsSettled = true; 

        rebar.segments.forEach((seg, idx) => {
            if (seg.state === "WAITING") { 
                allSegmentsSettled = false; 
                if (idx === 0 || rebar.segments[idx-1].state === "SETTLED") seg.state = "FITTING"; 
            }
            if (seg.state === "FITTING") {
                allSegmentsSettled = false; 
                let segEnergy = 0; let maxPosError = 0; let validTargets = 0;

                seg.nodes.forEach(node => {
                    let target = Physics.getGravityTarget(node.x, node.y, seg.normal, walls);
                    if (target) {
                        validTargets++; 
                        rebar.debugPoints.push(target); 
                        seg.contactWall = target.wall; 
                        let dx = target.x - node.x; let dy = target.y - node.y;
                        let err = MathUtils.hypot(dx, dy); 
                        if (err > maxPosError) maxPosError = err; 
                        node.vx += dx * GRAVITY_K; node.vy += dy * GRAVITY_K;
                    }
                    node.vx *= DAMPING; node.vy *= DAMPING; 
                    node.x += node.vx; node.y += node.vy; 
                    segEnergy += Math.abs(node.vx) + Math.abs(node.vy);
                });

                if (validTargets === seg.nodes.length && segEnergy < CONVERGE && maxPosError < 1.0) { 
                    seg.state = "SETTLED"; 
                    Physics.restoreSegmentLine(seg); 
                }
            }
        });

        if (allSegmentsSettled && rebar.state !== "FORMED") { 
            Physics.applyRebarEnds(rebar, walls); 
            if (rebar.finalize) rebar.finalize();
            rebar.state = "FORMED"; 
        }
    },

    restoreSegmentLine: (seg) => {
        let n1 = seg.nodes[0]; let n2 = seg.nodes[1]; 
        let cx = (n1.x + n2.x) / 2; let cy = (n1.y + n2.y) / 2;
        let dx = n2.x - n1.x; let dy = n2.y - n1.y; 
        let dist = MathUtils.hypot(dx, dy); 
        let ux, uy;
        if (dist > 0.01) { 
            ux = dx / dist; uy = dy / dist; 
            if (ux * seg.uDir.x + uy * seg.uDir.y < 0) { ux = -ux; uy = -uy; } 
        } else { ux = seg.uDir.x; uy = seg.uDir.y; }
        seg.uDir = { x: ux, y: uy };
        let halfLen = seg.initialLen / 2; 
        seg.p1 = { x: cx - ux * halfLen, y: cy - uy * halfLen }; 
        seg.p2 = { x: cx + ux * halfLen, y: cy + uy * halfLen };
    },

    projectPointToLine: (point, lineOrigin, lineDir) => {
        let dx = point.x - lineOrigin.x; let dy = point.y - lineOrigin.y;
        let dot = dx * lineDir.x + dy * lineDir.y;
        return { x: lineOrigin.x + dot * lineDir.x, y: lineOrigin.y + dot * lineDir.y };
    },

    applyRebarEnds: (rebar, walls) => {
        if (!rebar.ends) return;
        const parseEndRule = (ruleObj) => {
            if (!ruleObj) return null;
            if (ruleObj.type !== undefined) return { type: ruleObj.type.toUpperCase(), val: ruleObj.val };
            let keys = Object.keys(ruleObj);
            if (keys.length > 0) return { type: keys[0].toUpperCase(), val: ruleObj[keys[0]] };
            return null;
        };

        const getFarthestWallPoint = (seg, wall, anchorPoint) => {
            // ⭐ FIT을 할 때도 동적 피복 적용
            let cType = wall.tag ? wall.tag.toLowerCase() : 'outer';
            let coverVal = Domain.currentSection.covers[cType] || 50;
            
            let wp1 = { x: wall.x1 + wall.nx * coverVal, y: wall.y1 + wall.ny * coverVal };
            let wp2 = { x: wall.x2 + wall.nx * coverVal, y: wall.y2 + wall.ny * coverVal };

            let d1 = (wp1.x - anchorPoint.x) ** 2 + (wp1.y - anchorPoint.y) ** 2;
            let d2 = (wp2.x - anchorPoint.x) ** 2 + (wp2.y - anchorPoint.y) ** 2;
            let targetP = (d1 > d2) ? wp1 : wp2;
            return Physics.projectPointToLine(targetP, seg.p1, seg.uDir);
        };

        if (rebar.ends.B) {
            let rule = parseEndRule(rebar.ends.B);
            if (rule) {
                let seg = rebar.segments[0];
                if (rule.type === "FIT" && seg.contactWall) {
                    let projected = getFarthestWallPoint(seg, seg.contactWall, seg.p2);
                    seg.p1 = { x: projected.x + seg.uDir.x * rule.val, y: projected.y + seg.uDir.y * rule.val };
                    seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                } else if (rule.type === "RAY") { 
                    let rayDir = { x: -seg.uDir.x, y: -seg.uDir.y };
                    let rayOrigin = { x: seg.p1.x + rayDir.x * 10, y: seg.p1.y + rayDir.y * 10 };
                    let hit = Physics.rayCastGlobal(rayOrigin, rayDir, walls);
                    if (hit) {
                        seg.p1 = { x: hit.x + rayDir.x * rule.val, y: hit.y + rayDir.y * rule.val };
                        seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                    }
                }
            }
        }

        if (rebar.ends.E) {
            let rule = parseEndRule(rebar.ends.E);
            if (rule) {
                let seg = rebar.segments[rebar.segments.length - 1];
                if (rule.type === "FIT" && seg.contactWall) {
                    let projected = getFarthestWallPoint(seg, seg.contactWall, seg.p1);
                    seg.p2 = { x: projected.x + seg.uDir.x * rule.val, y: projected.y + seg.uDir.y * rule.val };
                    seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                } else if (rule.type === "RAY") {
                    let rayOrigin = { x: seg.p2.x + seg.uDir.x * 10, y: seg.p2.y + seg.uDir.y * 10 };
                    let hit = Physics.rayCastGlobal(rayOrigin, seg.uDir, walls);
                    if (hit) {
                        seg.p2 = { x: hit.x + seg.uDir.x * rule.val, y: hit.y + seg.uDir.y * rule.val };
                        seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                    }
                }
            }
        }
    },
    
    rayCastGlobal: (origin, dir, walls) => {
        let bestHit = null; let minDist = Infinity;
        walls.forEach(w => {
            // ⭐ 글로벌 레이캐스팅(FIT/RAY 단부처리) 시에도 동적 피복 적용
            let cType = w.tag ? w.tag.toLowerCase() : 'outer';
            let coverVal = Domain.currentSection.covers[cType] || 50;
            let shiftedP1 = { x: w.x1 + w.nx * coverVal, y: w.y1 + w.ny * coverVal }; 
            let shiftedP2 = { x: w.x2 + w.nx * coverVal, y: w.y2 + w.ny * coverVal };

            let hit = MathUtils.rayLineIntersect(origin, dir, shiftedP1, shiftedP2);
            if (hit && hit.dist < minDist && hit.dist > 0.1) { 
                minDist = hit.dist; bestHit = hit; 
            }
        });
        return bestHit;
    }
};
