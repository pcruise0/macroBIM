
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

        // 기본 교정 로직: 모든 철근에 공통인 "코너 닫기"만 수행
        finalize() {
            for (let i = 0; i < this.segments.length - 1; i++) {
                let seg1 = this.segments[i];
                let seg2 = this.segments[i+1];
                let corner = MathUtils.getLineIntersection(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
                if (corner) {
                    seg1.p2 = corner;
                    seg2.p1 = corner;
                }
            }
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
            
            // 1. 꼭짓점 정의 (한붓그리기 순서)
            let p1 = { x: x - C/2 - A, y: y + B };
            let p2 = { x: x - C/2,     y: y + B };
            let p3 = { x: x - C/2,     y: y };
            let p4 = { x: x + C/2,     y: y };
            let p5 = { x: x + C/2,     y: y + D };
            let p6 = { x: x + C/2 + E, y: y + D };

            // 2. 선분 생성 및 법선 벡터 교정 (벽면을 바라보도록)
            this.segments = [ 
                this.makeSeg(p1, p2, {x:0, y:1}, "FITTING"),  // A: 위로
                this.makeSeg(p2, p3, {x:-1, y:0}, "WAITING"), // B: 왼쪽으로
                this.makeSeg(p3, p4, {x:0, y:-1}, "WAITING"), // C: 아래로 (수정됨!)
                this.makeSeg(p4, p5, {x:1, y:0}, "WAITING"),  // D: 오른쪽으로
                this.makeSeg(p5, p6, {x:0, y:1}, "WAITING")   // E: 위로
            ];
            
            this.applyRotation();
            return this;
        }

        finalize() {
            // 1. 먼저 부모 클래스의 기능을 실행하여 내부 코너(B-C, C-D 등) 교점을 정리합니다.
            // 이 과정이 끝나면 segA.p2와 segE.p1이 코너 좌표로 확정됩니다.
            super.finalize();
    
            // 2. [A 구간 교정] 물리 엔진이 찾은 실제 벽면의 각도를 읽어옵니다.
            let segA = this.segments[0];
            // 물리 연산으로 안착된 노드들의 좌표 차이를 통해 실제 기울기(angle) 산출
            let angleA = Math.atan2(segA.nodes[1].y - segA.nodes[0].y, segA.nodes[1].x - segA.nodes[0].x);
    
            // p2(코너점)는 고정하고, 각도는 angleA를 따르며, 길이는 initialLen만큼 역방향으로 뻗음
            segA.p1 = {
                x: segA.p2.x - Math.cos(angleA) * segA.initialLen,
                y: segA.p2.y - Math.sin(angleA) * segA.initialLen
            };
    
            // 3. [E 구간 교정] 물리 엔진이 찾은 실제 벽면의 각도를 읽어옵니다.
            let segE = this.segments[this.segments.length - 1];
            let angleE = Math.atan2(segE.nodes[1].y - segE.nodes[0].y, segE.nodes[1].x - segE.nodes[0].x);
    
            // p1(코너점)은 고정하고, 각도는 angleE를 따르며, 길이는 initialLen만큼 정방향으로 뻗음
            segE.p2 = {
                x: segE.p1.x + Math.cos(angleE) * segE.initialLen,
                y: segE.p1.y + Math.sin(angleE) * segE.initialLen
            };
    
            console.log(`[Shape44] ${this.id}: 길이는 고정, 각도는 슬래브 벽면에 맞춰 정렬 완료!`);
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
            if (allSegmentsSettled && rebar.state !== "FORMED") { 
                rebar.finalize(); // ⭐ 철근이 스스로를 교정합니다.
                rebar.state = "FORMED"; 
            }
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
