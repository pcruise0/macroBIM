
    // =========================================================================
    //  2. DATA CLASSES 
    // =========================================================================
    class SectionBase {
        constructor(cx, cy, params) { this.cx = cx; this.cy = cy; this.params = params; this.walls = []; this.displayPaths = []; }
        parseCorner(str) { if (!str) return { type: 'N' }; let v = parseFloat(str.substring(1)); return str.startsWith('F') ? { type: 'F', r: v } : { type: 'C', x: v, y: v }; }
        makeCorner(pPrev, pCurr, pNext, spec) {
            if (spec.type === 'N') return { points: [] };
            let v1 = {x: pCurr.x-pPrev.x, y: pCurr.y-pPrev.y}, v2 = {x: pNext.x-pCurr.x, y: pNext.y-pCurr.y};
            let len1 = MathUtils.hypot(v1.x, v1.y); let u1 = {x:v1.x/len1, y:v1.y/len1};
            if (spec.type === 'C') return { tS: spec.x, tE: spec.x, points: [] }; 
            else if (spec.type === 'F') {
                let cross = u1.x*v2.y - u1.y*v2.x; let ang = Math.atan2(cross, u1.x*v2.x + u1.y*v2.y);
                let dist = spec.r * Math.tan(Math.abs(ang)/2);
                let pS = {x: pCurr.x - u1.x*dist, y: pCurr.y - u1.y*dist};
                let nx = (ang > 0) ? -u1.y : u1.y, ny = (ang > 0) ? u1.x : -u1.x;
                let cx = pS.x + nx * spec.r, cy = pS.y + ny * spec.r;
                let points = []; let aS = Math.atan2(pS.y - cy, pS.x - cx);
                let len2 = MathUtils.hypot(v2.x, v2.y); let u2 = {x:v2.x/len2, y:v2.y/len2};
                let pE = {x: pCurr.x + u2.x*dist, y: pCurr.y + u2.y*dist};
                let aE = Math.atan2(pE.y - cy, pE.x - cx); let diff = aE - aS;
                while (diff <= -Math.PI) diff += 2*Math.PI; while (diff > Math.PI) diff -= 2*Math.PI;
                for(let i=0; i<=6; i++) { let t = aS + diff * (i/6); points.push({x: cx + Math.cos(t)*spec.r, y: cy + Math.sin(t)*spec.r}); }
                return { tS: dist, tE: dist, points: points };
            }
            return { tS: 0, tE: 0, points: [] };
        }
        
        buildFromPaths(pathArray) {
            this.displayPaths = []; this.walls = [];
            pathArray.forEach(pathData => {
                let nodes = pathData.nodes; let specs = pathData.specs;
                let trims = nodes.map((_, i) => {
                    let prev = nodes[(i - 1 + nodes.length) % nodes.length]; let next = nodes[(i + 1) % nodes.length];
                    return this.makeCorner(prev, nodes[i], next, specs[i]);
                });
                let currentDisplayPath = [];
                for (let i = 0; i < nodes.length; i++) {
                    let next = (i + 1) % nodes.length;
                    let p1 = nodes[i], p2 = nodes[next];
                    let tS = trims[i].tE || 0, tE = trims[next].tS || 0;
                    let dx = p2.x - p1.x, dy = p2.y - p1.y, len = MathUtils.hypot(dx, dy);
                    if (len > tS + tE + 0.1) {
                        let ux = dx / len, uy = dy / len;
                        let start = { x: p1.x + ux * tS, y: p1.y + uy * tS }; let end = { x: p2.x - ux * tE, y: p2.y - uy * tE };
                        this.walls.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, nx: -uy, ny: ux });
                        if (currentDisplayPath.length === 0) currentDisplayPath.push(start); else currentDisplayPath.push(start);
                        currentDisplayPath.push(end);
                    }
                    if (trims[next].points && trims[next].points.length > 0) { trims[next].points.forEach(p => currentDisplayPath.push(p)); }
                }
                if(currentDisplayPath.length > 0) currentDisplayPath.push(currentDisplayPath[0]);
                this.displayPaths.push(currentDisplayPath);
            });
        }
    }

    class TBeam extends SectionBase {
        generate() {
            const { H, W, tf, tc, twt, twb, corners } = CONFIG.TBEAM;
            const topY = H / 2, botY = -H / 2;
            const halfW = W / 2, halfTwt = twt / 2, halfTwb = twb / 2;
            let raw = [ { x: halfW, y: topY }, { x: -halfW, y: topY }, { x: -halfW, y: topY - tc }, { x: -halfTwt, y: topY - tf }, { x: -halfTwb, y: botY }, { x: halfTwb, y: botY }, { x: halfTwt, y: topY - tf }, { x: halfW, y: topY - tc } ];
            raw.forEach(p => { p.x += this.cx; p.y += this.cy; });
            const parse = (s) => this.parseCorner(s);
            let specs = [ parse(corners.TT), parse(corners.TT), {type:'N'}, parse(corners.TH), parse(corners.BT), parse(corners.BT), parse(corners.TH), {type:'N'} ];
            this.buildFromPaths([{ nodes: raw, specs: specs }]);
        }
    }

    class BoxGirder extends SectionBase {
        generate() {
            const { H, W_top, W_bot, w_cant, t_top_tip, t_top_root, h_drop, t_top_center, t_bot, t_web, th_x, th_y, bh_x, bh_y } = CONFIG.BOXGIRDER;
            const half_Wt = W_top / 2; const half_Wb = W_bot / 2; const w_in_half = half_Wt - w_cant - t_web;
            
            let outerNodes = [ { x: half_Wt, y: 0 }, { x: -half_Wt, y: 0 }, { x: -half_Wt, y: -t_top_tip }, { x: -half_Wt + w_cant, y: -t_top_root }, { x: -half_Wt + w_cant, y: -t_top_root - h_drop }, { x: -half_Wb, y: -H }, { x: half_Wb, y: -H }, { x: half_Wt - w_cant, y: -t_top_root - h_drop }, { x: half_Wt - w_cant, y: -t_top_root }, { x: half_Wt, y: -t_top_tip } ];
            outerNodes.forEach(p => { p.x += this.cx; p.y += this.cy; });

            let innerNodes = []; 
            innerNodes[0] = [ { x: -w_in_half + th_x, y: -t_top_center }, { x: w_in_half - th_x, y: -t_top_center }, { x: w_in_half, y: -t_top_center - th_y }, { x: w_in_half, y: -H + t_bot + bh_y }, { x: w_in_half - bh_x, y: -H + t_bot }, { x: -w_in_half + bh_x, y: -H + t_bot }, { x: -w_in_half, y: -H + t_bot + bh_y }, { x: -w_in_half, y: -t_top_center - th_y } ];
            innerNodes.forEach(cell => { cell.forEach(p => { p.x += this.cx; p.y += this.cy; }); });

            let pathsToBuild = [];
            pathsToBuild.push({ nodes: outerNodes, specs: outerNodes.map(()=>({type:'N'})) });
            innerNodes.forEach(cell => { pathsToBuild.push({ nodes: cell, specs: cell.map(()=>({type:'N'})) }); });

            this.buildFromPaths(pathsToBuild);
        }
    }
