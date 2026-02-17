
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
        constructor(cx, cy, params) {
            super(cx, cy, params);
            // 파싱된 데이터를 저장할 내부 변수
            this.parsedData = null; 
        }
    
        // 1. 박사님의 {} 포맷을 JSON 객체로 파싱하는 로직
        parsePscBox(inputString) {
            try {
                // 중괄호를 대괄호로, 영문 키워드를 큰따옴표로 감싸기
                let jsonStr = inputString.replace(/\{/g, '[').replace(/\}/g, ']');
                jsonStr = jsonStr.replace(/([a-zA-Z]+)/g, '"$1"');
                
                const rawArray = JSON.parse(jsonStr);
                
                if (rawArray[0] !== "PSCBOX") {
                    throw new Error("PSCBOX 형식이 아닙니다.");
                }
                
                const sectionId = rawArray[1];
                const data = { id: sectionId };
                
                for (let i = 2; i < rawArray.length; i++) {
                    const item = rawArray[i];
                    const key = item[0]; 
                    
                    if (key === "BOX") {
                        data[key] = {
                            HT: item[1], WTL: item[2], WTR: item[3],
                            WBL: item[4], SBR: item[5], SLL: item[6], SLR: item[7]
                        };
                    } else if (key === "WP" || key === "WB") {
                        data[key] = item.slice(1);
                    } else if (key === "CS") {
                        if (!data[key]) data[key] = {};
                        const side = item[1]; // "L" 또는 "R"
                        data[key][side] = item.slice(2);
                    } else if (key === "TS" || key === "BS") {
                        if (!data[key]) data[key] = {};
                        for (let j = 1; j < item.length; j++) {
                            const cellData = item[j];
                            const cellId = cellData[0];
                            data[key][cellId] = cellData.slice(1);
                        }
                    }
                }
                
                this.parsedData = data;
                console.log(`✅ [BoxGirder] ID: ${sectionId} 데이터 파싱 완료!`, this.parsedData);
                return this.parsedData;
                
            } catch (error) {
                console.error("[BoxGirder] 데이터 파싱 중 오류 발생:", error);
                return null;
            }
        }
    
        // 2. 단면을 생성하는 메인 로직
        generate(inputString) {
            if (inputString) {
                this.parsePscBox(inputString);
            }

            // ⭐ 함정 1 해결: outerNodes를 if문 바깥(전역)에 미리 선언합니다!
            let outerNodes = [];

            if (this.parsedData) {
                const data = this.parsedData;
                
                // ⭐ 함정 2 해결: SBR로 꺼내서 WBR에 담아줍니다!
                const { HT, WTL, WTR, WBL, SBR, SLL, SLR } = data.BOX;
                const WBR = SBR; 

                const csLeft = data.CS ? data.CS.L : [];   
                const csRight = data.CS ? data.CS.R : [];  
                const webThick = data.WB || [];
                const webPos = data.WP || [];   
                
                // --- 박사님의 완벽한 수학 로직 ---
                let ptc = {x: 0, y: 0};
                let plc = {x: -WTL, y: -WTL * (SLL / 100)};
                let plcb = {x: plc.x, y: plc.y - csLeft[csLeft.length - 1]};
                let plwt = {x: webPos[0], y: -Math.abs(webPos[0]) * (SLL / 100) - csLeft[1]};
                
                let leftHaunches = [];
                let accLeftDist = 0; 
                // [수정됨] 루프 범위 오류 수정: i < 쌍의 갯수
                for (let i = 1; i < csLeft.length / 2; i++) {
                    accLeftDist += csLeft[i * 2]; // 1250 누적
                    let hx = webPos[0] - accLeftDist; // 웹 기준에서 왼쪽(-)으로 이동
                    let hy = -Math.abs(hx) * (SLL / 100) - csLeft[i * 2 + 1]; // 경사 반영 후 두께(225) 빼기
                    leftHaunches.push({x: hx, y: hy});
                }
                
                let pcb = {x: 0, y: -HT};
                let plb = {x: -WBL, y: pcb.y};
                let prb = {x: WBR, y: pcb.y};
                let prwt = {x: webPos[webPos.length - 1], y: -Math.abs(webPos[webPos.length - 1]) * (SLR / 100) - csRight[1]};
                
                let rightHaunches = [];
                let accRightDist = 0; 
                // [수정됨] 루프 범위 오류 수정
                for (let i = 1; i < csRight.length / 2; i++) {
                    accRightDist += csRight[i * 2]; 
                    let hx = webPos[webPos.length - 1] + accRightDist; 
                    let hy = -Math.abs(hx) * (SLR / 100) - csRight[i * 2 + 1];
                    rightHaunches.push({x: hx, y: hy});
                }
                
                let prc = {x: WTR, y: -WTR * (SLR / 100)};
                let prcb = {x: prc.x, y: prc.y - csRight[csRight.length - 1]};                
                
                // ⭐ if문 밖에서 선언해둔 배열에 값을 채워 넣습니다!
                outerNodes = [
                    ptc, plc, plcb,
                    ...leftHaunches.reverse(),
                    plwt, plb, pcb, prb, prwt,
                    ...rightHaunches,
                    prcb, prc
                ];                
            }

            // 렌더링용 기준점 이동
            outerNodes.forEach(p => { p.x += this.cx; p.y += this.cy; });
    
            // 임시로 innerNodes는 빈 배열(통뼈 단면)로 그립니다.
            let innerNodes = []; 
            let pathsToBuild = [];
            pathsToBuild.push({ nodes: outerNodes, specs: outerNodes.map(()=>({type:'N'})) });
            this.buildFromPaths(pathsToBuild);
        }
    }
