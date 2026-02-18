// --- 물리 엔진 (v011 - RAY/FIT Ends Support) ---
const Physics = {
    // 1. 중력장 탐색 (기존 로직 유지)
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null;
        const OPPOSITE_THRESHOLD = -0.6; 
        
        walls.forEach(w => {
            // 철근 방향과 마주보는 벽인지 확인
            let dot = w.nx * segNormal.x + w.ny * segNormal.y; 
            if (dot > OPPOSITE_THRESHOLD) return;
            
            // 피복 두께 적용
            let shiftedP1 = { x: w.x1 + w.nx * CONFIG.COVER, y: w.y1 + w.ny * CONFIG.COVER }; 
            let shiftedP2 = { x: w.x2 + w.nx * CONFIG.COVER, y: w.y2 + w.ny * CONFIG.COVER };
            
            // 벽 최소 길이 보장 로직 (500mm 미만 확장)
            let dx = shiftedP2.x - shiftedP1.x; let dy = shiftedP2.y - shiftedP1.y;
            let len = Math.sqrt(dx * dx + dy * dy);
            
            if (len > 0 && len < 500) {
                let midX = (shiftedP1.x + shiftedP2.x) / 2;
                let midY = (shiftedP1.y + shiftedP2.y) / 2;
                let ux = dx / len; let uy = dy / len;
                let halfLen = 250; 
                shiftedP1 = { x: midX - ux * halfLen, y: midY - uy * halfLen };
                shiftedP2 = { x: midX + ux * halfLen, y: midY + uy * halfLen };
            }

            // 레이캐스팅 수행
            let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, shiftedP1, shiftedP2);
            if (hit && hit.dist < minDist) { 
                minDist = hit.dist; 
                target = { x: hit.x, y: hit.y, wall: w }; // ⭐ target에 wall 정보도 함께 저장 (FIT에 필요)
            }
        }); 
        return target;
    },

    // 2. 물리 업데이트 루프
    updatePhysics: (rebar, walls) => {
        if (rebar.state === "FORMED") return;

        const { GRAVITY_K, DAMPING, CONVERGE } = CONFIG.PHYSICS; 
        rebar.debugPoints = []; 
        let allSegmentsSettled = true; // 이번 프레임에 모두 안착했는지 체크용

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
                        
                        // ⭐ 어떤 벽에 붙었는지 세그먼트에 기록 (FIT 기능에 필수)
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

                // 안착 판정 (에너지가 낮고 위치 오차가 적으면 SETTLED)
                if (validTargets === seg.nodes.length && segEnergy < CONVERGE && maxPosError < 1.0) { 
                    seg.state = "SETTLED"; 
                    Physics.restoreSegmentLine(seg); 
                }
            }
        });

        // ⭐ [수정] 모든 세그먼트가 안착된 직후, 단부 처리(ends) 실행
        // rebar.state가 아직 "FORMED"가 아닐 때 한 번만 실행됨
        if (allSegmentsSettled && rebar.state !== "FORMED") { 
            Physics.applyRebarEnds(rebar, walls); // <--- ⭐ 여기가 핵심 추가 포인트!
            
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
        
        // 방향 벡터 갱신
        seg.uDir = { x: ux, y: uy };
        
        let halfLen = seg.initialLen / 2; 
        seg.p1 = { x: cx - ux * halfLen, y: cy - uy * halfLen }; 
        seg.p2 = { x: cx + ux * halfLen, y: cy + uy * halfLen };
    },

// ⭐ 전역 헬퍼: 점 P를 직선(Origin, Dir)에 수직 투영(Projection)하는 함수
    projectPointToLine: (point, lineOrigin, lineDir) => {
        // 투영 공식: Proj = Origin + ( (Point - Origin) • Dir ) * Dir
        let dx = point.x - lineOrigin.x;
        let dy = point.y - lineOrigin.y;
        let dot = dx * lineDir.x + dy * lineDir.y;
        
        return {
            x: lineOrigin.x + dot * lineDir.x,
            y: lineOrigin.y + dot * lineDir.y
        };
    },

// --- Physics.js 내부 applyRebarEnds 함수 (Anchor Distance 방식) ---
    applyRebarEnds: (rebar, walls) => {
        if (!rebar.ends) return;

        // 1. 만능 파서 (입력 편의성)
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

        // ⭐ 2. [박사님 아이디어 적용] 기준점(Anchor)에서 가장 먼 점 찾기
        const getFarthestWallPoint = (seg, wall, anchorPoint) => {
            // 벽의 두 점 (피복 적용)
            let wp1 = { x: wall.x1 + wall.nx * CONFIG.COVER, y: wall.y1 + wall.ny * CONFIG.COVER };
            let wp2 = { x: wall.x2 + wall.nx * CONFIG.COVER, y: wall.y2 + wall.ny * CONFIG.COVER };

            // 기준점(Anchor)으로부터의 거리 제곱 계산 (sqrt 생략 최적화)
            let d1 = (wp1.x - anchorPoint.x) ** 2 + (wp1.y - anchorPoint.y) ** 2;
            let d2 = (wp2.x - anchorPoint.x) ** 2 + (wp2.y - anchorPoint.y) ** 2;

            // 더 멀리 있는 점 선택
            let targetP = (d1 > d2) ? wp1 : wp2;

            // 선택된 점을 철근 라인 위로 투영 (직선 유지)
            return Physics.projectPointToLine(targetP, seg.p1, seg.uDir);
        };

        // --- Begin Point (B) 처리 ---
        if (rebar.ends.B) {
            let rule = parseEndRule(rebar.ends.B);
            if (rule) {
                let { type, val } = rule;
                let seg = rebar.segments[0];

                if (type === "FIT" && seg.contactWall) {
                    // ⭐ 시작점을 바꿀 거니까, 기준점(Anchor)은 '끝점(p2)'가 됨
                    // p2에서 가장 멀리 떨어진 벽의 점 = 벽의 시작 부분
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
                    // ⭐ 끝점을 바꿀 거니까, 기준점(Anchor)은 '시작점(p1)'이 됨
                    // p1에서 가장 멀리 떨어진 벽의 점 = 벽의 끝 부분
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
    
    // ⭐ 5. [신규 추가] 전역 레이캐스팅 헬퍼
    rayCastGlobal: (origin, dir, walls) => {
        let bestHit = null;
        let minDist = Infinity;
        
        // 충분히 긴 거리로 설정 (화면 전체 커버)
        let farPoint = { x: origin.x + dir.x * 100000, y: origin.y + dir.y * 100000 };

        walls.forEach(w => {
            // 벽의 피복 적용된 좌표 계산 (일관성 유지)
            let shiftedP1 = { x: w.x1 + w.nx * CONFIG.COVER, y: w.y1 + w.ny * CONFIG.COVER };
            let shiftedP2 = { x: w.x2 + w.nx * CONFIG.COVER, y: w.y2 + w.ny * CONFIG.COVER };

            let hit = MathUtils.rayLineIntersect(origin, dir, shiftedP1, shiftedP2);
            if (hit && hit.dist < minDist && hit.dist > 0.1) { // 0.1은 자기 자신 벽 제외용 오차
                minDist = hit.dist;
                bestHit = hit;
            }
        });
        return bestHit;
    }
};
