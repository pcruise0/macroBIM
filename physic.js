// --- 물리 엔진 (v024 - RAY/FIT Ends Support) ---
const Physics = {
    // 1. 중력장 탐색 (기존 로직 유지)
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null; const OPPOSITE_THRESHOLD = -0.9; 
        
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

    // ⭐ 4. [신규 추가] 단부 처리 로직 (FIT / RAY)
    applyRebarEnds: (rebar, walls) => {
        if (!rebar.ends) return; // 설정 없으면 패스

        // 1. Begin Point (B) 처리
        if (rebar.ends.B) {
            let { type, val } = rebar.ends.B;
            let firstSeg = rebar.segments[0];

            if (type === "FIT") {
                // [FIT] 현재 붙어있는 벽의 시작점으로 이동
                // contactWall은 updatePhysics에서 기록됨
                if (firstSeg.contactWall) {
                    let wallStart = { x: firstSeg.contactWall.x1, y: firstSeg.contactWall.y1 };
                    // 벡터 연산: 벽 시작점 방향으로 길이 조정 (여기서는 단순 할당보다 정교한 투영 필요할 수 있으나, 일단 좌표 강제)
                    // 실제로는 벽 라인 위에서의 투영점이 더 정확하지만, FIT의 의미상 벽 끝점으로 이동.
                    // val(오프셋) 적용: 방향 벡터를 고려해야 함.
                    // 여기서는 간단히 '벽 끝점'으로 이동 후, 세그먼트 방향으로 val만큼 이동 구현
                    let newP1 = { 
                        x: wallStart.x - firstSeg.uDir.x * val, // 역방향이므로 -val? (정의에 따라 다름. 여기선 진행방향 기준 val만큼 더 뻗음으로 가정)
                        y: wallStart.y - firstSeg.uDir.y * val 
                    };
                    firstSeg.p1 = newP1;
                }
            } 
            else if (type === "RAY") { 
                // [RAY] 뒤쪽(반대) 방향으로 레이저 발사
                let rayDir = { x: -firstSeg.uDir.x, y: -firstSeg.uDir.y };
                let hit = Physics.rayCastGlobal(firstSeg.p1, rayDir, walls); // 전역 레이캐스팅 함수 필요
                if (hit) {
                    // hit point에서 val만큼 이동 (보통 val은 피복 두께인 음수)
                    // hit.point + rayDir * (-val) ? -> val이 -40이면 뒤로 40만큼. 즉 안쪽으로.
                    // 수식: P_new = Hit + RayDir * val (val이 음수면 Ray 반대방향=안쪽)
                    firstSeg.p1 = {
                        x: hit.x + rayDir.x * val,
                        y: hit.y + rayDir.y * val
                    };
                }
            }
        }

        // 2. End Point (E) 처리
        if (rebar.ends.E) {
            let { type, val } = rebar.ends.E;
            let lastSeg = rebar.segments[rebar.segments.length - 1];

            if (type === "FIT") {
                // [FIT] 현재 붙어있는 벽의 끝점으로 이동
                if (lastSeg.contactWall) {
                    let wallEnd = { x: lastSeg.contactWall.x2, y: lastSeg.contactWall.y2 };
                    let newP2 = {
                        x: wallEnd.x + lastSeg.uDir.x * val, // 정방향 연장
                        y: wallEnd.y + lastSeg.uDir.y * val
                    };
                    lastSeg.p2 = newP2;
                }
            } 
            else if (type === "RAY") {
                // [RAY] 앞쪽(정) 방향으로 레이저 발사
                let rayDir = lastSeg.uDir;
                let hit = Physics.rayCastGlobal(lastSeg.p2, rayDir, walls);
                if (hit) {
                    lastSeg.p2 = {
                        x: hit.x + rayDir.x * val, // val이 음수면 안쪽으로 후퇴
                        y: hit.y + rayDir.y * val
                    };
                }
            }
        }
        
        // 변경된 p1, p2에 맞춰 길이(initialLen) 재계산 (선택 사항)
        // rebar.finalize()에서 교점 정리하면서 다시 다듬어질 것임.
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
