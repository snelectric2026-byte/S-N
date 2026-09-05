/* ==========================================================================
   SNelectric & MEP Planner Engine v2.0 - Complete Edition
   ========================================================================== */

let canvas;
let undoStack = [];
let redoStack = [];
let isPerformingHistoryAction = false;

// Drawing State (Pipes & Wires)
let isDrawingLine = false;
let currentLine = null;
let currentLineType = null; // 'cold_pipe', 'hot_pipe', 'drain_pipe', 'wire'
let currentFont = 'Arial';

// Three.js 3D Variables
let scene, camera, renderer, controls;
let isInteriorView = false;
let roomMeshGroup = new THREE.Group();

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initLayers();
    initGlobalEventListeners();
    init3D();
    updateInventorySummary();

    // 1. تشغيل القوائم المنسدلة (Accordion) بدون تعارض
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    accordionHeaders.forEach(header => {
        header.onclick = function(e) {
            e.stopPropagation();
            const content = this.nextElementSibling;
            if (content && content.classList.contains('accordion-content')) {
                const isHidden = getComputedStyle(content).display === 'none';
                content.style.display = isHidden ? 'grid' : 'none';
            }
        };
    });

    // 2. إخفاء أي شاشة افتتاحية إن وجدت نهائياً
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.remove();
    }
});

/* ==========================================================================
   1. Canvas Initialization & Core Events
   ========================================================================== */
function initCanvas() {
    const container = document.getElementById('canvasContainer');
    canvas = new fabric.Canvas('drawCanvas', {
        width: container ? container.clientWidth : 800,
        height: container ? container.clientHeight : 600,
        backgroundColor: '#0a0a14',
        selection: true
    });

    saveState();

    // Canvas Event Handling
    canvas.on('object:modified', saveState);
    canvas.on('object:added', () => { 
        if (!isPerformingHistoryAction) saveState(); 
        updateInventorySummary();
    });
    canvas.on('object:removed', () => {
        if (!isPerformingHistoryAction) saveState();
        updateInventorySummary();
    });

    canvas.on('selection:created', onObjectSelected);
    canvas.on('selection:updated', onObjectSelected);
    canvas.on('selection:cleared', () => {
        const panel = document.getElementById('propertiesPanel');
        if (panel) panel.classList.add('hidden');
        const floatingGroup = document.getElementById('floatingActionGroup');
        if (floatingGroup) floatingGroup.style.display = 'none';
    });

    // Pipe / Wire Interactive Drawing Listeners
    canvas.on('mouse:down', startDrawingLine);
    canvas.on('mouse:move', keepDrawingLine);
    canvas.on('mouse:up', stopDrawingLine);

    window.addEventListener('resize', () => {
        const parent = document.getElementById('canvasContainer');
        if (parent) {
            canvas.setWidth(parent.clientWidth);
            canvas.setHeight(parent.clientHeight);
            canvas.renderAll();
        }
    });
}

/* ==========================================================================
   2. State Management (Undo / Redo Mechanism)
   ========================================================================== */
function saveState() {
    if (isPerformingHistoryAction) return;
    const json = JSON.stringify(canvas.toJSON([
        'nameTag', 'symbolType', 'pipeSize', 'layerType', 
        'elevationZ', 'realWidth', 'realHeight', 'isLine', 'lineLength'
    ]));
    undoStack.push(json);
    redoStack = [];
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = undoStack.length <= 1;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function performUndo() {
    if (undoStack.length > 1) {
        isPerformingHistoryAction = true;
        redoStack.push(undoStack.pop());
        const previousState = undoStack[undoStack.length - 1];
        
        canvas.loadFromJSON(previousState, () => {
            canvas.renderAll();
            isPerformingHistoryAction = false;
            updateUndoRedoButtons();
            updateInventorySummary();
        }, restoreCustomProperties);
    }
}

function performRedo() {
    if (redoStack.length > 0) {
        isPerformingHistoryAction = true;
        const nextState = redoStack.pop();
        undoStack.push(nextState);

        canvas.loadFromJSON(nextState, () => {
            canvas.renderAll();
            isPerformingHistoryAction = false;
            updateUndoRedoButtons();
            updateInventorySummary();
        }, restoreCustomProperties);
    }
}

function restoreCustomProperties(o, object) {
    object.nameTag = o.nameTag;
    object.symbolType = o.symbolType;
    object.pipeSize = o.pipeSize;
    object.layerType = o.layerType;
    object.elevationZ = o.elevationZ;
    object.realWidth = o.realWidth;
    object.realHeight = o.realHeight;
    object.isLine = o.isLine;
    object.lineLength = o.lineLength;
}

/* ==========================================================================
   3. Element Generators (Furniture, Symbols & Real-Scale Rectangles)
   ========================================================================== */
window.createScaledRect = function(widthCm, heightCm, color, name, layer, extraProps = {}) {
    const scaleElem = document.getElementById('scaleFactor');
    const scale = scaleElem ? (parseFloat(scaleElem.value) || 1) : 1;

    const rect = new fabric.Rect({
        left: canvas.width / 2 - (widthCm * scale) / 2,
        top: canvas.height / 2 - (heightCm * scale) / 2,
        width: widthCm * scale,
        height: heightCm * scale,
        fill: color,
        stroke: '#ffffff',
        strokeWidth: 1,
        cornerColor: '#00f2fe',
        hasControls: true
    });

    rect.nameTag = name;
    rect.layerType = layer;
    rect.realWidth = widthCm;
    rect.realHeight = heightCm;
    rect.elevationZ = extraProps.elevationZ || 0;
    rect.symbolType = extraProps.symbolType || 'generic';
    rect.pipeSize = extraProps.pipeSize || null;

    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
};

window.addSymbol = function(type, label) {
    let color = '#00f2fe';
    let layer = 'electrical';
    let w = 30, h = 30;

    if (type.includes('door') || type.includes('window') || type.includes('balcony')) {
        layer = 'architectural';
        color = '#854d0e';
        w = 90; h = 15;
    } else if (type.includes('sink') || type.includes('toilet') || type.includes('shower') || type.includes('bathtub') || type.includes('drain')) {
        layer = 'plumbing';
        color = '#06b6d4';
        w = 60; h = 60;
    } else if (type.includes('chair') || type.includes('sofa') || type.includes('table') || type.includes('bed') || type.includes('wardrobe')) {
        layer = 'architectural';
        color = '#3b82f6';
        w = 100; h = 100;
    }

    window.createScaledRect(w, h, color, label, layer, { symbolType: type });
};

/* ==========================================================================
   4. Interactive Drawing Engine (Pipes & Wires)
   ========================================================================== */
function setDrawingMode(type) {
    currentLineType = type;
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';
}

function startDrawingLine(o) {
    if (!currentLineType) return;
    isDrawingLine = true;
    const pointer = canvas.getPointer(o.e);
    const points = [pointer.x, pointer.y, pointer.x, pointer.y];

    let strokeColor = '#2563eb';
    let strokeWidth = 3;
    let layer = 'plumbing';

    if (currentLineType === 'cold_pipe') strokeColor = '#06b6d4';
    else if (currentLineType === 'hot_pipe') strokeColor = '#ef4444';
    else if (currentLineType === 'drain_pipe') { strokeColor = '#6b7280'; strokeWidth = 6; }
    else if (currentLineType === 'wire') { strokeColor = '#facc15'; strokeWidth = 2; layer = 'electrical'; }

    const pipeElem = document.getElementById('pipeSize');
    const size = pipeElem ? pipeElem.value : '0.75';

    currentLine = new fabric.Line(points, {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        selectable: true,
        evented: true
    });

    currentLine.nameTag = `خط توصيل (${currentLineType})`;
    currentLine.layerType = layer;
    currentLine.isLine = true;
    currentLine.pipeSize = size;
    currentLine.elevationZ = (layer === 'electrical') ? 240 : 20;

    canvas.add(currentLine);
}

function keepDrawingLine(o) {
    if (!isDrawingLine || !currentLine) return;
    const pointer = canvas.getPointer(o.e);
    currentLine.set({ x2: pointer.x, y2: pointer.y });

    const dx = currentLine.x2 - currentLine.x1;
    const dy = currentLine.y2 - currentLine.y1;
    const scaleElem = document.getElementById('scaleFactor');
    const scale = scaleElem ? (parseFloat(scaleElem.value) || 1) : 1;
    const lengthCm = Math.sqrt(dx * dx + dy * dy) / scale;
    currentLine.lineLength = (lengthCm / 100).toFixed(2); // In Meters

    canvas.renderAll();
}

function stopDrawingLine() {
    if (!isDrawingLine) return;
    isDrawingLine = false;
    currentLine = null;
    currentLineType = null;
    canvas.selection = true;
    canvas.defaultCursor = 'default';
    saveState();
}

/* ==========================================================================
   5. Layer Controls & Property Inspector
   ========================================================================== */
function initLayers() {
    const toggles = {
        architectural: document.getElementById('layerArchitectural'),
        plumbing: document.getElementById('layerPlumbing'),
        electrical: document.getElementById('layerElectrical')
    };

    Object.keys(toggles).forEach(layer => {
        if (toggles[layer]) {
            toggles[layer].addEventListener('change', (e) => {
                const visible = e.target.checked;
                canvas.getObjects().forEach(obj => {
                    if (obj.layerType === layer) {
                        obj.visible = visible;
                    }
                });
                canvas.renderAll();
            });
        }
    });
}

function onObjectSelected(e) {
    const obj = e.selected ? e.selected[0] : null;
    if (!obj) return;

    const panel = document.getElementById('propertiesPanel');
    if (panel) {
        panel.classList.remove('hidden');
        document.getElementById('propName').value = obj.nameTag || '';
        document.getElementById('propWidth').value = obj.realWidth || Math.round((obj.width || 0) * (obj.scaleX || 1));
        document.getElementById('propHeight').value = obj.realHeight || Math.round((obj.height || 0) * (obj.scaleY || 1));
        document.getElementById('propElevation').value = obj.elevationZ || 0;
    }

    // Show floating bar
    const floatingGroup = document.getElementById('floatingActionGroup');
    if (floatingGroup) {
        floatingGroup.style.display = 'flex';
        floatingGroup.style.top = `${obj.top - 50}px`;
        floatingGroup.style.left = `${obj.left}px`;
    }
}

/* ==========================================================================
   6. UI Global Event Handlers & Tools
   ========================================================================== */
function initGlobalEventListeners() {
    // Undo / Redo Actions
    document.getElementById('btnUndo')?.addEventListener('click', performUndo);
    document.getElementById('btnRedo')?.addEventListener('click', performRedo);

    // Tools Setup
    document.getElementById('btnSelect')?.addEventListener('click', () => {
        canvas.isDrawingMode = false;
        currentLineType = null;
        updateActiveTool('btnSelect');
    });

    document.getElementById('btnPencil')?.addEventListener('click', () => {
        canvas.isDrawingMode = true;
        currentLineType = null;
        const color = document.getElementById('colorPicker')?.value || '#00f2fe';
        const width = parseInt(document.getElementById('brushWidth')?.value || '4');
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = color;
        canvas.freeDrawingBrush.width = width;
        updateActiveTool('btnPencil');
    });

    document.getElementById('btnText')?.addEventListener('click', () => {
        canvas.isDrawingMode = false;
        const text = new fabric.IText('نص جديد', {
            left: canvas.width / 2 - 40,
            top: canvas.height / 2 - 10,
            fontFamily: currentFont,
            fill: document.getElementById('colorPicker')?.value || '#00f2fe',
            fontSize: 20
        });
        text.nameTag = 'نص توضيحي';
        text.layerType = 'architectural';
        canvas.add(text);
        canvas.setActiveObject(text);
        updateActiveTool('btnSelect');
    });

    document.getElementById('btnDeleteSegment')?.addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            canvas.remove(activeObj);
            canvas.renderAll();
        } else {
            alert('يرجى تحديد العنصر أو الضلع المراد مسحه أولاً');
        }
    });

    // Apply Property Changes
    document.getElementById('btnApplyProps')?.addEventListener('click', () => {
        const obj = canvas.getActiveObject();
        if (!obj) return;

        obj.nameTag = document.getElementById('propName').value;
        obj.elevationZ = parseFloat(document.getElementById('propElevation').value) || 0;
        
        const newW = parseFloat(document.getElementById('propWidth').value);
        const newH = parseFloat(document.getElementById('propHeight').value);

        if (newW && newH && !obj.isLine) {
            obj.set({
                scaleX: 1,
                scaleY: 1,
                width: newW,
                height: newH
            });
            obj.realWidth = newW;
            obj.realHeight = newH;
        }

        canvas.renderAll();
        saveState();
    });

    // Color and Brush Dynamics
    document.getElementById('colorPicker')?.addEventListener('input', (e) => {
        const color = e.target.value;
        const circle = document.getElementById('colorCirclePreview');
        if (circle) circle.style.background = color;
        if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = color;
        }
    });

    document.getElementById('brushWidth')?.addEventListener('input', (e) => {
        if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
        }
    });

    // Plumbing Pipe Drawing Events
    document.getElementById('drawColdPipe')?.addEventListener('click', () => setDrawingMode('cold_pipe'));
    document.getElementById('drawHotPipe')?.addEventListener('click', () => setDrawingMode('hot_pipe'));
    document.getElementById('drawDrainPipe')?.addEventListener('click', () => setDrawingMode('drain_pipe'));
    document.getElementById('drawWire')?.addEventListener('click', () => setDrawingMode('wire'));

    // Fittings Generators
    const getPipeSize = () => document.getElementById('pipeSize')?.value || '0.75';

    document.getElementById('addElbow90')?.addEventListener('click', () => {
        const sz = getPipeSize();
        window.createScaledRect(15, 15, '#06b6d4', `كوع 90° (${sz}")`, 'plumbing', { pipeSize: sz, symbolType: 'fitting' });
    });

    document.getElementById('addElbow45')?.addEventListener('click', () => {
        const sz = getPipeSize();
        window.createScaledRect(12, 12, '#0891b2', `كوع 45° (${sz}")`, 'plumbing', { pipeSize: sz, symbolType: 'fitting' });
    });

    document.getElementById('addTee')?.addEventListener('click', () => {
        const sz = getPipeSize();
        window.createScaledRect(20, 15, '#0284c7', `مشترك T (${sz}")`, 'plumbing', { pipeSize: sz, symbolType: 'fitting' });
    });

    document.getElementById('addCoupling')?.addEventListener('click', () => {
        const sz = getPipeSize();
        window.createScaledRect(10, 10, '#0369a1', `جلبة (${sz}")`, 'plumbing', { pipeSize: sz, symbolType: 'fitting' });
    });

    document.getElementById('addValve')?.addEventListener('click', () => {
        window.createScaledRect(15, 15, '#b91c1c', 'محبس رئيسي', 'plumbing', { elevationZ: 50, symbolType: 'valve' });
    });

    // Floating Action Toolbar
    document.getElementById('floatingDeleteBtn')?.addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            canvas.remove(activeObj);
            const fg = document.getElementById('floatingActionGroup');
            if (fg) fg.style.display = 'none';
        }
    });

    document.getElementById('floatingDuplicateBtn')?.addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            activeObj.clone((cloned) => {
                cloned.set({ left: activeObj.left + 20, top: activeObj.top + 20 });
                canvas.add(cloned);
                canvas.setActiveObject(cloned);
            });
        }
    });

    document.getElementById('elementColorPicker')?.addEventListener('input', (e) => {
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
            activeObj.set('fill', e.target.value);
            canvas.renderAll();
        }
    });

    // Export and Save Action Events
    document.getElementById('btnSave')?.addEventListener('click', () => {
        const modal = document.getElementById('dimensionsModal');
        if (modal) modal.classList.remove('hidden');
    });

    // Inventory BOM Triggers
    document.getElementById('btnInventory')?.addEventListener('click', renderFullBOMTable);

    // Canvas Tools & Clear
    document.getElementById('btnClear')?.addEventListener('click', () => {
        if (confirm('هل أنت تأكد من مسح كافة العناصر باللوحة؟')) {
            canvas.clear();
            canvas.setBackgroundColor('#0a0a14', canvas.renderAll.bind(canvas));
            saveState();
        }
    });

    // Reset Zoom / Center Focus
    document.getElementById('btnResetZoom')?.addEventListener('click', () => {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    });
}

function updateActiveTool(activeBtnId) {
    ['btnSelect', 'btnPencil'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (id === activeBtnId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

/* ==========================================================================
   7. Accordion & Modal Navigation Helpers
   ========================================================================== */
window.toggleAccordion = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const isHidden = window.getComputedStyle(el).display === 'none';
    
    document.querySelectorAll('.accordion-content').forEach(acc => {
        acc.style.display = 'none';
    });

    if (isHidden) {
        el.style.display = 'grid';
    }
};

window.toggleDropdown = function(id) {
    const el = document.getElementById(id);
    if (el) {
        const isHidden = window.getComputedStyle(el).display === 'none';
        el.style.display = isHidden ? 'block' : 'none';
    }
};

window.setFont = function(fontName, label) {
    currentFont = fontName;
    const labelEl = document.getElementById('fontLabel');
    if (labelEl) labelEl.innerText = `الخط: ${label} ▾`;
    window.toggleDropdown('fontDropdown');

    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.type === 'i-text') {
        activeObj.set('fontFamily', fontName);
        canvas.renderAll();
    }
};

window.setBrush = function(type, label) {
    const labelEl = document.getElementById('brushLabel');
    if (labelEl) labelEl.innerText = `نوع القلم: ${label} ▾`;
    window.toggleDropdown('brushDropdown');

    canvas.isDrawingMode = true;
    const color = document.getElementById('colorPicker')?.value || '#00f2fe';
    const width = parseInt(document.getElementById('brushWidth')?.value || '4');

    if (type === 'dotted') {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.strokeDashArray = [5, 10];
    } else if (type === 'highlighter') {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = color + '80'; // Transparency
    } else {
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    }

    canvas.freeDrawingBrush.color = (type === 'highlighter') ? color + '80' : color;
    canvas.freeDrawingBrush.width = width;
};

window.promptAddRoom = function(title) {
    const titleEl = document.getElementById('roomModalTitle');
    if (titleEl) titleEl.innerText = `🏠 إدخال أبعاد ${title}`;
    const modal = document.getElementById('roomInputModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeRoomModal = function() {
    const modal = document.getElementById('roomInputModal');
    if (modal) modal.classList.add('hidden');
};

window.closeModal = function() {
    const modal = document.getElementById('dimensionsModal');
    if (modal) modal.classList.add('hidden');
};

window.closeInventoryModal = function() {
    const modal = document.getElementById('inventoryModal');
    if (modal) modal.classList.add('hidden');
};

window.confirmAddRoom = function() {
    const l = (parseFloat(document.getElementById('inputRoomLength').value) || 4) * 100;
    const w = (parseFloat(document.getElementById('inputRoomWidth').value) || 3) * 100;
    window.createScaledRect(l, w, 'rgba(0, 242, 254, 0.08)', 'غرفة معمارية', 'architectural');
    window.closeRoomModal();
};

window.saveFinalImage = function() {
    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1.0
    });
    const link = document.createElement('a');
    link.download = 'SN_Plan_Export.png';
    link.href = dataURL;
    link.click();
    window.closeModal();
};

window.openSmartDistributor = function() {
    alert('⚡ تم تشغيل نظام التوزيع التلقائي للدوائر والقواطع بنجاح!');
};

/* ==========================================================================
   8. Three.js 3D Engine & Projection System
   ========================================================================== */
function init3D() {
    const container = document.getElementById('container3D');
    if (!container || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05050a);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(300, 800, 500);
    scene.add(dirLight);

    scene.add(roomMeshGroup);

    function animate() {
        requestAnimationFrame(animate);
        if (controls) controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

document.getElementById('btnView3D')?.addEventListener('click', () => {
    const modal = document.getElementById('modal3D');
    if (modal) modal.style.display = 'block';
    build3DSceneFromCanvas();
    isInteriorView = false;
    updateCameraMode();
});

window.close3DModal = function() {
    const modal = document.getElementById('modal3D');
    if (modal) modal.style.display = 'none';
};

function updateCameraMode() {
    if (!camera || !controls) return;
    const btn = document.getElementById('btnToggleCamMode');
    if (isInteriorView) {
        camera.position.set(0, 160, 0);
        controls.target.set(0, 160, -100);
        if (btn) btn.innerText = "🏠 المنظور: داخلي (Interior)";
    } else {
        camera.position.set(600, 700, 800);
        controls.target.set(0, 0, 0);
        if (btn) btn.innerText = "📷 المنظور: خارجي (Orbit)";
    }
    controls.update();
}

document.getElementById('btnToggleCamMode')?.addEventListener('click', () => {
    isInteriorView = !isInteriorView;
    updateCameraMode();
});

function build3DSceneFromCanvas() {
    if (!scene) return;
    while (roomMeshGroup.children.length > 0) {
        roomMeshGroup.remove(roomMeshGroup.children[0]);
    }

    const gridHelper = new THREE.GridHelper(2000, 40, 0x00f2fe, 0x1f2937);
    roomMeshGroup.add(gridHelper);

    canvas.getObjects().forEach(obj => {
        if (!obj.visible) return;

        const zElevation = obj.elevationZ || 0;

        if (obj.isLine) {
            const dx = obj.x2 - obj.x1;
            const dy = obj.y2 - obj.y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            const geom = new THREE.CylinderGeometry(3, 3, len);
            let matColor = 0x2563eb;
            if (obj.stroke === '#06b6d4') matColor = 0x06b6d4;
            else if (obj.stroke === '#ef4444') matColor = 0xef4444;
            else if (obj.stroke === '#facc15') matColor = 0xfacc15;

            const mat = new THREE.MeshLambertMaterial({ color: matColor });
            const cylinder = new THREE.Mesh(geom, mat);

            const midX = (obj.x1 + obj.x2) / 2 - canvas.width / 2;
            const midZ = (obj.y1 + obj.y2) / 2 - canvas.height / 2;
            cylinder.position.set(midX, zElevation, midZ);
            cylinder.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
            roomMeshGroup.add(cylinder);

        } else {
            const w = (obj.realWidth || obj.width * obj.scaleX);
            const h = (obj.realHeight || obj.height * obj.scaleY);
            let thickness = 40;

            let matColor = 0x3b82f6;
            if (obj.layerType === 'plumbing') { matColor = 0x06b6d4; thickness = 15; }
            else if (obj.layerType === 'electrical') { matColor = 0xeab308; thickness = 10; }

            const geometry = new THREE.BoxGeometry(w, thickness, h);
            const material = new THREE.MeshLambertMaterial({ color: matColor });
            const mesh = new THREE.Mesh(geometry, material);

            mesh.position.set(
                (obj.left + (w / 2)) - canvas.width / 2,
                zElevation + (thickness / 2),
                (obj.top + (h / 2)) - canvas.height / 2
            );

            mesh.rotation.y = -(obj.angle || 0) * (Math.PI / 180);
            roomMeshGroup.add(mesh);
        }
    });
}

/* ==========================================================================
   9. Inventory Calculation & Bill of Materials (BOM)
   ========================================================================== */
function updateInventorySummary() {
    const listContainer = document.getElementById('inventoryListContainer');
    const totalCountLabel = document.getElementById('totalItemsCount');
    if (!listContainer) return;

    const summary = {};
    let totalCount = 0;

    canvas.getObjects().forEach(obj => {
        const name = obj.nameTag || 'عنصر عام';
        if (!summary[name]) summary[name] = 0;
        summary[name]++;
        totalCount++;
    });

    if (totalCountLabel) totalCountLabel.innerText = `${totalCount} عنصر`;

    if (totalCount === 0) {
        listContainer.innerHTML = `<div style="font-size:11px; color:#94a3b8; text-align:center; padding: 8px;">لم يتم إضافة عناصر بعد...</div>`;
        return;
    }

    let html = '';
    Object.keys(summary).forEach(name => {
        html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:#cbd5e1; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px;">
            <span>${name}</span>
            <span style="color:#00f2fe; font-weight:bold;">${summary[name]}</span>
        </div>`;
    });

    listContainer.innerHTML = html;
}

function renderFullBOMTable() {
    const modal = document.getElementById('inventoryModal');
    const container = document.getElementById('inventoryTableContainer');
    if (!modal || !container) return;

    modal.classList.remove('hidden');

    const summary = {};

    canvas.getObjects().forEach(obj => {
        const name = obj.nameTag || 'عنصر عام';
        const layer = obj.layerType || 'معماري';
        const key = `${name}_${layer}`;

        if (!summary[key]) {
            summary[key] = { count: 0, name: name, layer: layer, lineMeters: 0 };
        }

        if (obj.isLine) {
            summary[key].lineMeters += parseFloat(obj.lineLength) || 0;
        } else {
            summary[key].count++;
        }
    });

    let html = `<table style="width:100%; border-collapse:collapse; color:#fff; text-align:right; font-size:12px;">
        <thead>
            <tr style="background:#1e1e2e; color:#00f2fe;">
                <th style="padding:8px; border:1px solid #333;">اسم القطعة / العنصر</th>
                <th style="padding:8px; border:1px solid #333;">الطبقة</th>
                <th style="padding:8px; border:1px solid #333;">العدد</th>
                <th style="padding:8px; border:1px solid #333;">الإجمالي (أمتار)</th>
            </tr>
        </thead>
        <tbody>`;

    Object.keys(summary).forEach(k => {
        const item = summary[k];
        html += `<tr>
            <td style="padding:8px; border:1px solid #333;">${item.name}</td>
            <td style="padding:8px; border:1px solid #333;">${item.layer}</td>
            <td style="padding:8px; border:1px solid #333;">${item.count > 0 ? item.count + ' قطعة' : '-'}</td>
            <td style="padding:8px; border:1px solid #333;">${item.lineMeters > 0 ? item.lineMeters.toFixed(2) + ' متر' : '-'}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}
