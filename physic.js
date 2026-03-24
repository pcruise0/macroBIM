// --- 물리 엔진 (박사님의 오리지널 로직 + 동적 피복 완벽 결합) --- v021
 const Physics = {
    getGravityTarget: (px, py, segNormal, walls) => {
        let minDist = Infinity; let target = null;
        const OPPOSITE_THRESHOLD = -0.6; // ⭐ 박사님의 원래 안전한 허용치 복구
        
        walls.forEach(w => {
            let dot = w.nx * segNormal.x + w.ny * segNormal.y; 
            if (dot > OPPOSITE_THRESHOLD) return;
            
            // ⭐ 피복 두께만 Tag를 읽어서 다르게 적용
            let cType = w.tag ? w.tag.toLowerCase() : 'outer';
            let coverVal = Domain.currentSection.covers[cType] || 50;

            let shiftedP1 = { x: w.x1 + w.nx * coverVal, y: w.y1 + w.ny * coverVal }; 
            let shiftedP2 = { x: w.x2 + w.nx * coverVal, y: w.y2 + w.ny * coverVal };
            
            // ⭐ [오리지널 로직 부활] 박사님이 짜두셨던 500mm 짧은벽 안전 보정!
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

    let segEnergy = 0;
    let maxPosError = 0;
    let validTargets = 0;
    let hitInfos = [];   // ✅ 노드별 wall hit 정보 수집

    seg.nodes.forEach(node => {
        let target = Physics.getGravityTarget(node.x, node.y, seg.normal, walls);

        if (target) {
            let dx = target.x - node.x;
            let dy = target.y - node.y;
            let err = MathUtils.hypot(dx, dy);

            validTargets++;
            rebar.debugPoints.push(target);

            seg.contactWall = target.wall; // 기존 호환 유지
            hitInfos.push({ wall: target.wall, dist: err });

            if (err > maxPosError) maxPosError = err;

            node.vx += dx * GRAVITY_K;
            node.vy += dy * GRAVITY_K;
        }

        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;

        segEnergy += Math.abs(node.vx) + Math.abs(node.vy);
    });

    if (validTargets === seg.nodes.length && segEnergy < CONVERGE && maxPosError < 1.0) {
        seg.state = "SETTLED";

        // ✅ settling 시점에 대표벽 확정
        seg.fitWall = Physics.resolveSegmentFitWall(seg, hitInfos);

        Physics.restoreSegmentLine(seg);
    }
}

        });

        if (allSegmentsSettled && rebar.state !== "FORMED") { 
            if (rebar.finalize) rebar.finalize(); // ① 먼저 코너 계산 완성
            Physics.applyRebarEnds(rebar, walls); // ② 그 다음 단부 연장 (최종값 보장)        
            rebar.state = "FORMED"; 
        }
    },

resolveSegmentFitWall: (seg, hitInfos = []) => {
    // set으로 배치된 세그먼트는 anchorWall 우선
    if (seg.anchorWall) return seg.anchorWall;

    // fitting 중 수집한 wall 후보를 다수결 + 거리합 최소 기준으로 선택
    const wallMap = new Map();

    hitInfos.forEach(info => {
        if (!info.wall) return;

        const wallId = info.wall.id || `${info.wall.x1},${info.wall.y1},${info.wall.x2},${info.wall.y2}`;

        if (!wallMap.has(wallId)) {
            wallMap.set(wallId, {
                wall: info.wall,
                count: 0,
                totalDist: 0
            });
        }

        const acc = wallMap.get(wallId);
        acc.count += 1;
        acc.totalDist += info.dist || 0;
    });

    let best = null;
    wallMap.forEach(item => {
        if (
            !best ||
            item.count > best.count ||
            (item.count === best.count && item.totalDist < best.totalDist)
        ) {
            best = item;
        }
    });

    return best ? best.wall : (seg.contactWall || null);
},

getSegmentFitWall: (seg) => {
    return seg.fitWall || seg.anchorWall || seg.contactWall || null;
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
    const barEnds = rebar.barEnds || rebar.ends; // 하위 호환
    if (!barEnds) return;

    const parseEndRule = (ruleObj) => {
        if (!ruleObj) return null;
        if (ruleObj.type !== undefined) {
            return { type: ruleObj.type.toUpperCase(), val: Number(ruleObj.val) };
        }
        let keys = Object.keys(ruleObj);
        if (keys.length > 0) {
            return { type: keys[0].toUpperCase(), val: Number(ruleObj[keys[0]]) };
        }
        return null;
    };

    const getShiftedWallEnds = (wall) => {
        let cType = wall.tag ? wall.tag.toLowerCase() : 'outer';
        let coverVal = Domain.currentSection.covers[cType] || 50;

        return {
            wp1: { x: wall.x1 + wall.nx * coverVal, y: wall.y1 + wall.ny * coverVal },
            wp2: { x: wall.x2 + wall.nx * coverVal, y: wall.y2 + wall.ny * coverVal }
        };
    };

    const getFarthestWallPoint = (seg, wall, anchorPoint) => {
        const { wp1, wp2 } = getShiftedWallEnds(wall);

        let d1 = (wp1.x - anchorPoint.x) ** 2 + (wp1.y - anchorPoint.y) ** 2;
        let d2 = (wp2.x - anchorPoint.x) ** 2 + (wp2.y - anchorPoint.y) ** 2;

        let targetP = (d1 > d2) ? wp1 : wp2;
        return Physics.projectPointToLine(targetP, seg.p1, seg.uDir);
    };

    const startRule = parseEndRule(barEnds.start || barEnds.B);
    const endRule   = parseEndRule(barEnds.end   || barEnds.E);

    // start = 첫 세그먼트 시작단
    if (startRule) {
        let seg = rebar.segments[0];

        if (startRule.type === "FIT") {
            let wall = Physics.getSegmentFitWall(seg);
            if (!wall) {
                console.error(`[FIT ERROR] ${rebar.id || 'UNKNOWN'} start.fit 에 사용할 대표벽이 없습니다.`);
            } else {
                let projected = getFarthestWallPoint(seg, wall, seg.p2);

                seg.p1 = {
                    x: projected.x + seg.uDir.x * startRule.val,
                    y: projected.y + seg.uDir.y * startRule.val
                };

                seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
            }
        } else if (startRule.type === "RAY") {
            let rayDir = { x: -seg.uDir.x, y: -seg.uDir.y };
            let rayOrigin = {
                x: seg.p1.x + rayDir.x * 10,
                y: seg.p1.y + rayDir.y * 10
            };

            let hit = Physics.rayCastGlobal(rayOrigin, rayDir, walls);

            if (hit) {
                seg.p1 = {
                    x: hit.x - seg.uDir.x * startRule.val,
                    y: hit.y - seg.uDir.y * startRule.val
                };

                seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
            }
        }
    }

    // end = 마지막 세그먼트 끝단
    if (endRule) {
        let seg = rebar.segments[rebar.segments.length - 1];

        if (endRule.type === "FIT") {
            let wall = Physics.getSegmentFitWall(seg);
            if (!wall) {
                console.error(`[FIT ERROR] ${rebar.id || 'UNKNOWN'} end.fit 에 사용할 대표벽이 없습니다.`);
            } else {
                let projected = getFarthestWallPoint(seg, wall, seg.p1);

                seg.p2 = {
                    x: projected.x + seg.uDir.x * endRule.val,
                    y: projected.y + seg.uDir.y * endRule.val
                };

                seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
            }
        } else if (endRule.type === "RAY") {
            let rayOrigin = {
                x: seg.p2.x + seg.uDir.x * 10,
                y: seg.p2.y + seg.uDir.y * 10
            };

            let hit = Physics.rayCastGlobal(rayOrigin, seg.uDir, walls);

            if (hit) {
                seg.p2 = {
                    x: hit.x + seg.uDir.x * endRule.val,
                    y: hit.y + seg.uDir.y * endRule.val
                };

                seg.initialLen = MathUtils.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
            }
        }
    }
},

    
   rayCastGlobal: (origin, dir, walls) => {
       let bestHit = null; let minDist = Infinity;
       walls.forEach(w => {
           let cType = w.tag ? w.tag.toLowerCase() : 'outer';
           let coverVal = Domain.currentSection.covers[cType] || 50;
           let shiftedP1 = { x: w.x1 + w.nx * coverVal, y: w.y1 + w.ny * coverVal };
           let shiftedP2 = { x: w.x2 + w.nx * coverVal, y: w.y2 + w.ny * coverVal };
           let hit = MathUtils.rayLineIntersect(origin, dir, shiftedP1, shiftedP2);
           if (hit && hit.dist < minDist && hit.dist > 0.1) { 
               // ⭐ [핵심 수정] 전방 방향 확인 — 후방 벽 완전 차단
               let dotCheck = (hit.x - origin.x) * dir.x + (hit.y - origin.y) * dir.y;
               if (dotCheck > 0) {
                   minDist = hit.dist;
                   bestHit = hit;
               }
           }
       });
       return bestHit;
   }
  
};
