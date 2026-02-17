
    // =========================================================================
    //  3. REBAR AGENTS & PHYSICS 
    // =========================================================================
class RebarBase {
        // rotation 인자 추가
        constructor(center, dims, rotation = 0) { 
            this.center = center; 
            this.dims = dims; 
            this.rotation = rotation; // 회전각 저장
            this.segments = []; 
            this.state = "ASSEMBLING"; 
            this.debugPoints = []; 
        }

        // 기존 makeSeg는 유지하되, 모든 생성이 끝난 후 회전을 적용합니다.
        applyRotation() {
            if (this.rotation === 0) return;
            
            this.segments.forEach(seg => {
                // 1. 선분의 양 끝점(p1, p2) 회전 (기준점: this.center)
                seg.p1 = geo_rotatePt2D(seg.p1, this.center, this.rotation);
                seg.p2 = geo_rotatePt2D(seg.p2, this.center, this.rotation);
                
                // 2. 물리 엔진용 노드(nodes)들 회전
                seg.nodes.forEach(node => {
                    let rPos = geo_rotatePt2D(node, this.center, this.rotation);
                    node.x = rPos.x; node.y = rPos.y;
                });
                
                // 3. ⭐매우 중요: 법선 벡터(normal)도 회전! (벡터이므로 기준점 {0,0})
                let rNorm = geo_rotatePt2D(seg.normal, {x:0, y:0}, this.rotation);
                seg.normal = rNorm;
                
                // 4. 단위 방향 벡터(uDir) 재계산
                let dx = seg.p2.x - seg.p1.x; let dy = seg.p2.y - seg.p1.y;
                seg.uDir = { x: dx/seg.initialLen, y: dy/seg.initialLen };
            });
        }
        
        makeSeg(p1, p2, normal, initialState) {
            let nodes = []; 
            CONFIG.PHYSICS.NODE_POS.forEach(ratio => { 
                nodes.push({ x: p1.x + (p2.x - p1.x) * ratio, y: p1.y + (p2.y - p1.y) * ratio, vx: 0, vy: 0 }); 
            });
            let dx = p2.x - p1.x; let dy = p2.y - p1.y; let initialLen = MathUtils.hypot(dx, dy);
            return { p1: {...p1}, p2: {...p2}, nodes: nodes, normal: normal, initialLen: initialLen, uDir: { x: dx/initialLen, y: dy/initialLen }, state: initialState }; 
        }
    }

    // Shape21, Shape44는 생성 직후 applyRotation()만 호출해주면 끝납니다.
    class Shape21 extends RebarBase {
        generate() {
            const {A,B,C} = this.dims; const {x,y} = this.center;
            let bl = { x: x - B/2, y: y }; let br = { x: x + B/2, y: y }; 
            let tl = { x: bl.x, y: bl.y + A }; let tr = { x: br.x, y: br.y + C }; 
            this.segments = [ this.makeSeg(tl, bl, {x:-1, y:0}, "FITTING"), this.makeSeg(bl, br, {x:0, y:-1}, "WAITING"), this.makeSeg(br, tr, {x:1, y:0}, "WAITING") ];
            
            this.applyRotation(); // 회전 공정 추가!
            return this;
        }
    }

    class Shape44 extends RebarBase {
        generate() {
            const {A,B,C,D,E} = this.dims; const {x,y} = this.center;
            
            // 1. 주요 꼭짓점 6개를 좌측에서 우측 순서대로 정의 (한붓그리기 순서)
            // P1: 좌측 상단 A 끝점 (가장 왼쪽)
            let p1 = { x: x - C/2 - A, y: y + B };
            // P2: 좌측 상단 코너 (A와 B가 만나는 점)
            let p2 = { x: x - C/2,     y: y + B };
            // P3: 좌측 하단 코너 (B와 C가 만나는 점)
            let p3 = { x: x - C/2,     y: y };
            // P4: 우측 하단 코너 (C와 D가 만나는 점)
            let p4 = { x: x + C/2,     y: y };
            // P5: 우측 상단 코너 (D와 E가 만나는 점)
            let p5 = { x: x + C/2,     y: y + D };
            // P6: 우측 상단 E 끝점 (가장 오른쪽)
            let p6 = { x: x + C/2 + E, y: y + D };

            // 2. 순서대로 선분 생성 (법선 벡터 방향 주의: U자 내측을 향하도록)
            this.segments = [ 
                // Seg A (P1 -> P2): 상단 수평 (법선: 위쪽)
                this.makeSeg(p1, p2, {x:0, y:1}, "FITTING"), 
                // Seg B (P2 -> P3): 좌측 수직 (법선: 오른쪽=내측)
                this.makeSeg(p2, p3, {x:1, y:0}, "WAITING"), 
                // Seg C (P3 -> P4): 하단 수평 (법선: 위쪽=내측)
                this.makeSeg(p3, p4, {x:0, y:1}, "WAITING"), 
                // Seg D (P4 -> P5): 우측 수직 (법선: 왼쪽=내측)
                this.makeSeg(p4, p5, {x:-1, y:0}, "WAITING"), 
                // Seg E (P5 -> P6): 상단 수평 (법선: 위쪽)
                this.makeSeg(p5, p6, {x:0, y:1}, "WAITING") 
            ];
            
            this.applyRotation();
            return this;
        }
    }

    class RebarFactory { 
        static create(code, center, dims, rotation = 0) { 
            let rebar = null;
            if(code === 21) rebar = new Shape21(center, dims, rotation).generate(); 
            if(code === 44) rebar = new Shape44(center, dims, rotation).generate(); 
            return rebar;
        } 
    }

    const Physics = {
        getGravityTarget: (px, py, segNormal, walls) => {
            let minDist = Infinity; let target = null; const OPPOSITE_THRESHOLD = -0.9; 
            walls.forEach(w => {
                let dot = w.nx * segNormal.x + w.ny * segNormal.y; if (dot > OPPOSITE_THRESHOLD) return;
                let shiftedP1 = { x: w.x1 + w.nx * CONFIG.COVER, y: w.y1 + w.ny * CONFIG.COVER }; let shiftedP2 = { x: w.x2 + w.nx * CONFIG.COVER, y: w.y2 + w.ny * CONFIG.COVER };
                let hit = MathUtils.rayLineIntersect({x: px, y: py}, segNormal, shiftedP1, shiftedP2);
                if (hit && hit.dist < minDist) { minDist = hit.dist; target = { x: hit.x, y: hit.y }; }
            }); return target;
        },
        updatePhysics: (rebar, walls) => {
            if (rebar.state === "FORMED") return;
            const { GRAVITY_K, DAMPING, CONVERGE } = CONFIG.PHYSICS; rebar.debugPoints = []; let allSegmentsSettled = true;
            rebar.segments.forEach((seg, idx) => {
                if (seg.state === "WAITING") { allSegmentsSettled = false; if (idx > 0 && rebar.segments[idx-1].state === "SETTLED") seg.state = "FITTING"; }
                if (seg.state === "FITTING") {
                    allSegmentsSettled = false; let segEnergy = 0; let maxPosError = 0; let validTargets = 0;
                    seg.nodes.forEach(node => {
                        let target = Physics.getGravityTarget(node.x, node.y, seg.normal, walls);
                        if (target) {
                            validTargets++; rebar.debugPoints.push(target); let dx = target.x - node.x; let dy = target.y - node.y;
                            let err = Math.sqrt(dx*dx + dy*dy); if (err > maxPosError) maxPosError = err; node.vx += dx * GRAVITY_K; node.vy += dy * GRAVITY_K;
                        }
                        node.vx *= DAMPING; node.vy *= DAMPING; node.x += node.vx; node.y += node.vy; segEnergy += Math.abs(node.vx) + Math.abs(node.vy);
                    });
                    if (validTargets === seg.nodes.length && segEnergy < CONVERGE && maxPosError < 1.0) { seg.state = "SETTLED"; Physics.restoreSegmentLine(seg); }
                }
            });
            if (allSegmentsSettled && rebar.state !== "FORMED") { Physics.finalizeMergedShape(rebar); rebar.state = "FORMED"; }
        },
        restoreSegmentLine: (seg) => {
            let n1 = seg.nodes[0]; let n2 = seg.nodes[1]; let cx = (n1.x + n2.x) / 2; let cy = (n1.y + n2.y) / 2;
            let dx = n2.x - n1.x; let dy = n2.y - n1.y; let dist = MathUtils.hypot(dx, dy); let ux, uy;
            if (dist > 0.01) { ux = dx / dist; uy = dy / dist; if (ux * seg.uDir.x + uy * seg.uDir.y < 0) { ux = -ux; uy = -uy; } } else { ux = seg.uDir.x; uy = seg.uDir.y; }
            let halfLen = seg.initialLen / 2; seg.p1 = { x: cx - ux * halfLen, y: cy - uy * halfLen }; seg.p2 = { x: cx + ux * halfLen, y: cy + uy * halfLen };
        },
        finalizeMergedShape: (rebar) => {
            for (let i = 0; i < rebar.segments.length - 1; i++) {
                let seg1 = rebar.segments[i]; let seg2 = rebar.segments[i+1];
                let corner = MathUtils.getLineIntersection(seg1.p1, seg1.p2, seg2.p1, seg2.p2); if (corner) { seg1.p2 = corner; seg2.p1 = corner; }
            }
        }
    };
