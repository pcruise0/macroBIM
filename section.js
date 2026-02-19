    // =========================================================================
    //  2. DATA CLASSES   v03
    // =========================================================================
// =========================================================================
    //  2. DATA CLASSES (SectionBase 롤백 및 태그 유지)
    // =========================================================================
    class SectionBase {
        constructor(cx, cy, params) { 
            this.cx = cx; this.cy = cy; this.params = params; 
            this.walls = []; this.displayPaths = []; 
            this.covers = { top: 50, outer: 50, inner: 50 }; // 피복 데이터 저장소
        }

        parseCorner(str) { 
            if (!str) return { type: 'N' }; 
            let v = parseFloat(str.substring(1)); 
            return str.startsWith('F') ? { type: 'F', r: v } : { type: 'C', x: v, y: v }; 
        }

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
                        
                        // ⭐ 벽체에 태그 유지
                        let wallTag = specs[i].tag || 'OUTER';
                        this.walls.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, nx: -uy, ny: ux, tag: wallTag });
                        
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
            
            // ⭐ TBeam 상단 슬래브에 TOP 태그 부착 
            specs[0].tag = 'TOP'; // 첫번째 선분(상단)
            this.buildFromPaths([{ nodes: raw, specs: specs }]);
        }
    }

    class BoxGirder extends SectionBase {
        constructor(cx, cy, params) {
            super(cx, cy, params);
            this.parsedData = null; 
        }

        parsePscBox(inputString) {
            try {
                let jsonStr = inputString.replace(/\{/g, '[').replace(/\}/g, ']');
                jsonStr = jsonStr.replace(/([a-zA-Z]+)/g, '"$1"');
                const rawArray = JSON.parse(jsonStr);
                
                if (rawArray[0] !== "PSCBOX") throw new Error("PSCBOX 형식이 아닙니다.");
                
                const sectionId = rawArray[1];
                const data = { id: sectionId };
                
                for (let i = 2; i < rawArray.length; i++) {
                    const item = rawArray[i];
                    const key = item[0]; 
                    
                    // ⭐ [추가] COVER 파싱 추가
                    if (key === "COVER") {
                        data[key] = {
                            top: parseFloat(item[1]),
                            outer: parseFloat(item[2]),
                            inner: parseFloat(item[3])
                        };
                    } else if (key === "BOX") {
                        data[key] = { HT: item[1], WTL: item[2], WTR: item[3], WBL: item[4], SBR: item[5], SLL: item[6], SLR: item[7] };
                    } else if (key === "WP" || key === "WB") {
                        data[key] = item.slice(1);
                    } else if (key === "CS") {
                        if (!data[key]) data[key] = {};
                        data[key][item[1]] = item.slice(2);
                    } else if (key === "TS" || key === "BS") {
                        if (!data[key]) data[key] = {};
                        for (let j = 1; j < item.length; j++) {
                            data[key][item[j][0]] = item[j].slice(1);
                        }
                    }
                }
                this.parsedData = data;
                return this.parsedData;
            } catch (error) {
                console.error("[BoxGirder] 파싱 오류:", error);
                return null;
            }
        }

        // 2. 단면을 생성하는 메인 로직
        generate(inputString) {
            if (inputString) {
                this.parsePscBox(inputString);
            }

            let outerNodes = [];
            let innerNodes = []; 

            if (this.parsedData) {
                const data = this.parsedData;
                
                // ⭐ [추가] 파싱된 피복 데이터가 있다면 BoxGirder 객체에 저장
                if (data.COVER) {
                    this.covers = data.COVER;
                    console.log("✅ 피복 데이터 로드 완료:", this.covers);
                }
                
                const { HT, WTL, WTR, WBL, SBR, SLL, SLR } = data.BOX;
                const WBR = SBR; 

                const csLeft = data.CS ? data.CS.L : [];   
                const csRight = data.CS ? data.CS.R : [];  
                const webThick = data.WB || [];
                const webPos = data.WP || [];   
                
                // =========================================================
                // 1. 외부 노드 (outerNodes) 계산
                // =========================================================
                let ptc = {x: 0, y: 0};
                let plc = {x: -WTL, y: -WTL * (SLL / 100)};
                let plcb = {x: plc.x, y: plc.y - csLeft[csLeft.length - 1]};
                let plwt = {x: webPos[0], y: webPos[0] * (SLL / 100) - csLeft[1]};
                
                let leftHaunches = [];
                let accLeftDist = 0; 
                for (let i = 1; i < csLeft.length / 2; i++) {
                    accLeftDist += csLeft[i * 2]; 
                    let hx = webPos[0] - accLeftDist; 
                    let hy = hx * (SLL / 100) - csLeft[i * 2 + 1]; 
                    leftHaunches.push({x: hx, y: hy});
                }
                
                let pcb = {x: 0, y: -HT};
                let plb = {x: -WBL, y: pcb.y};
                let prb = {x: WBR, y: pcb.y};
                
                let prwt = {x: webPos[webPos.length - 1], y: webPos[webPos.length - 1] * (SLR / 100) - csRight[1]};
                
                let rightHaunches = [];
                let accRightDist = 0; 
                for (let i = 1; i < csRight.length / 2; i++) {
                    accRightDist += csRight[i * 2]; 
                    let hx = webPos[webPos.length - 1] + accRightDist; 
                    let hy = hx * (SLR / 100) - csRight[i * 2 + 1];
                    rightHaunches.push({x: hx, y: hy});
                }
                
                let prc = {x: WTR, y: WTR * (SLR / 100)};
                let prcb = {x: prc.x, y: prc.y - csRight[csRight.length - 1]};                
                
                outerNodes = [
                    ptc, plc, plcb,
                    ...leftHaunches.reverse(),
                    plwt, plb, pcb, prb, prwt,
                    ...rightHaunches,
                    prcb, prc
                ];

                // =========================================================
                // 2. 내부 셀 (innerNodes) 계산
                // =========================================================
                const tsCells = data.TS || {}; 
                const bsCells = data.BS || {}; 
                
                for (let cellId in tsCells) {
                    let cellIndex = parseInt(cellId) - 1; 

                    let tsL = tsCells[cellId][0]; 
                    let tsR = tsCells[cellId][1]; 
                    let bsL = bsCells[cellId] ? bsCells[cellId][0] : [0, 0, 0, 0];
                    let bsR = bsCells[cellId] ? bsCells[cellId][1] : [0, 0, 0, 0];

                    let in_L_web = geo_offset(plwt, plb, webThick[0]);
                    let inL_p1 = {x: in_L_web.x1, y: in_L_web.y1};
                    let inL_p2 = {x: in_L_web.x2, y: in_L_web.y2};

                    let in_R_web = geo_offset(prwt, prb, webThick[1]);
                    let inR_p1 = {x: in_R_web.x1, y: in_R_web.y1};
                    let inR_p2 = {x: in_R_web.x2, y: in_R_web.y2};

                    let tsL_line_p1 = { x: 0, y: -tsL[1] };
                    let tsL_line_p2 = { x: -10000, y: -10000 * (SLL / 100) - tsL[1] };
                    let p_tsL_root = geo_intersect(inL_p1, inL_p2, tsL_line_p1, tsL_line_p2);
                    let tipL_x = p_tsL_root.x + tsL[2]; 
                    let p_tsL_tip = { x: tipL_x, y: tipL_x * (SLL / 100) - tsL[3] };

                    let tsR_line_p1 = { x: 0, y: -tsR[1] };
                    let tsR_line_p2 = { x: 10000, y: 10000 * (SLR / 100) - tsR[1] };
                    let p_tsR_root = geo_intersect(inR_p1, inR_p2, tsR_line_p1, tsR_line_p2);
                    let tipR_x = p_tsR_root.x - tsR[2];
                    let p_tsR_tip = { x: tipR_x, y: tipR_x * (SLR / 100) - tsR[3] };

                    let bsL_line_p1 = { x: 0, y: -HT + bsL[1] };
                    let bsL_line_p2 = { x: -10000, y: -HT + bsL[1] };
                    let p_bsL_root = geo_intersect(inL_p1, inL_p2, bsL_line_p1, bsL_line_p2);
                    let p_bsL_tip = { x: p_bsL_root.x + bsL[2], y: -HT + bsL[3] };

                    let bsR_line_p1 = { x: 0, y: -HT + bsR[1] };
                    let bsR_line_p2 = { x: 10000, y: -HT + bsR[1] };
                    let p_bsR_root = geo_intersect(inR_p1, inR_p2, bsR_line_p1, bsR_line_p2);
                    let p_bsR_tip = { x: p_bsR_root.x - bsR[2], y: -HT + bsR[3] };

                    innerNodes[cellIndex] = [
                        p_tsL_root, p_tsL_tip, p_tsR_tip, p_tsR_root,
                        p_bsR_root, p_bsR_tip, p_bsL_tip, p_bsL_root
                    ];
                }
            }

            // =========================================================
            // 3. 렌더링을 위한 좌표 변환 및 Path 조립
            // =========================================================
            outerNodes.forEach(p => { p.x += this.cx; p.y += this.cy; });
            innerNodes.forEach(cell => { cell.forEach(p => { p.x += this.cx; p.y += this.cy; }); });

            let pathsToBuild = [];
            
            // ⭐ [추가] 외부 노드에 TAG (TOP vs OUTER) 부착
            // 0번째 구간(중앙~좌상단), 마지막 구간(우상단~중앙)은 TOP. 나머지는 OUTER
            let outerSpecs = outerNodes.map((_, i) => {
                if (i === 0 || i === outerNodes.length - 1) return { type: 'N', tag: 'TOP' };
                return { type: 'N', tag: 'OUTER' };
            });
            pathsToBuild.push({ nodes: outerNodes, specs: outerSpecs });

            // ⭐ [추가] 내부 셀 노드에 TAG (INNER) 부착
            innerNodes.forEach(cell => { 
                let innerSpecs = cell.map(() => ({ type: 'N', tag: 'INNER' }));
                pathsToBuild.push({ nodes: cell, specs: innerSpecs }); 
            });

            this.buildFromPaths(pathsToBuild);
        }
    }
