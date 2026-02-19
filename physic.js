// =========================================================================
    //  Physics 물리 엔진 (v013 - 무한선분 레이더 탑재)
    // =========================================================================
    const Physics = {
        getGravityTarget: (px, py, segNormal, walls) => {
            let minDist = Infinity; let target = null;
            const OPPOSITE_THRESHOLD = -0.5; 
            
            walls.forEach(w => {
                let dot = w.nx * segNormal.x + w.ny * segNormal.y; 
                if (dot > OPPOSITE_THRESHOLD) return;
                
                // ⭐ [핵심 수정] 철근 노드가 빗나가지 않도록 벽체를 가상으로 양쪽 5000mm씩 길게 늘립니다.
                // 피복 계산은 뺐으므로, 있는 그대로의 벽체를 무한 직선처럼 취급합니다.
                let dx = w.x2 - w.x1; let dy = w.y2 - w.y1;
                let len = MathUtils.hypot(dx, dy);
                if (len < 0.001) return;
                let ux = dx / len; let uy = dy / len;
                
                const EXT = 5000; 
                let extP1 = { x: w.x1 - ux * EXT, y: w.y1 - uy * EXT };
                let extP2 = { x: w.x2 + ux * EXT, y: w.y2 + uy * EXT };
                
                let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, extP1, extP2);
                if (hit && hit.dist < minDist) { 
                    minDist = hit.dist; 
                    target = { x: hit.x, y: hit.y, wall: w }; // 실제 wall 데이터 저장
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
                    if (idx === 0 || rebar.segments[idx-1].state === "SETTLED") {
                        seg.state = "FITTING"; 
                    }
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

                    // 드디어 완벽하게 SETTLED가 작동하여 평행을 맞춥니다!
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
            } else { 
                ux = seg.uDir.x; uy = seg.uDir.y; 
            }
            
            seg.uDir = { x: ux, y: uy };
            
            let halfLen = seg.initialLen / 2; 
            seg.p1 = { x: cx - ux * halfLen, y: cy - uy * halfLen }; 
            seg.p2 = { x: cx + ux * halfLen, y: cy + uy * halfLen };
        },

        projectPointToLine: (point, lineOrigin, lineDir) => {
            let dx = point.x - lineOrigin.x;
            let dy = point.y - lineOrigin.y;
            let dot = dx * lineDir.x + dy * lineDir.y;
            return { x: lineOrigin.x + dot * lineDir.x, y: lineOrigin.y + dot * lineDir.y };
        },

        applyRebarEnds: (rebar, walls) => {
            if (!rebar.ends) return;

            const parseEndRule = (ruleObj) => {
                if (!ruleObj) return null;
                if (ruleObj.type !== undefined) return { type: ruleObj.type.toUpperCase(), val: ruleObj.val };
                let keys = Object.keys(ruleObj);
                if (keys.length > 0) {
                    let cmd = keys[0];
                    return { type: cmd.toUpperCase(), val: ruleObj[cmd] };
                }
                return null;
            };

            const getFarthestWallPoint = (seg, wall, anchorPoint) => {
                // 여기서 사용하는 wall은 연장되지 않은 '진짜 벽(피복선)'이므로 정확히 끝에서 멈춥니다!
                let d1 = (wall.x1 - anchorPoint.x) ** 2 + (wall.y1 - anchorPoint.y) ** 2;
                let d2 = (wall.x2 - anchorPoint.x) ** 2 + (wall.y2 - anchorPoint.y) ** 2;
                let targetP = (d1 > d2) ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
                return Physics.projectPointToLine(targetP, seg.p1, seg.uDir);
            };

            if (rebar.ends.B) {
                let rule = parseEndRule(rebar.ends.B);
                if (rule) {
                    let { type, val } = rule;
                    let seg = rebar.segments[0];

                    if (type === "FIT" && seg.contactWall) {
                        let projected = getFarthestWallPoint(seg, seg.contactWall, seg.p2);
                        seg.p1 = { x: projected.x + seg.uDir.x * val, y: projected.y + seg.uDir.y * val };
                        seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                    } else if (type === "RAY") { 
                        let rayDir = { x: -seg.uDir.x, y: -seg.uDir.y };
                        const JUMP = 10;
                        let rayOrigin = { x: seg.p1.x + rayDir.x * JUMP, y: seg.p1.y + rayDir.y * JUMP };
                        let hit = Physics.rayCastGlobal(rayOrigin, rayDir, walls);
                        if (hit) {
                            seg.p1 = { x: hit.x + rayDir.x * val, y: hit.y + rayDir.y * val };
                            seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                        }
                    }
                }
            }

            if (rebar.ends.E) {
                let rule = parseEndRule(rebar.ends.E);
                if (rule) {
                    let { type, val } = rule;
                    let seg = rebar.segments[rebar.segments.length - 1];

                    if (type === "FIT" && seg.contactWall) {
                        let projected = getFarthestWallPoint(seg, seg.contactWall, seg.p1);
                        seg.p2 = { x: projected.x + seg.uDir.x * val, y: projected.y + seg.uDir.y * val };
                        seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                    } else if (type === "RAY") {
                        let rayDir = seg.uDir;
                        const JUMP = 10;
                        let rayOrigin = { x: seg.p2.x + rayDir.x * JUMP, y: seg.p2.y + rayDir.y * JUMP };
                        let hit = Physics.rayCastGlobal(rayOrigin, rayDir, walls);
                        if (hit) {
                            seg.p2 = { x: hit.x + rayDir.x * val, y: hit.y + rayDir.y * val };
                            seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
                        }
                    }
                }
            }
        },
        
        rayCastGlobal: (origin, dir, walls) => {
            let bestHit = null;
            let minDist = Infinity;
            walls.forEach(w => {
                let hit = MathUtils.rayLineIntersect(origin, dir, {x: w.x1, y: w.y1}, {x: w.x2, y: w.y2});
                if (hit && hit.dist < minDist && hit.dist > 0.1) { 
                    minDist = hit.dist;
                    bestHit = hit;
                }
            });
            return bestHit;
        }
    };
