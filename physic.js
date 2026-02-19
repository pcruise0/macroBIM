// --- 물리 엔진 (v012 - 초경량화/피복사전계산 연동 완료) ---
const Physics = {
    // 1. 중력장 탐색 (피복 계산 싹 제거, 순수 수학 연산만 남김)
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null;
        const OPPOSITE_THRESHOLD = -0.6; 
        
        walls.forEach(w => {
            // 철근 방향과 마주보는 벽인지 확인 (허용 오차 -0.6 유지)
            let dot = w.nx * segNormal.x + w.ny * segNormal.y; 
            if (dot > OPPOSITE_THRESHOLD) return;
            
            // ⭐ [다이어트 완료] 피복 계산, 500mm 강제 연장 로직 전부 삭제!
            // 이제 넘어온 walls(피복한계선)를 있는 그대로 씁니다.
            let p1 = { x: w.x1, y: w.y1 }; 
            let p2 = { x: w.x2, y: w.y2 };
            
            // 레이캐스팅 수행
            let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, p1, p2);
            if (hit && hit.dist < minDist) { 
                minDist = hit.dist; 
                target = { x: hit.x, y: hit.y, wall: w }; // FIT에 필요한 wall 정보 저장
            }
        }); 
        return target;
    },

    // 2. 물리 업데이트 루프 (기존 로직 완벽히 유지)
    updatePhysics: (rebar, walls) => {
        if (rebar.state === "FORMED") return;

        const { GRAVITY_K, DAMPING, CONVERGE } = CONFIG.PHYSICS; 
        rebar.debugPoints = []; 
        let allSegmentsSettled = true;

        rebar.segments.forEach((seg, idx) => {
            // 순차적 안착 로직 (WAITING -> FITTING)
            if (seg.state === "WAITING") { 
                allSegmentsSettled = false; 
                if (idx === 0 || rebar.segments[idx-1].state === "SETTLED") {
                    seg.state = "FITTING"; 
                }
            }
            
            if (seg.state === "FITTING") {
                allSegmentsSettled = false; 
                let segEnergy = 0; let maxPosError = 0; let validTargets = 0;

                // 노드별 물리 연산
                seg.nodes.forEach(node => {
                    let target = Physics.getGravityTarget(node.x, node.y, seg.normal, walls);
                    if (target) {
                        validTargets++; 
                        rebar.debugPoints.push(target); 
                        
                        // 벽 감지 성공! (FIT에 필요)
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

                // 안착 판정
                if (validTargets === seg.nodes.length && segEnergy < CONVERGE && maxPosError < 1.0) { 
                    seg.state = "SETTLED"; 
                    Physics.restoreSegmentLine(seg); 
                }
            }
        });

        // 모든 세그먼트 안착 직후, 단부 처리(ends) 실행
        if (allSegmentsSettled && rebar.state !== "FORMED") { 
            Physics.applyRebarEnds(rebar, walls); 
            
            if (rebar.finalize) rebar.finalize();
            rebar.state = "FORMED"; 
        }
    },

    // 3. 선분 복원 (노드들 평균 위치로 직선 만들기)
    restoreSegmentLine: (seg) => {
        let n1 = seg.nodes[0]; let n2 = seg.nodes[1]; 
        let cx = (n1.x + n2.x) / 2; let cy = (n1.y + n2.y) / 2;
        let dx = n2.x - n1.x; let dy = n2.y - n1.y; 
        let dist = MathUtils.hypot(dx, dy); 
        let ux, uy;

        if (dist > 0.01) { 
            ux = dx / dist; uy = dy / dist; 
            // 원래 방향과 반대면 뒤집기
            if (ux * seg.uDir.x + uy * seg.uDir.y < 0) { ux = -ux; uy = -uy; } 
        } else { 
            ux = seg.uDir.x; uy = seg.uDir.y; 
        }
        
        seg.uDir = { x: ux, y: uy };
        
        let halfLen = seg.initialLen / 2; 
        seg.p1 = { x: cx - ux * halfLen, y: cy - uy * halfLen }; 
        seg.p2 = { x: cx + ux * halfLen, y: cy + uy * halfLen };
    },

    // 4. 전역 투영 헬퍼
    projectPointToLine: (point, lineOrigin, lineDir) => {
        let dx = point.x - lineOrigin.x;
        let dy = point.y - lineOrigin.y;
        let dot = dx * lineDir.x + dy * lineDir.y;
        
        return {
            x: lineOrigin.x + dot * lineDir.x,
            y: lineOrigin.y + dot * lineDir.y
        };
    },

    // 5. 단부 처리 로직 (만능 파서 포함)
    applyRebarEnds: (rebar, walls) => {
        if (!rebar.ends) return;

        // 만능 파서 (입력 편의성)
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

        // 기준점(Anchor)에서 가장 먼 점 찾기
        const getFarthestWallPoint = (seg, wall, anchorPoint) => {
            // ⭐ [다이어트 완료] 피복 계산 삭제!
            // wall의 x1, y1, x2, y2 자체가 이미 피복 한계선이므로 그대로 씁니다.
            let d1 = (wall.x1 - anchorPoint.x) ** 2 + (wall.y1 - anchorPoint.y) ** 2;
            let d2 = (wall.x2 - anchorPoint.x) ** 2 + (wall.y2 - anchorPoint.y) ** 2;

            let targetP = (d1 > d2) ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };

            // 선택된 점을 철근 라인 위로 투영
            return Physics.projectPointToLine(targetP, seg.p1, seg.uDir);
        };

        // --- Begin Point (B) 처리 ---
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

        // --- End Point (E) 처리 ---
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
    
    // 6. 전역 레이캐스팅 헬퍼
    rayCastGlobal: (origin, dir, walls) => {
        let bestHit = null;
        let minDist = Infinity;
        
        walls.forEach(w => {
            // ⭐ [다이어트 완료] 피복 계산 삭제!
            let hit = MathUtils.rayLineIntersect(origin, dir, {x: w.x1, y: w.y1}, {x: w.x2, y: w.y2});
            if (hit && hit.dist < minDist && hit.dist > 0.1) { 
                minDist = hit.dist;
                bestHit = hit;
            }
        });
        return bestHit;
    }
};
