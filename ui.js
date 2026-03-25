// =========================================================================
// ⬛ PART 2: UI & RENDERING (ui.js)  v000
// =========================================================================

const UI = {
    showNormals: false,
    showNodes: false, 
    
    stage: null, mainLayer: null,
    gridGroup: null, sectionGroup: null, normalGroup: null, rebarGroup: null, debugGroup: null,
    anim: null,

    init: () => {
        UI.stage = new Konva.Stage({ container: 'renderContainer', width: window.innerWidth, height: window.innerHeight, draggable: true });
        UI.mainLayer = new Konva.Layer({ x: window.innerWidth / 2, y: window.innerHeight / 2, scaleY: -1 });
        UI.stage.add(UI.mainLayer);

        UI.gridGroup = new Konva.Group(); 
        UI.sectionGroup = new Konva.Group();
        UI.normalGroup = new Konva.Group(); 
        UI.rebarGroup = new Konva.Group();
        UI.debugGroup = new Konva.Group(); 
        
        UI.mainLayer.add(UI.gridGroup, UI.sectionGroup, UI.normalGroup, UI.rebarGroup, UI.debugGroup);

        UI.stage.on('dragmove', UI.drawGrid);
        UI.stage.on('wheel', (e) => {
            e.evt.preventDefault();
            const oldScale = UI.stage.scaleX();
            const pointer = UI.stage.getPointerPosition();
            const mousePointTo = { x: (pointer.x - UI.stage.x()) / oldScale, y: (pointer.y - UI.stage.y()) / oldScale };
            const newScale = e.evt.deltaY > 0 ? oldScale * 0.9 : oldScale * 1.1;
            UI.stage.scale({ x: newScale, y: newScale });
            const newPos = { x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale };
            UI.stage.position(newPos); UI.drawGrid(); 
        });

        window.addEventListener("resize", () => {
            UI.stage.width(window.innerWidth); UI.stage.height(window.innerHeight);
            UI.mainLayer.position({x: window.innerWidth / 2, y: window.innerHeight / 2});
            UI.drawGrid();
        });

        UI.anim = new Konva.Animation((frame) => {
            Domain.stepPhysics();
            UI.updateVisuals();
        }, UI.mainLayer);

        UI.reset();
        UI.anim.start();
    },

    reset: () => {
        UI.sectionGroup.destroyChildren(); 
        UI.normalGroup.destroyChildren(); 
        UI.rebarGroup.destroyChildren();
        UI.debugGroup.destroyChildren(); 

        let secType = document.getElementById("sectionSelect").value;
        
        // Domain 내부 데이터로 빌드
        Domain.buildModel(secType);

        if (secType === "TBEAM") { 
            UI.stage.scale({x: 0.8, y: 0.8}); UI.stage.position({x: window.innerWidth / 2, y: window.innerHeight / 2});
        } else { 
            UI.stage.scale({x: 0.12, y: 0.12}); UI.stage.position({x: window.innerWidth / 2, y: window.innerHeight / 2}); 
        }

        Domain.currentSection.displayPaths.forEach(path => {
            let flatPoints = []; path.forEach(p => flatPoints.push(p.x, p.y));
            UI.sectionGroup.add(new Konva.Line({ points: flatPoints, stroke: '#ffffff', strokeWidth: 2, closed: true, lineJoin: 'round', strokeScaleEnabled: false }));
        });

        UI.drawGrid(); 
        UI.drawNormals(); 
        UI.drawDebugNodes(); 
        UI.mainLayer.draw();
    },

    updateVisuals: () => {
        UI.rebarGroup.destroyChildren();
        let secType = document.getElementById("sectionSelect").value;
        let nodeR = secType === "TBEAM" ? 6 : 50;

        Domain.rebarList.forEach((rebar, index) => {
            rebar.segments.forEach(seg => {
                let isWaitingQueue = index > Domain.activeRebarIndex;
                let color = (rebar.state === "FORMED") ? '#8A2BE2' : (isWaitingQueue ? '#555555' : (seg.state === "SETTLED" ? '#00FF00' : '#FF9800'));
                
                let pts = [];
                if (seg.state === "FITTING" || isWaitingQueue || seg.state === "WAITING") {
                    if (!isWaitingQueue && seg.state === "FITTING") {
                        seg.nodes.forEach(node => { UI.rebarGroup.add(new Konva.Circle({ x: node.x, y: node.y, radius: nodeR, fill: '#FF5722' })); });
                    }
                    pts = [seg.nodes[0].x, seg.nodes[0].y, seg.nodes[1].x, seg.nodes[1].y];
                } else { pts = [seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]; }
              
                UI.rebarGroup.add(new Konva.Line({ points: pts, stroke: color, strokeWidth: (rebar.state==="FORMED"? 5 : 2), lineCap: 'round', strokeScaleEnabled: false }));

                if (seg.label) {
                    let midX = (seg.p1.x + seg.p2.x) / 2;
                    let midY = (seg.p1.y + seg.p2.y) / 2;
                    
                    let offsetDist = secType === "TBEAM" ? 20 : 150; 
                    let textX = midX + seg.normal.x * offsetDist;
                    let textY = midY + seg.normal.y * offsetDist;

                    UI.rebarGroup.add(new Konva.Text({
                        x: textX,
                        y: textY,
                        text: seg.label,
                        fontSize: secType === "TBEAM" ? 16 : 60,
                        fontFamily: 'Arial',
                        fontStyle: 'bold',
                        fill: '#00FFFF', 
                        scaleY: -1,      
                        offsetX: secType === "TBEAM" ? 5 : 20,
                        offsetY: secType === "TBEAM" ? 8 : 30
                    }));
                }
            });
            
            if (rebar.state === "FORMED") {
                for (let i = 0; i < rebar.segments.length - 1; i++) {
                    let corner = rebar.segments[i].p2;
                    UI.rebarGroup.add(new Konva.Circle({ x: corner.x, y: corner.y, radius: nodeR, fill: '#00FFFF' }));
                }
            }
        });

        const statGrid = document.getElementById('stat-grid');
        if (Domain.rebarList.length > 0) {
            let currentNum = Math.min(Domain.activeRebarIndex + 1, Domain.rebarList.length);
            statGrid.innerHTML = `
                <div class="stat-row">Total Rebars: <span class="val">${Domain.rebarList.length} EA</span></div>
                <div class="stat-row">Processing: <span class="val" style="color:orange;">#${currentNum}</span> / ${Domain.rebarList.length}</div>
            `;
        }
    },

    drawGrid: () => { 
        UI.gridGroup.destroyChildren();
        const scale = UI.stage.scaleX();
        let step = 500; if (scale < 0.1) step = 2000; if (scale < 0.03) step = 5000;
        const transform = UI.mainLayer.getAbsoluteTransform().copy().invert();
        const topLeft = transform.point({x: 0, y: 0});
        const bottomRight = transform.point({x: UI.stage.width(), y: UI.stage.height()});
        const minX = Math.floor(topLeft.x / step) * step; const maxX = Math.ceil(bottomRight.x / step) * step;
        const minY = Math.floor(bottomRight.y / step) * step; const maxY = Math.ceil(topLeft.y / step) * step;

        for (let x = minX; x <= maxX; x += step) {
            let isAxis = Math.abs(x) < 0.1; 
            UI.gridGroup.add(new Konva.Line({ points: [x, minY, x, maxY], stroke: '#ffffff', strokeWidth: isAxis ? 1.0 : 0.5, opacity: isAxis ? 0.6 : 0.15, strokeScaleEnabled: false }));
        }
        for (let y = minY; y <= maxY; y += step) {
            let isAxis = Math.abs(y) < 0.1;
            UI.gridGroup.add(new Konva.Line({ points: [minX, y, maxX, y], stroke: '#ffffff', strokeWidth: isAxis ? 1.0 : 0.5, opacity: isAxis ? 0.6 : 0.15, strokeScaleEnabled: false }));
        }
    },

    drawNormals: () => { 
        UI.normalGroup.destroyChildren();
        if (!UI.showNormals || !Domain.currentSection) return;
        let normScale = (document.getElementById("sectionSelect").value === "TBEAM" ? 50 : 250); 
        Domain.currentSection.walls.forEach(wall => {
            let midX = (wall.x1 + wall.x2) / 2; let midY = (wall.y1 + wall.y2) / 2;
            let endX = midX + wall.nx * normScale; let endY = midY + wall.ny * normScale;
            UI.normalGroup.add(new Konva.Arrow({ points: [midX, midY, endX, endY], pointerLength: 10, pointerWidth: 10, fill: '#FFC107', stroke: '#FFC107', strokeWidth: 2, strokeScaleEnabled: false }));
            UI.normalGroup.add(new Konva.Circle({ x: midX, y: midY, radius: 4, fill: '#FF5722', strokeScaleEnabled: false }));
        });
    },

    toggleNormals: () => {
        UI.showNormals = !UI.showNormals; 
        const btn = document.getElementById("btnToggleNormals");
        if(UI.showNormals) { btn.classList.add("active"); } else { btn.classList.remove("active"); }
        UI.drawNormals();
    },

    toggleDebugNodes: () => {
        UI.showNodes = !UI.showNodes;
        const btn = document.getElementById("btnToggleNodes");
        if(UI.showNodes) { btn.classList.add("active"); } else { btn.classList.remove("active"); }
        UI.drawDebugNodes();
    },

    drawDebugNodes: () => {
        UI.debugGroup.destroyChildren(); 
        if (!UI.showNodes || !Domain.currentSection) return;

        let secType = document.getElementById("sectionSelect").value;
        let fontSize = secType === "TBEAM" ? 14 : 50; 
        let pointR = secType === "TBEAM" ? 4 : 20;

        Domain.currentSection.walls.forEach((w, index) => {
            UI.debugGroup.add(new Konva.Line({
                points: [w.x1, w.y1, w.x2, w.y2],
                stroke: 'yellow',
                strokeWidth: 2,
                dash: [10, 10], 
                opacity: 0.7,
                strokeScaleEnabled: false
            }));

            UI.debugGroup.add(new Konva.Circle({ x: w.x1, y: w.y1, radius: pointR, fill: 'red', strokeScaleEnabled: false }));
            UI.debugGroup.add(new Konva.Circle({ x: w.x2, y: w.y2, radius: pointR, fill: 'blue', strokeScaleEnabled: false }));

            let midX = (w.x1 + w.x2) / 2;
            let midY = (w.y1 + w.y2) / 2;

            let label = new Konva.Label({ x: midX, y: midY, opacity: 0.9, scaleY: -1 });
            label.add(new Konva.Tag({ fill: 'black', cornerRadius: 4 }));
            label.add(new Konva.Text({
                text: w.id,
                fontFamily: 'Arial',
                fontSize: fontSize,
                padding: 5,
                fill: 'white',
                fontStyle: 'bold'
            }));

            UI.debugGroup.add(label);
        });
    }
};
