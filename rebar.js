// v029
class RebarBase {
    // ⭐ [수정 1] 생성자 파라미터: ang->angs, nor->nors, ends 추가
    constructor(center, dims, rotation = 0, angs = null, nors = null, ends = null) { 
        this.center = center; 
        this.dims = dims; 
        this.rotation = rotation;
        this.angs = angs; // 복수형 s 적용
        this.nors = nors; // 복수형 s 적용
        this.ends = ends; // 단부 처리 규칙 (B/E) 추가
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

    // ⭐ [수정 2] ang->angs, nor->nors 로직 변경
    buildSequential(lengths, initAngle, defaultAng, defaultNor, getAnchorPos) {
        const segKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const angKeys = ['RA', 'RB', 'RC', 'RD', 'RE', 'RF'];

        // this.angs, this.nors를 우선적으로 사용하도록 변경
        let angArray = defaultAng.map((def, i) => (this.angs && this.angs[angKeys[i]] !== undefined) ? this.angs[angKeys[i]] : def);
        let norArray = defaultNor.map((def, i) => (this.nors && this.nors[segKeys[i]] !== undefined) ? this.nors[segKeys[i]] : def);

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

// --- Shape 클래스들은 변경 없음 (RebarBase 상속) ---
class Shape01 extends RebarBase {
    generate() {
        let A = this.dims.A || 1000; 
        return this.buildSequential([A], 0, [], [-1], (pts) => ({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }));
    }
}

class Shape11 extends RebarBase {
    generate() {
        let A = this.dims.A || 400; let B = this.dims.B || 400;
        return this.buildSequential([A, B], -90, [90], [-1, -1], (pts) => pts[1]);
    }
}

class Shape21 extends RebarBase {
    generate() {
        let A = this.dims.A || 400; let B = this.dims.B || 400; let C = this.dims.C || 400;
        return this.buildSequential([A, B, C], -90, [90, 90], [-1, -1, -1], (pts) => ({ x: pts[1].x + B/2, y: pts[1].y }));
    }
}

class Shape41 extends RebarBase {
    generate() {
        let A = this.dims.A || 300; let B = this.dims.B || 1000; 
        let C = this.dims.C || 300; let D = this.dims.D || 1000; let E = this.dims.E || 300;
        return this.buildSequential(
            [A, B, C, D, E], 0, [-90, 90, 90, -90], [1, -1, -1, -1, 1],
            (pts) => ({ x: pts[2].x + C/2, y: pts[2].y })
        );
    }
}

// ⭐ [수정 3] Factory: angs, nors, ends 파라미터 추가
// --- RebarFactory (Case Insensitive & Simplified) ---
class RebarFactory { 
    // ⭐ 헬퍼: 키를 소문자로 통일하고 값을 매핑하는 함수
    static normalizeParams(data) {
        const normalized = {};
        // 1. 최상위 키 소문자 변환 (Dims -> dims, Angs -> angs...)
        Object.keys(data).forEach(key => {
            normalized[key.toLowerCase()] = data[key];
        });
        return normalized;
    }

    // ⭐ 헬퍼: Ends 내부의 { "FIT": 0 } 형태를 { type: "FIT", val: 0 }으로 표준화
    static parseEnds(endsData) {
        if (!endsData) return null;
        const parsed = {};
        
        // b, B, e, E 모두 허용하기 위해 키 반복 확인
        Object.keys(endsData).forEach(key => {
            const k = key.toLowerCase(); // b 또는 e
            const ruleObj = endsData[key]; // { "fit": 0 } 형태
            
            if (ruleObj) {
                // { "fit": 0 } 에서 키("fit")와 값(0)을 추출
                const command = Object.keys(ruleObj)[0]; // "fit"
                const val = ruleObj[command];            // 0
                
                // 내부적으로는 물리 엔진이 이해하기 쉽게 표준 포맷으로 변환하여 저장
                // B 또는 E 키에 할당
                parsed[k === 'b' ? 'B' : 'E'] = { 
                    type: command.toUpperCase(), // "FIT" (대문자 강제)
                    val: Number(val) 
                };
            }
        });
        return parsed;
    }

    static create(code, center, dims, rotation = 0, angs = null, nors = null, ends = null) { 
        // ⚠️ 주의: 여기서 직접 호출할 땐 이미 index.html에서 정제된 값이 올 수도 있고 아닐 수도 있음.
        // 하지만 안전하게 생성자에게 넘기기 전에는 그대로 둠.
        // 실제로는 index.html에서 normalize해서 넘기는 게 좋지만, 
        // 편의상 Factory.create를 호출하는 index.html 쪽 코드를 수정하는 게 낫습니다.
        
        // (기존 코드 유지)
        let r = null;
        if(code === 1) r = new Shape01(center, dims, rotation, angs, nors, ends);
        else if(code === 11) r = new Shape11(center, dims, rotation, angs, nors, ends);
        else if(code === 21) r = new Shape21(center, dims, rotation, angs, nors, ends);
        else if(code === 41 || code === 44) r = new Shape41(center, dims, rotation, angs, nors, ends);
        return r ? r.generate() : null;
    } 
}
