class RebarBase {
    constructor(center, dims, rotation = 0, ang = null, nor = null) { 
        this.center = center; 
        this.dims = dims; 
        this.rotation = rotation;
        this.ang = ang; 
        this.nor = nor; 
        this.segments = []; 
        this.state = "ASSEMBLING"; 
        this.debugPoints = []; 
    }

    makeSeg(p1, p2, normal, initialState) {
        let nodes = []; 
        CONFIG.PHYSICS.NODE_POS.forEach(ratio => { 
            nodes.push({ x: p1.x + (p2.x - p1.x) * ratio, y: p1.y + (p2.y - p1.y) * ratio, vx: 0, vy: 0 }); 
        });
        let dx = p2.x - p1.x; let dy = p2.y - p1.y; 
        let initialLen = MathUtils.hypot(dx, dy);
        return { 
            p1: {...p1}, p2: {...p2}, nodes: nodes, 
            normal: normal, initialLen: initialLen, 
            uDir: { x: dx/initialLen, y: dy/initialLen }, 
            state: initialState 
        }; 
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

    buildSequential(lengths, initAngle, defaultAng, defaultNor, getAnchorPos) {
        // ⭐ 세그먼트용 키(A, B, C)와 각도용 키(RA, RB, RC)를 엄격히 분리!
        const segKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const angKeys = ['RA', 'RB', 'RC', 'RD', 'RE', 'RF'];

        let angArray = defaultAng.map((def, i) => (this.ang && this.ang[angKeys[i]] !== undefined) ? this.ang[angKeys[i]] : def);
        let norArray = defaultNor.map((def, i) => (this.nor && this.nor[segKeys[i]] !== undefined) ? this.nor[segKeys[i]] : def);

        let pts = [{x: 0, y: 0}];
        let currentAngle = initAngle;

        for (let i = 0; i < lengths.length; i++) {
            if (i > 0) currentAngle += angArray[i - 1]; 
            let rad = currentAngle * Math.PI / 180;
            let prev = pts[i];
            pts.push({
                x: prev.x + lengths[i] * Math.cos(rad),
                y: prev.y + lengths[i] * Math.sin(rad)
            });
        }

        let anchor = getAnchorPos(pts);
        let dx = this.center.x - anchor.x;
        let dy = this.center.y - anchor.y;
        pts.forEach(p => { p.x += dx; p.y += dy; });

        this.segments = [];
        for (let i = 0; i < lengths.length; i++) {
            let p1 = pts[i]; let p2 = pts[i+1];
            let vx = p2.x - p1.x; let vy = p2.y - p1.y;
            let len = MathUtils.hypot(vx, vy);
            let ux = vx / len; let uy = vy / len;
            
            let nSign = norArray[i];
            let nx = nSign === 1 ? -uy : uy;
            let ny = nSign === 1 ? ux : -ux;
            
            let state = (i === 0) ? "FITTING" : "WAITING";
            this.segments.push(this.makeSeg(p1, p2, {x: nx, y: ny}, state));
        }

        this.applyRotation();
        return this;
    }

    finalize() {
        for (let i = 0; i < this.segments.length - 1; i++) {
            let seg1 = this.segments[i]; let seg2 = this.segments[i+1];
            let corner = MathUtils.getLineIntersection(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
            if (corner) { seg1.p2 = corner; seg2.p1 = corner; }
        }

        if (this.segments.length > 0) {
            let first = this.segments[0];
            let angF = Math.atan2(first.nodes[1].y - first.nodes[0].y, first.nodes[1].x - first.nodes[0].x);
            first.p1 = { x: first.p2.x - Math.cos(angF) * first.initialLen, y: first.p2.y - Math.sin(angF) * first.initialLen };
        }

        if (this.segments.length > 1) {
            let last = this.segments[this.segments.length - 1];
            let angL = Math.atan2(last.nodes[1].y - last.nodes[0].y, last.nodes[1].x - last.nodes[0].x);
            last.p2 = { x: last.p1.x + Math.cos(angL) * last.initialLen, y: last.p1.y + Math.sin(angL) * last.initialLen };
        }
    }
}

// --- [Shape 01] 1조각 직선 철근 (New) ---
class Shape01 extends RebarBase {
    generate() {
        let A = this.dims.A || 1000; // Default Length
        return this.buildSequential(
            [A],                // 세그먼트 길이 배열: 단 하나 [A]
            0,                  // 초기 각도: 0도 (수평)
            [],                 // 상대 각도(ang): 관절이 없으므로 빈 배열
            [-1],               // 디폴트 법선: -1 (아래/바깥쪽 탐색)
            (pts) => {          // 앵커: 철근의 정중앙(Midpoint)을 기준점으로 설정
                return { 
                    x: (pts[0].x + pts[1].x) / 2, 
                    y: (pts[0].y + pts[1].y) / 2 
                };
            }
        );
    }
}

// --- [Shape 11] 2조각 기본형 ---
class Shape11 extends RebarBase {
    generate() {
        let A = this.dims.A || 400; let B = this.dims.B || 400;
        return this.buildSequential([A, B], -90, [90], [-1, -1], (pts) => pts[1]);
    }
}

// --- [Shape 21] 3조각 기본형 ---
class Shape21 extends RebarBase {
    generate() {
        let A = this.dims.A || 400; let B = this.dims.B || 400; let C = this.dims.C || 400;
        return this.buildSequential([A, B, C], -90, [90, 90], [-1, -1, -1], (pts) => ({ x: pts[1].x + B/2, y: pts[1].y }));
    }
}

// --- [Shape 41 / 44] 5조각 기본형 ---
class Shape41 extends RebarBase {
    generate() {
        let A = this.dims.A || 300; 
        let B = this.dims.B || 1000; 
        let C = this.dims.C || 300; 
        let D = this.dims.D || 1000; 
        let E = this.dims.E || 300;
        return this.buildSequential(
            [A, B, C, D, E], 0, [-90, 90, 90, -90], [1, -1, -1, -1, 1],
            (pts) => ({ x: pts[2].x + C/2, y: pts[2].y })
        );
    }
}

class RebarFactory { 
    static create(code, center, dims, rotation = 0, ang = null, nor = null) { 
        let r = null;
        if(code === 11) r = new Shape11(center, dims, rotation, ang, nor);
        else if(code === 21) r = new Shape21(center, dims, rotation, ang, nor);
        else if(code === 41 || code === 44) r = new Shape41(center, dims, rotation, ang, nor);
        return r ? r.generate() : null;
    } 
}
