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
                    
                    if (key === "BOX") {
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

        generate(inputString) {
            if (inputString) {
                this.parsePscBox(inputString);
            }

            let outerNodes = [];
            let innerNodes = []; 

            if (this.parsedData) {
                const data = this.parsedData;
                
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
                let plwt = {x: webPos[0], y: -Math.abs(webPos[0]) * (SLL / 100) - csLeft[1]};
                
                let leftHaunches = [];
                let accLeftDist = 0; 
                for (let i = 1; i < csLeft.length / 2; i++) {
                    accLeftDist += csLeft[i * 2]; 
                    let hx = webPos[0] - accLeftDist; 
                    let hy = -Math.abs(hx) * (SLL / 100) - csLeft[i * 2 + 1]; 
                    leftHaunches.push({x: hx, y: hy});
                }
                
                let pcb = {x: 0, y: -HT};
                let plb = {x: -WBL, y: pcb.y};
                let prb = {x: WBR, y: pcb.y};
                let prwt = {x: webPos[webPos.length - 1], y: -Math.abs(webPos[webPos.length - 1]) * (SLR / 100) - csRight[1]};
                
                let rightHaunches = [];
                let accRightDist = 0; 
                for (let i = 1; i < csRight.length / 2; i++) {
                    accRightDist += csRight[i * 2]; 
                    let hx = webPos[webPos.length - 1] + accRightDist; 
                    let hy = -Math.abs(hx) * (SLR / 100) - csRight[i * 2 + 1];
                    rightHaunches.push({x: hx, y: hy});
                }
                
                let prc = {x: WTR, y: -WTR * (SLR / 100)};
                let prcb = {x: prc.x, y: prc.y - csRight[csRight.length - 1]};                
                
                outerNodes = [
                    ptc, plc, plcb,
                    ...leftHaunches.reverse(),
                    plwt, plb, pcb, prb, prwt,
                    ...rightHaunches,
                    prcb, prc
                ];

                // =========================================================
                // 2. 내부 셀 (innerNodes) 계산 (다중 셀 지원)
                // =========================================================
                const tsCells = data.TS || {}; 
                const bsCells = data.BS || {}; 
                
                for (let cellId in tsCells) {
                    let cellIndex = parseInt(cellId) - 1; 

                    let tsL = tsCells[cellId][0]; 
                    let tsR = tsCells[cellId][1]; 
                    let bsL = bsCells[cellId] ? bsCells[cellId][0] : [0, 0, 0, 0];
                    let bsR = bsCells[cellId] ? bsCells[cellId][1] : [0, 0, 0, 0];

                    // ① 좌/우 복부 내측 선 생성 
                    let in_L_web = geo_offset(plwt, plb, webThick[0]);
                    let inL_p1 = {x: in_L_web.x1, y: in_L_web.y1};
                    let inL_p2 = {x: in_L_web.x2, y: in_L_web.y2};

                    let in_R_web = geo_offset(prwt, prb, webThick[1]);
                    let inR_p1 = {x: in_R_web.x1, y: in_R_web.y1};
                    let inR_p2 = {x: in_R_web.x2, y: in_R_web.y2};

                    // ② 상부 슬래브 (TS) 교점 및 헌치 계산
                    let tsL_line_p1 = { x: 0, y: -tsL[1] };
                    let tsL_line_p2 = { x: -10000, y: -10000 * (SLL / 100) - tsL[1] };
                    let p_tsL_root = geo_intersect(inL_p1, inL_p2, tsL_line_p1, tsL_line_p2);
                    let tipL_x = p_tsL_root.x + tsL[2]; 
                    let p_tsL_tip = { x: tipL_x, y: -Math.abs(tipL_x) * (SLL / 100) - tsL[3] };

                    let tsR_line_p1 = { x: 0, y: -tsR[1] };
                    let tsR_line_p2 = { x: 10000, y: -10000 * (SLR / 100) - tsR[1] };
                    let p_tsR_root = geo_intersect(inR_p1, inR_p2, tsR_line_p1, tsR_line_p2);
                    let tipR_x = p_tsR_root.x - tsR[2];
                    let p_tsR_tip = { x: tipR_x, y: -Math.abs(tipR_x) * (SLR / 100) - tsR[3] };

                    // ③ 하부 슬래브 (BS) 교점 및 헌치 계산
                    let bsL_line_p1 = { x: 0, y: -HT + bsL[1] };
                    let bsL_line_p2 = { x: -10000, y: -HT + bsL[1] };
                    let p_bsL_root = geo_intersect(inL_p1, inL_p2, bsL_line_p1, bsL_line_p2);
                    let p_bsL_tip = { x: p_bsL_root.x + bsL[2], y: -HT + bsL[3] };

                    let bsR_line_p1 = { x: 0, y: -HT + bsR[1] };
                    let bsR_line_p2 = { x: 10000, y: -HT + bsR[1] };
                    let p_bsR_root = geo_intersect(inR_p1, inR_p2, bsR_line_p1, bsR_line_p2);
                    let p_bsR_tip = { x: p_bsR_root.x - bsR[2], y: -HT + bsR[3] };

                    // ④ 시계방향으로 1개 방(Cell)을 폐합하여 배열에 꽂아 넣기
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
            pathsToBuild.push({ nodes: outerNodes, specs: outerNodes.map(()=>({type:'N'})) });
            innerNodes.forEach(cell => { pathsToBuild.push({ nodes: cell, specs: cell.map(()=>({type:'N'})) }); });

            this.buildFromPaths(pathsToBuild);
        }
    }
