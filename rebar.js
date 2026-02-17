    // =========================================================================
    //  3. REBAR AGENTS & PHYSICS (표준 형상 코드 1, 11, 23, 25, 44, 63 포함)
    // =========================================================================
    class RebarBase {
        constructor(center, dims, rotation = 0) { 
            this.center = center; 
            this.dims = dims; 
            this.rotation = rotation;
            this.segments = []; 
            this.state = "ASSEMBLING"; 
            this.debugPoints = []; 
        }

        makeSeg(p1, p2, normal, initialState) {
            let nodes = []; 
            CONFIG.PHYSICS.NODE_POS.forEach(ratio => { 
                nodes.push({ x: p1.x + (p2.x - p1.x) * ratio, y: p1.y + (p2.y - p1.y) * ratio, vx: 0, vy: 0 }); 
            });
            let dx = p2.x - p1.x; let dy = p2.y - p1.y; let initialLen = MathUtils.hypot(dx, dy);
            return { p1: {...p1}, p2: {...p2}, nodes: nodes, normal: normal, initialLen: initialLen, uDir: { x: dx/initialLen, y: dy/initialLen }, state: initialState }; 
        }

        applyRotation() {
            if (this.rotation === 0) return;
            this.segments.forEach(seg => {
                seg.p1 = geo_rotatePt2D(seg.p1, this.center, this.rotation);
                seg.p2 = geo_rotatePt2D(seg.p2, this.center, this.rotation);
                seg.nodes.forEach(node => {
                    let rPos = geo_rotatePt2D(node, this.center, this.rotation);
                    node.x = rPos.x; node.y = rPos.y;
                });
                let rNorm = geo_rotatePt2D(seg.normal, {x:0, y:0}, this.rotation);
                seg.normal = rNorm;
                let dx = seg.p2.x - seg.p1.x; let dy = seg.p2.y - seg.p1.y;
                seg.uDir = { x: dx/seg.initialLen, y: dy/seg.initialLen };
            });
        }

        // 공통 교정 로직: 내부 코너의 교점 정리
        finalize() {
            for (let i = 0; i < this.segments.length - 1; i++) {
                let seg1 = this.segments[i];
                let seg2 = this.segments[i+1];
                let corner = MathUtils.getLineIntersection(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
                if (corner) { seg1.p2 = corner; seg2.p1 = corner; }
            }
        }
    }

    // --- [Shape 01] 직선 철근 ---
    class Shape01 extends RebarBase {
        generate() {
            const {A} = this.dims; const {x,y} = this.center;
            let p1 = { x: x - A/2, y: y }; let p2 = { x: x + A/2, y: y };
            this.segments = [ this.makeSeg(p1, p2, {x:0, y:1}, "FITTING") ];
            this.applyRotation();
            return this;
        }
    }

    // --- [Shape 11] L자 철근 ---
    class Shape11 extends RebarBase {
        generate() {
            const {A,B} = this.dims; const {x,y} = this.center;
            let p1 = { x: x, y: y + A }; let p2 = { x: x, y: y }; let p3 = { x: x + B, y: y };
            this.segments = [ this.makeSeg(p1, p2, {x:-1, y:0}, "FITTING"), this.makeSeg(p2, p3, {x:0, y:-1}, "WAITING") ];
            this.applyRotation();
            return this;
        }
    }

    // --- [Shape 23] Z자 철근 ---
    class Shape23 extends RebarBase {
        generate() {
            const {A,B,C} = this.dims; const {x,y} = this.center;
            let p1 = { x: x, y: y + A }; let p2 = { x: x, y: y }; let p3 = { x: x + B, y: y }; let p4 = { x: x + B, y: y - C };
            this.segments = [ 
                this.makeSeg(p1, p2, {x:-1, y:0}, "FITTING"), 
                this.makeSeg(p2, p3, {x:0, y:-1}, "WAITING"), 
                this.makeSeg(p3, p4, {x:1, y:0}, "WAITING") 
            ];
            this.applyRotation();
            return this;
        }
    }

    // --- [Shape 25] 경사 복부용 U자 철근 ---
    class Shape25 extends RebarBase {
        generate() {
            const {A,B,C,D,E} = this.dims; const {x,y} = this.center;
            // A, B는 경사 길이, C, D는 수직 높이, E는 하단 폭
            let ax = Math.sqrt(Math.max(0, A*A - C*C)); let bx = Math.sqrt(Math.max(0, B*B - D*D));
            let p1 = { x: x - E/2 - ax, y: y + C };
            let p2 = { x: x - E/2,      y: y };
            let p3 = { x: x + E/2,      y: y };
            let p4 = { x: x + E/2 + bx, y: y + D };
            this.segments = [ 
                this.makeSeg(p1, p2, {x:-1, y:0}, "FITTING"), 
                this.makeSeg(p2, p3, {x:0, y:-1}, "WAITING"), 
                this.makeSeg(p3, p4, {x:1, y:0}, "WAITING") 
            ];
            this.applyRotation();
            return this;
        }
    }

    // --- [Shape 44] 표준 U자 철근 (날개 포함) ---
    class Shape44 extends RebarBase {
        generate() {
            const {A,B,C,D,E} = this.dims; const {x,y} = this.center;
            let p1 = { x: x - C/2 - A, y: y + B }; let p2 = { x: x - C/2, y: y + B }; let p3 = { x: x - C/2, y: y };
            let p4 = { x: x + C/2, y: y }; let p5 = { x: x + C/2, y: y + D }; let p6 = { x: x + C/2 + E, y: y + D };
            this.segments = [ 
                this.makeSeg(p1, p2, {x:0, y:1}, "FITTING"), this.makeSeg(p2, p3, {x:-1, y:0}, "WAITING"), 
                this.makeSeg(p3, p4, {x:0, y:-1}, "WAITING"), this.makeSeg(p4, p5, {x:1, y:0}, "WAITING"), 
                this.makeSeg(p5, p6, {x:0, y:1}, "WAITING") 
            ];
            this.applyRotation();
            return this;
        }
        finalize() {
            let angleA = Math.atan2(this.segments[0].nodes[1].y - this.segments[0].nodes[0].y, this.segments[0].nodes[1].x - this.segments[0].nodes[0].x);
            let angleE = Math.atan2(this.segments[4].nodes[1].y - this.segments[4].nodes[0].y, this.segments[4].nodes[1].x - this.segments[4].nodes[0].x);
            super.finalize();
            let segA = this.segments[0]; segA.p1 = { x: segA.p2.x - Math.cos(angleA) * segA.initialLen, y: segA.p2.y - Math.sin(angleA) * segA.initialLen };
            let segE = this.segments[4]; segE.p2 = { x: segE.p1.x + Math.cos(angleE) * segE.initialLen, y: segE.p1.y + Math.sin(angleE) * segE.initialLen };
        }
    }

    // --- [Shape 63] 사각 폐합 Stirrup (ㅁ자) ---
    class Shape63 extends RebarBase {
        generate() {
            const {A,B} = this.dims; const {x,y} = this.center; // A:높이, B:폭
            let p1 = { x: x - B/2, y: y + A/2 }; // TL
            let p2 = { x: x - B/2, y: y - A/2 }; // BL
            let p3 = { x: x + B/2, y: y - A/2 }; // BR
            let p4 = { x: x + B/2, y: y + A/2 }; // TR
            this.segments = [ 
                this.makeSeg(p1, p2, {x:-1, y:0}, "FITTING"), // 좌측벽
                this.makeSeg(p2, p3, {x:0, y:-1}, "WAITING"), // 하단벽
                this.makeSeg(p3, p4, {x:1, y:0}, "WAITING"),  // 우측벽
                this.makeSeg(p4, p1, {x:0, y:1}, "WAITING")   // 상단벽
            ];
            this.applyRotation();
            return this;
        }
        finalize() {
            super.finalize();
            // 마지막 세그먼트와 첫 세그먼트를 연결하여 폐합
            let last = this.segments[this.segments.length-1];
            let first = this.segments[0];
            let corner = MathUtils.getLineIntersection(last.p1, last.p2, first.p1, first.p2);
            if (corner) { last.p2 = corner; first.p1 = corner; }
        }
    }

    class RebarFactory { 
        static create(code, center, dims, rotation = 0) { 
            let r = null;
            if(code === 1) r = new Shape01(center, dims, rotation);
            else if(code === 11) r = new Shape11(center, dims, rotation);
            else if(code === 23) r = new Shape23(center, dims, rotation);
            else if(code === 25) r = new Shape25(center, dims, rotation);
            else if(code === 44) r = new Shape44(center, dims, rotation);
            else if(code === 63) r = new Shape63(center, dims, rotation);
            return r ? r.generate() : null;
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
