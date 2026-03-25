// =========================================================================
// 🟦 PART 1: DOMAIN LOGIC (domain.js)  v000
// =========================================================================

const CONFIG = {
    TBEAM: { H: 600, W: 800, tf: 150, tc: 100, twt: 300, twb: 250, corners: { TT: "C20", TH: "F80", BT: "F30" } },
    COVER: 50,
    PHYSICS: { GRAVITY_K: 0.08, DAMPING: 0.80, CONVERGE: 0.2, NODE_POS: [0.4, 0.6] }
};

const PARAMS = {
    WEB_X: 2000,
    BOTTOM_Y: -1800,
    CANT_X: 4800,
    CANT_Y: -100,
    COVER: 50
};

const Domain = {
    // 사용자가 외부에서 주입할 데이터 저장소
    USER_BOX_DATA: null,
    USER_REBAR_DATA: null,

    currentSection: null,
    rebarList: [],
    activeRebarIndex: 0,
    isPaused: false,

    togglePause: () => { 
        Domain.isPaused = !Domain.isPaused; 
        const btn = document.getElementById("btnPause");
        if(btn) btn.innerHTML = Domain.isPaused ? "▶ Start" : "⏸ Pause";
    },

    buildModel: (secType) => {
        Domain.currentSection = null;
        Domain.rebarList = [];
        Domain.activeRebarIndex = 0;
        Domain.isPaused = false;

        if (secType === "TBEAM") {
            Domain.currentSection = new TBeam(0, 0, CONFIG.TBEAM);
            Domain.currentSection.generate();
        } else {
            Domain.currentSection = new BoxGirder(0, 0, null);
            // 주입받은 박스 데이터 사용
            Domain.currentSection.generate(Domain.USER_BOX_DATA);
        }

        if (secType === "BOXGIRDER" && Domain.USER_REBAR_DATA) {
            Domain.USER_REBAR_DATA.forEach(rawData => {
                const data = {};
                // 1. 최상위 키 소문자 변환
                Object.keys(rawData).forEach(k => data[k.toLowerCase()] = rawData[k]);

                // 2. 하위 키(angs, nors 등) 대문자 변환
                ['angs', 'nors'].forEach(prop => {
                    if (data[prop]) {
                        const upperObj = {};
                        Object.keys(data[prop]).forEach(innerKey => upperObj[innerKey.toUpperCase()] = data[prop][innerKey]);
                        data[prop] = upperObj;
                    }
                });

                // 3. segs 파싱 및 dims 자동 추출 로직
                let safeDims = {};
                let anchorSegKey = 'A';    // set이 없을 때 기본값
                let targetSetId = null;
                let ignoredSetKeys = [];

                if (data.segs) {
                    Object.keys(data.segs).forEach(k => {
                        let segKey = k.toUpperCase();
                        let segProps = data.segs[k];

                        if (!segProps || typeof segProps !== 'object') return;

                        if (segProps.len !== undefined) {
                            safeDims[segKey] = segProps.len;
                        }

                        if (segProps.set) {
                            if (!targetSetId) {
                                anchorSegKey = segKey;
                                targetSetId = segProps.set;
                            } else {
                                ignoredSetKeys.push(segKey);
                            }
                        }
                    });

                    if (ignoredSetKeys.length > 0) {
                        console.warn(
                            `[SET IGNORE] ${data.id || 'UNKNOWN'} 에서 set이 여러 개 입력되었습니다. ` +
                            `첫 번째 set('${anchorSegKey}')만 사용하고, 나머지 [${ignoredSetKeys.join(', ')}] 는 무시합니다.`
                        );
                    }
                } else if (data.dims) {
                    safeDims = data.dims;
                }

                // 4. barEnds 파싱
                let finalBarEnds = null;
                let rawBarEnds = data.barends || data.ends; 

                if (rawBarEnds) {
                    finalBarEnds = {};

                    Object.keys(rawBarEnds).forEach(k => {
                        let key = k.toLowerCase();
                        let rule = rawBarEnds[k];
                        if (!rule) return;

                        let mode = Object.keys(rule)[0];
                        if (!mode) return;

                        if (key === 'start' || key === 'b') {
                            finalBarEnds.start = {
                                type: mode.toUpperCase(),
                                val: Number(rule[mode])
                            };
                        } else if (key === 'end' || key === 'e') {
                            finalBarEnds.end = {
                                type: mode.toUpperCase(),
                                val: Number(rule[mode])
                            };
                        }
                    });

                    if (Object.keys(finalBarEnds).length === 0) {
                        finalBarEnds = null;
                    }
                }

                // 5. 초기화 설정 파싱 (init)
                let actualDims = EquationParser.evalDims(safeDims, PARAMS); 
                let initData = data.init || {};
                let rawX = initData.x !== undefined ? initData.x : data.x;
                let rawY = initData.y !== undefined ? initData.y : data.y;
                let rawRot = initData.rot !== undefined ? initData.rot : data.rot;

                let startX = 0, startY = 0, rot = 0;
                let targetWall = null;

                // 6. 시작 좌표 결정
                if (targetSetId) {
                    targetWall = Domain.currentSection.walls.find(w => w.id === targetSetId.toUpperCase());
                    if (targetWall) {
                        startX = 0; startY = 0; rot = 0; 
                    } else {
                        startX = EquationParser.eval(rawX, PARAMS) || 0;
                        startY = EquationParser.eval(rawY, PARAMS) || 0;
                        rot = EquationParser.eval(rawRot, PARAMS) || 0;
                    }
                } else {
                    startX = EquationParser.eval(rawX, PARAMS) || 0;
                    startY = EquationParser.eval(rawY, PARAMS) || 0;
                    rot = EquationParser.eval(rawRot, PARAMS) || 0;
                }

                // 7. 철근 생성
                let rb = RebarFactory.create(
                    data.code,
                    { x: startX, y: startY },
                    actualDims || {},
                    rot,
                    data.angs,
                    data.nors,
                    finalBarEnds  
                );
                
                if (rb) { 
                    rb.id = data.id; 

                    // 8. 공간 이동 마법 & 마스터 닻 잠금
                    if (targetWall) {
                        let segIndex = anchorSegKey.charCodeAt(0) - 65;
                        if (segIndex < 0 || segIndex >= rb.segments.length) segIndex = 0;

                        let tSeg = rb.segments[segIndex];

                        // 각도 맞추기
                        let wx = targetWall.x2 - targetWall.x1;
                        let wy = targetWall.y2 - targetWall.y1;
                        let wallAng = Math.atan2(wy, wx);

                        let sx = tSeg.p2.x - tSeg.p1.x;
                        let sy = tSeg.p2.y - tSeg.p1.y;
                        let segAng = Math.atan2(sy, sx);

                        let extraRot = Number(rawRot) || 0;
                        let deltaAng = wallAng - segAng + (extraRot * Math.PI / 180);

                        let cosA = Math.cos(deltaAng);
                        let sinA = Math.sin(deltaAng);

                        const rotatePt = (p) => {
                            let nx = p.x * cosA - p.y * sinA;
                            let ny = p.x * sinA + p.y * cosA;
                            p.x = nx; p.y = ny;
                        };

                        const rotateVec = (v) => {
                            let nx = v.x * cosA - v.y * sinA;
                            let ny = v.x * sinA + v.y * cosA;
                            v.x = nx; v.y = ny;
                        };

                        rb.segments.forEach(s => {
                            rotatePt(s.p1); rotatePt(s.p2);
                            s.nodes.forEach(n => rotatePt(n));
                            rotateVec(s.normal); rotateVec(s.uDir);
                        });

                        // 위치 맞추기
                        let cx = (tSeg.p1.x + tSeg.p2.x) / 2;
                        let cy = (tSeg.p1.y + tSeg.p2.y) / 2;
                        let cType = targetWall.tag ? targetWall.tag.toLowerCase() : 'outer';
                        let coverVal = Domain.currentSection.covers[cType] || 50;
                        let spawnDist = coverVal;

                        let tcx = ((targetWall.x1 + targetWall.x2) / 2) + (targetWall.nx * spawnDist);
                        let tcy = ((targetWall.y1 + targetWall.y2) / 2) + (targetWall.ny * spawnDist);

                        let tx = tcx - cx;
                        let ty = tcy - cy;

                        rb.segments.forEach(s => {
                            s.p1.x += tx; s.p1.y += ty;
                            s.p2.x += tx; s.p2.y += ty;
                            s.nodes.forEach(n => { n.x += tx; n.y += ty; });
                        });

                        tSeg.anchorWall = targetWall;
                        tSeg.fitWall = targetWall;
                        tSeg.contactWall = targetWall;

                        rb.segments.forEach((s, index) => {
                            if (index === segIndex) {
                                s.state = "SETTLED";
                            } else {
                                s.state = "WAITING";
                            }
                        });

                        console.log(`[🎯 SET] ${rb.id} 철근의 '${anchorSegKey}' 구간이 ${targetWall.id} 벽체에 닻을 내렸습니다.`);
                    }                    

                    Domain.rebarList.push(rb); 
                }
            });
        }
    },

    stepPhysics: () => {
        if (Domain.isPaused) return;
        if (Domain.activeRebarIndex < Domain.rebarList.length) {
            let currentRebar = Domain.rebarList[Domain.activeRebarIndex];
            Physics.updatePhysics(currentRebar, Domain.currentSection.walls);
            if (currentRebar.state === "FORMED") {
                Domain.activeRebarIndex++;
            }
        }
    }
};
