// v035
class RebarBase {
    constructor(center, dims, rotation = 0, angs = null, nors = null, barEnds = null) {
        this.center = center;
        this.dims = dims || {};
        this.rotation = rotation;
        this.angs = angs || null;
        this.nors = nors || null;
        this.barEnds = barEnds || null;

        // 하위 호환: 기존 코드가 rebar.ends 를 참조해도 동작하도록 유지
        this.ends = this.barEnds;

        this.segments = [];
        this.state = "ASSEMBLING";
        this.debugPoints = [];
    }

    makeSeg(p1, p2, normal, initialState, label) {
        let nodes = [];
        CONFIG.PHYSICS.NODE_POS.forEach(ratio => {
            nodes.push({
                x: p1.x + (p2.x - p1.x) * ratio,
                y: p1.y + (p2.y - p1.y) * ratio,
                vx: 0,
                vy: 0
            });
        });

        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let initialLen = MathUtils.hypot(dx, dy);
        let safeLen = initialLen > 1e-9 ? initialLen : 1;

        return {
            label: label,
            p1: { ...p1 },
            p2: { ...p2 },
            nodes: nodes,
            normal: { ...normal },
            initialLen: initialLen,
            uDir: { x: dx / safeLen, y: dy / safeLen },
            state: initialState,
            anchorWall: null,
            fitWall: null,
            contactWall: null
        };
    }

    applyRotation() {
        if (this.rotation === 0) return;

        this.segments.forEach(seg => {
            seg.p1 = geo_rotatePt2D(seg.p1, this.center, this.rotation);
            seg.p2 = geo_rotatePt2D(seg.p2, this.center, this.rotation);

            seg.nodes.forEach(node => {
                let rPos = geo_rotatePt2D(node, this.center, this.rotation);
                node.x = rPos.x;
                node.y = rPos.y;
            });

            let rNorm = geo_rotatePt2D(seg.normal, { x: 0, y: 0 }, this.rotation);
            seg.normal = rNorm;

            let dx = seg.p2.x - seg.p1.x;
            let dy = seg.p2.y - seg.p1.y;
            let len = MathUtils.hypot(dx, dy);
            if (len > 1e-9) {
                seg.uDir = { x: dx / len, y: dy / len };
            }
        });
    }

    buildSequential(lengths, initAngle, defaultAng, defaultNor, getAnchorPos) {
        const segKeys = ["A", "B", "C", "D", "E", "F", "G"];
        const angKeys = ["RA", "RB", "RC", "RD", "RE", "RF"];

        let angArray = defaultAng.map((def, i) => {
            return (this.angs && this.angs[angKeys[i]] !== undefined) ? this.angs[angKeys[i]] : def;
        });

        let norArray = defaultNor.map((def, i) => {
            return (this.nors && this.nors[segKeys[i]] !== undefined) ? this.nors[segKeys[i]] : def;
        });

        let pts = [{ x: 0, y: 0 }];
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
        pts.forEach(p => {
            p.x += dx;
            p.y += dy;
        });

        this.segments = [];

        for (let i = 0; i < lengths.length; i++) {
            let p1 = pts[i];
            let p2 = pts[i + 1];
            let vx = p2.x - p1.x;
            let vy = p2.y - p1.y;
            let len = MathUtils.hypot(vx, vy);
            let safeLen = len > 1e-9 ? len : 1;
            let ux = vx / safeLen;
            let uy = vy / safeLen;

            let nSign = norArray[i];
            let nx = nSign === 1 ? -uy : uy;
            let ny = nSign === 1 ? ux : -ux;

            let state = (i === 0) ? "FITTING" : "WAITING";
            let segmentLabel = segKeys[i].toLowerCase();

            this.segments.push(this.makeSeg(p1, p2, { x: nx, y: ny }, state, segmentLabel));
        }

        this.applyRotation();
        return this;
    }

    finalize() {
        for (let i = 0; i < this.segments.length - 1; i++) {
            let seg1 = this.segments[i];
            let seg2 = this.segments[i + 1];
            let corner = MathUtils.getLineIntersection(seg1.p1, seg1.p2, seg2.p1, seg2.p2);

            if (corner) {
                seg1.p2 = corner;
                seg2.p1 = corner;
            }
        }

        if (this.segments.length > 0) {
            let first = this.segments[0];
            let angF = Math.atan2(first.uDir.y, first.uDir.x);

            first.p1 = {
                x: first.p2.x - Math.cos(angF) * first.initialLen,
                y: first.p2.y - Math.sin(angF) * first.initialLen
            };
        }

        if (this.segments.length > 1) {
            let last = this.segments[this.segments.length - 1];
            let angL = Math.atan2(last.uDir.y, last.uDir.x);

            last.p2 = {
                x: last.p1.x + Math.cos(angL) * last.initialLen,
                y: last.p1.y + Math.sin(angL) * last.initialLen
            };
        }
    }
}

// --- Shape 클래스들 ---
class Shape01 extends RebarBase {
    generate() {
        let A = this.dims.A || 1000;
        return this.buildSequential(
            [A],
            0,
            [],
            [-1],
            (pts) => ({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 })
        );
    }
}

class Shape11 extends RebarBase {
    generate() {
        let A = this.dims.A || 400;
        let B = this.dims.B || 400;
        return this.buildSequential([A, B], -90, [90], [-1, -1], (pts) => pts[1]);
    }
}

class Shape21 extends RebarBase {
    generate() {
        let A = this.dims.A || 400;
        let B = this.dims.B || 400;
        let C = this.dims.C || 400;

        return this.buildSequential(
            [A, B, C],
            -90,
            [90, 90],
            [-1, -1, -1],
            (pts) => ({ x: pts[1].x + B / 2, y: pts[1].y })
        );
    }
}

class Shape41 extends RebarBase {
    generate() {
        let A = this.dims.A || 300;
        let B = this.dims.B || 1000;
        let C = this.dims.C || 300;
        let D = this.dims.D || 1000;
        let E = this.dims.E || 300;

        return this.buildSequential(
            [A, B, C, D, E],
            0,
            [-90, 90, 90, -90],
            [1, -1, -1, -1, 1],
            (pts) => ({ x: pts[2].x + C / 2, y: pts[2].y })
        );
    }
}

// --- RebarFactory ---
class RebarFactory {
    static normalizeParams(data) {
        const normalized = {};
        Object.keys(data || {}).forEach(key => {
            normalized[key.toLowerCase()] = data[key];
        });
        return normalized;
    }

    static parseBarEnds(barEndsData) {
        if (!barEndsData) return null;

        const parsed = {};

        Object.keys(barEndsData).forEach(key => {
            const k = String(key).toLowerCase();
            const ruleObj = barEndsData[key];
            if (!ruleObj || typeof ruleObj !== "object") return;

            const commands = Object.keys(ruleObj);
            if (commands.length === 0) return;

            const command = commands[0];
            const val = Number(ruleObj[command]);

            const payload = {
                type: String(command).toUpperCase(),
                val: Number.isFinite(val) ? val : 0
            };

            if (k === "start" || k === "b") {
                parsed.start = payload;
            } else if (k === "end" || k === "e") {
                parsed.end = payload;
            }
        });

        return Object.keys(parsed).length > 0 ? parsed : null;
    }

    static create(code, center, dims, rotation = 0, angs = null, nors = null, barEnds = null) {
        let r = null;

        if (code === 1) r = new Shape01(center, dims, rotation, angs, nors, barEnds);
        else if (code === 11) r = new Shape11(center, dims, rotation, angs, nors, barEnds);
        else if (code === 21) r = new Shape21(center, dims, rotation, angs, nors, barEnds);
        else if (code === 41 || code === 44) r = new Shape41(center, dims, rotation, angs, nors, barEnds);

        return r ? r.generate() : null;
    }
}
