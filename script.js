/* ==========================================================================
   S⚡N electric MEP Engine v4.0 - Master Full Combined Engine
   Combines Core Simulation, BIM 3D, MEP Algorithms, Symbols & Storage Bridge
   ========================================================================== */

// --- 1. Global Engine State & Variables ---
const EngineState = {
  mode: 'design', // 'design' | 'simulation'
  scaleMm: 10,     // 1px = 10mm
  gridStepMm: 100, // 100mm
  snapToGrid: true,
  historyStack: [],
  selectedColor: { stroke: '#00f2fe', fill: '#0284c7' },

  // لوحة الكهرباء والمحاكاة
  panelState: {
    mainBreaker: false,
    branches: { 1: false, 2: false, 3: false, 4: false }
  },
  simulationMetrics: {
    totalCurrentA: 0.0,
    totalPowerKW: 0.0,
    waterPressureBar: 0.0,
    statusText: 'الجهاز جاهز لإنشاء أو تشغيل المخطط'
  },
  pendingRoomData: null
};

// Canvas & 3D Variables
let canvas = null;
let scene = null, camera = null, renderer = null, controls = null, roomMeshGroup = null;
let is3DActive = false;
let animFrameId = null;

// Touch & Drawing Variables
let isDrawingLine = false;
let currentLine = null;
let currentLineType = null;
let isDragging = false;
let lastPosX = 0;
let lastPosY = 0;
const interactive3DObjects = [];

// --- 2. Advanced MEP Calculation Modules ---
const MEPCalculator = {
  // 1. حساب هبوط الجهد (Voltage Drop)
  calculateVoltageDrop: function(currentA, lengthM, wireSizeMm2, isThreePhase = false) {
    const resistivityCu = 0.0175; // مقاومة النحاس
    const voltage = isThreePhase ? 380 : 220;
    const factor = isThreePhase ? Math.sqrt(3) : 2;
    
    const voltageDropVolts = (factor * lengthM * currentA * resistivityCu) / wireSizeMm2;
    const percentage = (voltageDropVolts / voltage) * 100;
    
    return {
      dropVolts: voltageDropVolts.toFixed(2),
      percentage: percentage.toFixed(2),
      isAcceptable: percentage <= 3.0 // المعيار القياسي <= 3%
    };
  },

  // 2. حساب أقطار مواسير التغذية والصرف (Pipe Sizing)
  calculatePipeSize: function(fixtureUnits, isDrainage = false) {
    if (isDrainage) {
      if (fixtureUnits <= 2) return { diameterMm: 32, inch: '1.25"' };
      if (fixtureUnits <= 6) return { diameterMm: 50, inch: '2"' };
      if (fixtureUnits <= 20) return { diameterMm: 75, inch: '3"' };
      if (fixtureUnits <= 160) return { diameterMm: 110, inch: '4"' };
      return { diameterMm: 160, inch: '6"' };
    } else {
      if (fixtureUnits <= 2) return { diameterMm: 15, inch: '1/2"' };
      if (fixtureUnits <= 8) return { diameterMm: 20, inch: '3/4"' };
      if (fixtureUnits <= 30) return { diameterMm: 25, inch: '1"' };
      return { diameterMm: 32, inch: '1.25"' };
    }
  },

  // 3. التوزيع التلقائي للأحمال على الفازات الثلاث (3-Phase Load Balancing)
  balancePhases: function(loadsList) {
    const sortedLoads = [...loadsList].sort((a, b) => b.powerKW - a.powerKW);
    const phases = { R: { total: 0, items: [] }, S: { total: 0, items: [] }, T: { total: 0, items: [] } };

    sortedLoads.forEach(item => {
      const minPhase = Object.keys(phases).reduce((a, b) => phases[a].total < phases[b].total ? a : b);
      phases[minPhase].total += item.powerKW;
      phases[minPhase].items.push(item);
    });

    return phases;
  }
};

// --- 3. Project Storage & Robustness Management ---
const ProjectManager = {
  saveProjectToStorage: async function(projectName, userId = null) {
    try {
      if (!canvas) throw new Error("مساحة الرسم غير جاهزة");

      const projectData = {
        name: projectName,
        updatedAt: new Date().toISOString(),
        canvasJSON: canvas.toJSON([
          'mepType', 'mepName', 'nameTag', 'symbolType', 'roomWallHeight', 
          'roomWidth', 'roomHeight', 'isLine', 'lineLengthMm', 'doorWidth', 
          'isOn', 'isOpen', 'flowActive', 'loadCurrent', 'isPanel'
        ]),
        metrics: EngineState.simulationMetrics
      };

      if (!userId) {
        localStorage.setItem(`mep_project_${projectName}`, JSON.stringify(projectData));
        return { success: true, message: "تم حفظ المشروع محلياً بنجاح!" };
      }

      const response = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectData })
      });

      if (!response.ok) throw new Error("فشل الحفظ على السيرفر");
      return await response.json();

    } catch (error) {
      console.error("Project Save Error:", error);
      return { success: false, message: `تعذر الحفظ: ${error.message}` };
    }
  },

  loadProjectFromStorage: function(projectName) {
    try {
      const dataStr = localStorage.getItem(`mep_project_${projectName}`);
      if (!dataStr) throw new Error("المشروع غير موجود");

      const projectData = JSON.parse(dataStr);
      canvas.loadFromJSON(projectData.canvasJSON, () => {
        canvas.renderAll();
        if (typeof drawGrid === 'function') drawGrid();
        if (typeof updateSimulationEngine === 'function') updateSimulationEngine();
      });

      return { success: true, message: "تم تحميل المشروع بنجاح" };
    } catch (error) {
      console.error("Project Load Error:", error);
      return { success: false, message: `فشل التحميل: ${error.message}` };
    }
  }
};

// --- 4. Engine Initialization ---
window.addEventListener('DOMContentLoaded', () => {
  initSplashScreen();
  initCanvas2D();
  init3DScene();
  setupCanvasEvents();
  setupZoomAndPan();
  setupEventListeners();
  updateUIConsole();
  window.addEventListener('resize', handleResize);
});

function initSplashScreen() {
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('splash-hidden', 'fade-out');
      setTimeout(() => splash.remove(), 500);
    }
  }, 1500);
}

// --- 5. 2D Fabric.js Engine & Grid System ---
function initCanvas2D() {
  const container = document.getElementById('canvas2DContainer');
  const canvasElem = document.getElementById('mepCanvas');

  if (!container || !canvasElem) return;

  canvasElem.width = container.clientWidth;
  canvasElem.height = container.clientHeight;

  canvas = new fabric.Canvas('mepCanvas', {
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundColor: '#020617',
    selection: true,
    preserveObjectStacking: true
  });

  drawGrid();
  saveCanvasState();
}

function drawGrid() {
  if (!canvas) return;
  const gridPx = EngineState.gridStepMm / EngineState.scaleMm;
  const width = canvas.width * 5;
  const height = canvas.height * 5;

  const existingGrid = canvas.getObjects().filter(obj => obj.isGridLine);
  existingGrid.forEach(obj => canvas.remove(obj));

  if (!EngineState.snapToGrid) return;

  for (let x = -width; x < width; x += gridPx) {
    const line = new fabric.Line([x, -height, x, height], {
      stroke: '#1e293b',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      isGridLine: true
    });
    canvas.add(line);
    canvas.sendToBack(line);
  }

  for (let y = -height; y < height; y += gridPx) {
    const line = new fabric.Line([-width, y, width, y], {
      stroke: '#1e293b',
      strokeWidth: 1,
      selectable: false,
      evented: false,
      isGridLine: true
    });
    canvas.add(line);
    canvas.sendToBack(line);
  }
}

// --- 6. Catalog & Add Items Logic ---
window.addCatalogItem = function(category, itemName) {
  saveCanvasState();
  if (category === 'architectural' && itemName !== 'منطقة حرة (بدون اسم)') {
    addArchitecturalSpace(category, itemName);
  } else {
    addSymbol(category + '_' + itemName, itemName);
  }
  closeAllPopups();
};

function getShapeLabelConfig(defaultName) {
  const customLabelInput = document.getElementById('shapeLabelInput');
  const hideCheckbox = document.getElementById('hideShapeLabelCheckbox');
  
  let displayName = (customLabelInput && customLabelInput.value.trim() !== '') 
    ? customLabelInput.value.trim() 
    : defaultName;
      
  let hideText = hideCheckbox ? hideCheckbox.checked : false;
  return { displayName, hideText };
}

window.addArchitecturalSpace = function(roomType, roomName) {
  if (!canvas) return;
  const { displayName, hideText } = getShapeLabelConfig(roomName);
  EngineState.pendingRoomData = { roomType, displayName, hideText };

  const modalName = document.getElementById('modalRoomName');
  const modal = document.getElementById('roomDimensionModal');
  
  if (modalName) modalName.innerText = displayName;
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
};

window.closeRoomModal = function() {
  const modal = document.getElementById('roomDimensionModal');
  if (modal) {
    modal.classList.remove('active');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
  EngineState.pendingRoomData = null;
};

window.confirmRoomDimensions = function() {
  if (!EngineState.pendingRoomData || !canvas) return;

  const widthInput = document.getElementById('roomWidthInput');
  const lengthInput = document.getElementById('roomLengthInput');
  const heightInput = document.getElementById('roomHeightInput');

  const width = parseFloat(widthInput ? widthInput.value : 400) || 400;
  const height = parseFloat(lengthInput ? lengthInput.value : 300) || 300;
  const wallHeight = parseFloat(heightInput ? heightInput.value : 280) || 280;

  const { displayName, hideText } = EngineState.pendingRoomData;
  const center = canvas.getVpCenter();

  let strokeColor = EngineState.selectedColor.stroke;
  if (displayName.includes('نوم')) strokeColor = '#38bdf8'; 
  if (displayName.includes('حمام')) strokeColor = '#f43f5e'; 
  if (displayName.includes('مطبخ')) strokeColor = '#eab308'; 
  if (displayName.includes('استقبال')) strokeColor = '#22c55e'; 

  const roomRect = new fabric.Rect({
    width: width, height: height, fill: 'rgba(30, 41, 59, 0.3)',
    stroke: strokeColor, strokeWidth: 3, rx: 4, ry: 4, 
    originX: 'center', originY: 'center'
  });

  const roomLabel = new fabric.Text(`${displayName}\n${width}x${height} cm\nارتفاع: ${wallHeight}cm`, {
    fontSize: 13, fontWeight: 'bold', fill: '#ffffff', 
    textAlign: 'center', originX: 'center', originY: 'center', fontFamily: 'Segoe UI',
    visible: !hideText
  });

  const group = new fabric.Group([roomRect, roomLabel], {
    left: center.x, top: center.y, originX: 'center', originY: 'center'
  });

  group.mepType = 'architectural';
  group.mepName = displayName;
  group.nameTag = displayName;
  group.symbolType = 'architectural'; 
  group.roomWallHeight = wallHeight;
  group.roomWidth = width;
  group.roomHeight = height;

  canvas.add(group);
  canvas.bringToFront(group);
  group.setCoords();
  canvas.setActiveObject(group);

  saveCanvasState();
  canvas.requestRenderAll();
  closeRoomModal();
};

window.addSymbol = function(type, name) {
  if (!canvas) return;
  
  const { displayName, hideText } = getShapeLabelConfig(name);
  const center = canvas.getVpCenter();
  let shapes = [];
  const color = EngineState.selectedColor.stroke;

  let mepCategory = 'general';
  let loadA = 0.5;

  // --- رموز الكهرباء والطاقة الموسعة ---
  if (type.includes('switch') || displayName.includes('مفتاح')) {
    mepCategory = 'electrical';
    const c = new fabric.Circle({ radius: 12, fill: 'transparent', stroke: '#f5b813', strokeWidth: 2, originX: 'center', originY: 'center' });
    const l1 = new fabric.Line([0, -12, 0, -22], { stroke: '#f5b813', strokeWidth: 2 });
    const l2 = new fabric.Line([0, -22, 8, -22], { stroke: '#f5b813', strokeWidth: 2 });
    shapes.push(c, l1, l2);
  } else if (type.includes('socket') || displayName.includes('بريزة')) {
    mepCategory = 'electrical';
    loadA = 10.0;
    const c = new fabric.Circle({ radius: 14, fill: 'transparent', stroke: '#f5b813', strokeWidth: 2, originX: 'center', originY: 'center' });
    const l1 = new fabric.Line([-14, 0, 14, 0], { stroke: '#f5b813', strokeWidth: 2 });
    const l2 = new fabric.Line([0, 0, 0, 18], { stroke: '#f5b813', strokeWidth: 2 });
    shapes.push(c, l1, l2);
  } else if (type.includes('light') || displayName.includes('لمبة') || displayName.includes('سبوت')) {
    mepCategory = 'electrical';
    loadA = 0.2;
    const c = new fabric.Circle({ radius: 15, fill: 'transparent', stroke: '#00f2fe', strokeWidth: 2, originX: 'center', originY: 'center' });
    const l1 = new fabric.Line([-10, -10, 10, 10], { stroke: '#00f2fe', strokeWidth: 2 });
    const l2 = new fabric.Line([10, -10, -10, 10], { stroke: '#00f2fe', strokeWidth: 2 });
    shapes.push(c, l1, l2);
  } else if (type.includes('motor') || displayName.includes('موتور')) {
    mepCategory = 'electrical'; loadA = 8.5;
    const c = new fabric.Circle({ radius: 18, fill: 'transparent', stroke: '#38bdf8', strokeWidth: 2, originX: 'center', originY: 'center' });
    const t = new fabric.Text('M', { fontSize: 16, fontWeight: 'bold', fill: '#38bdf8', originX: 'center', originY: 'center' });
    shapes.push(c, t);
  } else if (type.includes('ac_unit') || displayName.includes('تكييف')) {
    mepCategory = 'electrical'; loadA = 12.0;
    const box = new fabric.Rect({ width: 60, height: 25, fill: 'rgba(56, 189, 248, 0.2)', stroke: '#38bdf8', strokeWidth: 2, rx: 3, originX: 'center', originY: 'center' });
    const t = new fabric.Text('A/C', { fontSize: 10, fill: '#ffffff', originX: 'center', originY: 'center' });
    shapes.push(box, t);
  } else if (type.includes('generator') || displayName.includes('مولد')) {
    mepCategory = 'power';
    const c = new fabric.Circle({ radius: 20, fill: 'rgba(245, 184, 19, 0.2)', stroke: '#f5b813', strokeWidth: 2, originX: 'center', originY: 'center' });
    const t = new fabric.Text('G', { fontSize: 16, fontWeight: 'bold', fill: '#f5b813', originX: 'center', originY: 'center' });
    shapes.push(c, t);
  } 

  // --- رموز السباكة والميكانيكا الموسعة ---
  else if (type.includes('water_pump') || displayName.includes('مضخة')) {
    mepCategory = 'plumbing';
    const c = new fabric.Circle({ radius: 16, fill: 'transparent', stroke: '#0284c7', strokeWidth: 2, originX: 'center', originY: 'center' });
    const p = new fabric.Path('M -8 8 L 0 -10 L 8 8 Z', { fill: '#0284c7', originX: 'center', originY: 'center' });
    shapes.push(c, p);
  } else if (type.includes('water_heater') || displayName.includes('سخان')) {
    mepCategory = 'plumbing'; loadA = 6.8;
    const c = new fabric.Circle({ radius: 22, fill: 'rgba(239, 68, 68, 0.15)', stroke: '#ef4444', strokeWidth: 2, originX: 'center', originY: 'center' });
    const t = new fabric.Text('WH', { fontSize: 12, fill: '#ef4444', originX: 'center', originY: 'center' });
    shapes.push(c, t);
  } else if (type.includes('floor_drain') || displayName.includes('بلاعة')) {
    mepCategory = 'plumbing';
    const c1 = new fabric.Circle({ radius: 14, fill: 'transparent', stroke: '#22c55e', strokeWidth: 2, originX: 'center', originY: 'center' });
    const c2 = new fabric.Circle({ radius: 6, fill: '#22c55e', originX: 'center', originY: 'center' });
    shapes.push(c1, c2);
  } else if (type.includes('plumbing') || displayName.includes('حوض') || displayName.includes('مرحاض')) {
    mepCategory = 'plumbing';
    const outer = new fabric.Rect({ width: 36, height: 36, fill: 'rgba(2, 132, 199, 0.2)', stroke: '#0284c7', strokeWidth: 2, rx: 6, ry: 6, originX: 'center', originY: 'center' });
    const inner = new fabric.Circle({ radius: 10, fill: 'transparent', stroke: '#0284c7', strokeWidth: 2, originX: 'center', originY: 'center' });
    shapes.push(outer, inner);
  } 

  // --- رموز النجارة والمعمار الموسعة ---
  else if (type.includes('sliding_door') || displayName.includes('باب سحاب')) {
    mepCategory = 'carpentry';
    const frame = new fabric.Rect({ width: 100, height: 10, fill: 'transparent', stroke: '#ff4757', strokeWidth: 1, originX: 'center', originY: 'center' });
    const d1 = new fabric.Line([-50, -2, 0, -2], { stroke: '#ff4757', strokeWidth: 3 });
    const d2 = new fabric.Line([0, 2, 50, 2], { stroke: '#ff4757', strokeWidth: 3 });
    shapes.push(frame, d1, d2);
  } else if (type.includes('carpentry') || displayName.includes('باب') || displayName.includes('شباك')) {
    mepCategory = 'carpentry';
    const isWindow = displayName.includes('شباك');
    const dWidth = 90;
    const wallThick2D = 10;

    const mask = new fabric.Rect({
      width: dWidth, height: wallThick2D + 4,
      fill: '#020617', originX: 'center', originY: 'center', is2DMask: true
    });
    const frame = new fabric.Rect({
      width: dWidth, height: wallThick2D,
      fill: isWindow ? 'rgba(0, 242, 254, 0.3)' : 'transparent',
      stroke: isWindow ? '#00f2fe' : '#ff4757', strokeWidth: 2,
      originX: 'center', originY: 'center'
    });

    shapes.push(mask, frame);
    if (!isWindow) {
      const arc = new fabric.Circle({
        radius: dWidth / 2, startAngle: 0, endAngle: Math.PI / 2,
        fill: 'transparent', stroke: '#ff4757', strokeWidth: 1, strokeDashArray: [3, 3],
        originX: 'center', originY: 'center'
      });
      shapes.push(arc);
    } else {
      const lineMid = new fabric.Line([-dWidth / 2, 0, dWidth / 2, 0], { stroke: '#00f2fe', strokeWidth: 1 });
      shapes.push(lineMid);
    }
  } else if (type.includes('furniture') || displayName.includes('سرير') || displayName.includes('كنبة') || displayName.includes('طاولة') || displayName.includes('دولاب')) {
    mepCategory = 'furniture';
    let fWidth = 100, fHeight = 100;
    let strokeCol = '#a855f7';

    if (displayName.includes('سرير')) {
      fWidth = 160; fHeight = 200;
      const bedBase = new fabric.Rect({ width: fWidth, height: fHeight, fill: 'rgba(168, 85, 247, 0.15)', stroke: strokeCol, strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center' });
      const pillow1 = new fabric.Rect({ width: 60, height: 35, fill: strokeCol, rx: 2, ry: 2, left: -40, top: -75, originX: 'center', originY: 'center' });
      const pillow2 = new fabric.Rect({ width: 60, height: 35, fill: strokeCol, rx: 2, ry: 2, left: 40, top: -75, originX: 'center', originY: 'center' });
      shapes.push(bedBase, pillow1, pillow2);
    } else if (displayName.includes('كنبة')) {
      fWidth = 180; fHeight = 80;
      const sofaBase = new fabric.Rect({ width: fWidth, height: fHeight, fill: 'rgba(168, 85, 247, 0.15)', stroke: strokeCol, strokeWidth: 2, rx: 8, ry: 8, originX: 'center', originY: 'center' });
      const backRest = new fabric.Rect({ width: fWidth - 10, height: 20, fill: strokeCol, rx: 4, ry: 4, top: -25, originX: 'center', originY: 'center' });
      shapes.push(sofaBase, backRest);
    } else {
      const box = new fabric.Rect({ width: 120, height: 80, fill: 'rgba(168, 85, 247, 0.2)', stroke: strokeCol, strokeWidth: 2, rx: 6, ry: 6, originX: 'center', originY: 'center' });
      shapes.push(box);
    }
  } else if (type.includes('power') || displayName.includes('لوحة') || displayName.includes('قاطع')) {
    mepCategory = 'power';
    const isPanel = displayName.includes('لوحة');
    const box = new fabric.Rect({ width: isPanel ? 50 : 40, height: isPanel ? 30 : 25, fill: 'rgba(245, 184, 19, 0.2)', stroke: '#f5b813', strokeWidth: 2, originX: 'center', originY: 'center' });
    const diag = new fabric.Line([-20, -12.5, 20, 12.5], { stroke: '#f5b813', strokeWidth: 1.5 });
    shapes.push(box, diag);
  } else {
    const box = new fabric.Rect({ width: 50, height: 30, fill: 'rgba(15, 23, 42, 0.85)', stroke: color, strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center' });
    shapes.push(box);
  }

  const label = new fabric.Text(displayName, {
    fontSize: 10, fill: '#ffffff', top: 25, originX: 'center', fontFamily: 'Segoe UI',
    visible: !hideText
  });
  shapes.push(label);

  const group = new fabric.Group(shapes, {
    left: center.x, top: center.y, originX: 'center', originY: 'center'
  });

  group.mepType = mepCategory;
  group.mepName = displayName;
  group.nameTag = displayName;
  group.symbolType = type;
  group.doorWidth = 90;
  group.isOn = false;
  group.isOpen = false;
  group.flowActive = false;
  group.loadCurrent = loadA;
  group.isPanel = displayName.includes('لوحة');

  canvas.add(group);
  canvas.bringToFront(group);
  group.setCoords();
  canvas.setActiveObject(group);

  saveCanvasState();
  canvas.requestRenderAll();
  updateSimulationEngine();
};

// --- 7. Simulation Logic & Panel Controls ---
window.setEngineMode = function(mode) {
  EngineState.mode = mode;
  
  const btnDesign = document.getElementById('btn-mode-design');
  const btnSim = document.getElementById('btn-mode-simulation');

  if (mode === 'simulation') {
    if (btnSim) btnSim.classList.add('active');
    if (btnDesign) btnDesign.classList.remove('active');
    canvas.selection = false;
    canvas.forEachObject(obj => obj.lockMovementX = obj.lockMovementY = true);
    EngineState.simulationMetrics.statusText = 'المحاكاة نشطة: اضغط على العناصر لتشغيلها أو فتح اللوحة';
  } else {
    if (btnDesign) btnDesign.classList.add('active');
    if (btnSim) btnSim.classList.remove('active');
    canvas.selection = true;
    canvas.forEachObject(obj => obj.lockMovementX = obj.lockMovementY = false);
    EngineState.simulationMetrics.statusText = 'وضع التصميم: يمكنك إضافة وتعديل العناصر';
  }

  updateSimulationEngine();
  canvas.renderAll();
};

function handleSimulationObjectClick(target) {
  if (!target || !target.mepType) return;

  if (target.isPanel) {
    openPanelModal();
    return;
  }

  if (target.mepType === 'electrical') {
    target.isOn = !target.isOn;
    const shape = target.item(0);
    if (shape) shape.set('fill', target.isOn ? 'rgba(0, 242, 254, 0.8)' : 'transparent');
  }

  if (target.mepType === 'carpentry') {
    target.isOpen = !target.isOpen;
    target.set('angle', target.isOpen ? 45 : 0);
  }

  if (target.mepType === 'plumbing') {
    target.flowActive = !target.flowActive;
    const shape = target.item(0);
    if (shape) shape.set('stroke', target.flowActive ? '#00f2fe' : '#0284c7');
  }

  saveCanvasState();
  updateSimulationEngine();
  canvas.renderAll();
}

function updateSimulationEngine() {
  let totalCurrent = 0.0;
  let pressure = 0.0;

  if (!canvas) return;
  const objects = canvas.getObjects();
  const isPowerAvailable = EngineState.panelState.mainBreaker;

  objects.forEach(obj => {
    if (obj.mepType === 'electrical' && obj.isOn && isPowerAvailable) {
      totalCurrent += (obj.loadCurrent || 0.5);
    }
    if (obj.mepType === 'plumbing' && obj.flowActive) {
      pressure += 1.2;
    }
  });

  const totalPower = (totalCurrent * 220) / 1000;

  EngineState.simulationMetrics.totalCurrentA = totalCurrent.toFixed(2);
  EngineState.simulationMetrics.totalPowerKW = totalPower.toFixed(2);
  EngineState.simulationMetrics.waterPressureBar = pressure.toFixed(1);

  updateUIConsole();
}

function updateUIConsole() {
  const statElem = document.getElementById('sys-status-text');
  const loadElem = document.getElementById('total-load-text');
  const pressElem = document.getElementById('total-pressure-text');

  if (statElem) statElem.innerText = EngineState.simulationMetrics.statusText;
  if (loadElem) loadElem.innerText = `${EngineState.simulationMetrics.totalCurrentA} A / ${EngineState.simulationMetrics.totalPowerKW} kW`;
  if (pressElem) pressElem.innerText = `${EngineState.simulationMetrics.waterPressureBar} Bar`;
}

window.openPanelModal = function() {
  const modal = document.getElementById('panel-modal');
  if (modal) modal.classList.remove('hidden');
};

window.closePanelModal = function() {
  const modal = document.getElementById('panel-modal');
  if (modal) modal.classList.add('hidden');
};

window.toggleMainBreaker = function(checked) {
  EngineState.panelState.mainBreaker = checked;
  const statusElem = document.getElementById('main-breaker-status');
  if (statusElem) {
    statusElem.innerText = checked ? 'يعمل (مغلق)' : 'مفصول (مفتوح)';
    statusElem.className = checked ? 'status-tag on' : 'status-tag off';
  }
  updateSimulationEngine();
};

window.toggleBranch = function(branchNum, checked) {
  EngineState.panelState.branches[branchNum] = checked;
  const ledElem = document.getElementById(`branch-${branchNum}-indicator`);
  if (ledElem) ledElem.className = checked ? 'indicator-led on' : 'indicator-led off';
  updateSimulationEngine();
};

// --- 8. Zoom & Pan & Touch Interaction System ---
function setupZoomAndPan() {
  if (!canvas) return;

  canvas.on('mouse:wheel', function (opt) {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    if (zoom > 5) zoom = 5;
    if (zoom < 0.2) zoom = 0.2;

    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault();
    opt.e.stopPropagation();
  });

  canvas.on('mouse:down', function (opt) {
    const evt = opt.e;
    if (evt.altKey || evt.button === 1) {
      isDragging = true;
      canvas.selection = false;
      lastPosX = evt.clientX;
      lastPosY = evt.clientY;
    }
  });

  canvas.on('mouse:move', function (opt) {
    if (isDragging) {
      const e = opt.e;
      const vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastPosX;
      vpt[5] += e.clientY - lastPosY;
      canvas.requestRenderAll();
      lastPosX = e.clientX;
      lastPosY = e.clientY;
    }
  });

  canvas.on('mouse:up', function () {
    if (isDragging) {
      canvas.setViewportTransform(canvas.viewportTransform);
      isDragging = false;
      canvas.selection = true;
    }
  });

  let initialDistance = 0;
  let initialZoom = 1;

  canvas.upperCanvasEl.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      canvas.selection = false;
      initialDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialZoom = canvas.getZoom();
      lastPosX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastPosY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: false });

  canvas.upperCanvasEl.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );

      if (initialDistance > 0) {
        const touchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const touchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        let zoom = initialZoom * (currentDistance / initialDistance);
        if (zoom > 5) zoom = 5;
        if (zoom < 0.2) zoom = 0.2;

        canvas.zoomToPoint({ x: touchCenterX, y: touchCenterY }, zoom);
        const vpt = canvas.viewportTransform;
        vpt[4] += touchCenterX - lastPosX;
        vpt[5] += touchCenterY - lastPosY;
        canvas.requestRenderAll();

        lastPosX = touchCenterX;
        lastPosY = touchCenterY;
      }
    }
  }, { passive: false });

  canvas.upperCanvasEl.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) {
      initialDistance = 0;
      canvas.selection = true;
    }
  });
}

function setupCanvasEvents() {
  if (!canvas) return;

  canvas.on('mouse:move', (opt) => {
    const pointer = canvas.getPointer(opt.e);
    const statX = document.getElementById('statX');
    const statY = document.getElementById('statY');
    if (statX) statX.innerText = Math.round(pointer.x * EngineState.scaleMm);
    if (statY) statY.innerText = Math.round(pointer.y * EngineState.scaleMm);

    if (isDrawingLine && currentLine) {
      let targetX = pointer.x;
      let targetY = pointer.y;

      if (EngineState.snapToGrid) {
        const snapPx = EngineState.gridStepMm / EngineState.scaleMm;
        targetX = Math.round(targetX / snapPx) * snapPx;
        targetY = Math.round(targetY / snapPx) * snapPx;
      }

      currentLine.set({ x2: targetX, y2: targetY });
      const dx = (targetX - currentLine.x1) * EngineState.scaleMm;
      const dy = (targetY - currentLine.y1) * EngineState.scaleMm;
      currentLine.lineLengthMm = Math.round(Math.sqrt(dx * dx + dy * dy));
      canvas.renderAll();
    }
  });

  canvas.on('object:moving', (opt) => {
    if (!EngineState.snapToGrid) return;
    const snapPx = EngineState.gridStepMm / EngineState.scaleMm;
    const target = opt.target;
    target.set({
      left: Math.round(target.left / snapPx) * snapPx,
      top: Math.round(target.top / snapPx) * snapPx
    });
    target.setCoords();
  });

  canvas.on('selection:created', updateStatusDimensions);
  canvas.on('selection:updated', updateStatusDimensions);
  canvas.on('selection:cleared', () => {
    const statW = document.getElementById('statW');
    const statH = document.getElementById('statH');
    if (statW) statW.innerText = '0';
    if (statH) statH.innerText = '0';
  });

  canvas.on('object:modified', saveCanvasState);

  canvas.on('mouse:down', (opt) => {
    if (EngineState.mode === 'simulation' && opt.target) {
      handleSimulationObjectClick(opt.target);
    }
    if (isDrawingLine && currentLine) {
      isDrawingLine = false;
      currentLine.setCoords();
      saveCanvasState();
      currentLine = null;
    }
  });
}

function updateStatusDimensions(e) {
  const obj = e.selected[0];
  if (obj) {
    const wMm = Math.round((obj.width * obj.scaleX) * EngineState.scaleMm);
    const hMm = Math.round((obj.height * obj.scaleY) * EngineState.scaleMm);
    const statW = document.getElementById('statW');
    const statH = document.getElementById('statH');
    if (statW) statW.innerText = wMm;
    if (statH) statH.innerText = hMm;
  }
}

window.startDrawingLine = function(lineType) {
  isDrawingLine = true;
  currentLineType = lineType;

  let strokeColor = '#00f2fe';
  if (lineType === 'cold_pipe') strokeColor = '#0284c7';
  if (lineType === 'hot_pipe') strokeColor = '#ff3344';
  if (lineType === 'drain_pipe') strokeColor = '#22c55e';

  const center = canvas.getVpCenter();
  currentLine = new fabric.Line([center.x, center.y, center.x, center.y], {
    stroke: strokeColor,
    strokeWidth: 4,
    selectable: true,
    isLine: true,
    mepType: 'plumbing',
    lineType: lineType
  });

  canvas.add(currentLine);
  canvas.bringToFront(currentLine);
};

// --- 9. BIM 3D Engine & Dynamic Wall Cutouts & Interactive Simulation ---

function createWallWithOpenings(wallWidth, wallHeight, wallThickness, connectedItems) {
  const wallGroup = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.85 });

  if (!connectedItems || connectedItems.length === 0) {
    const solidWall = new THREE.Mesh(new THREE.BoxGeometry(wallWidth, wallHeight, wallThickness), wallMat);
    solidWall.position.set(0, wallHeight / 2, 0);
    wallGroup.add(solidWall);
    return wallGroup;
  }

  connectedItems.forEach(item => {
    const itemWidth = (item.doorWidth || item.width) * (item.scaleX || 1);
    const isWin = (item.nameTag || item.mepName || '').includes('شباك');
    
    const winSillHeight = isWin ? 100 : 0;
    const itemHeight = isWin ? 120 : 210;
    const lintelHeight = wallHeight - (winSillHeight + itemHeight);
    const sideWidth = (wallWidth - itemWidth) / 2;

    const leftPart = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness), wallMat);
    leftPart.position.set(-wallWidth / 2 + sideWidth / 2, wallHeight / 2, 0);

    const rightPart = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, wallHeight, wallThickness), wallMat);
    rightPart.position.set(wallWidth / 2 - sideWidth / 2, wallHeight / 2, 0);

    const lintelPart = new THREE.Mesh(new THREE.BoxGeometry(itemWidth, lintelHeight, wallThickness), wallMat);
    lintelPart.position.set(0, wallHeight - lintelHeight / 2, 0);

    wallGroup.add(leftPart, rightPart, lintelPart);

    if (isWin && winSillHeight > 0) {
      const sillPart = new THREE.Mesh(new THREE.BoxGeometry(itemWidth, winSillHeight, wallThickness), wallMat);
      sillPart.position.set(0, winSillHeight / 2, 0);
      wallGroup.add(sillPart);
    }
  });

  return wallGroup;
}

function init3DScene() {
  const container = document.getElementById('canvas3DContainer');
  if (!container) return;

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
  camera.position.set(0, 500, 700);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const OrbitControlsCtor = THREE.OrbitControls || window.OrbitControls;
  if (OrbitControlsCtor) {
    controls = new OrbitControlsCtor(camera, renderer.domElement);
    controls.enableDamping = true;
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(500, 1000, 500);
  dirLight.castShadow = true;
  scene.add(dirLight);

  roomMeshGroup = new THREE.Group();
  scene.add(roomMeshGroup);

  renderer.domElement.addEventListener('click', handle3DClick);
}

function animate3D() {
  if (is3DActive) {
    animFrameId = requestAnimationFrame(animate3D);
    
    // محاكاة الدوران المستمر لمحاور المحركات الشغالة
    interactive3DObjects.forEach(obj => {
      if (obj.userData && obj.userData.type === 'motor' && obj.userData.canvasObj && obj.userData.canvasObj.isOn) {
        if (obj.userData.shaft) {
          obj.userData.shaft.rotation.x += 0.2;
        }
      }
    });

    if (controls) controls.update();
    renderer.render(scene, camera);
  }
}

function clear3DScene() {
  if (!roomMeshGroup) return;

  function disposeObject(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(mat => mat.dispose());
      } else {
        obj.material.dispose();
      }
    }
    if (obj.children) obj.children.forEach(child => disposeObject(child));
  }

  while (roomMeshGroup.children.length > 0) {
    const child = roomMeshGroup.children[0];
    disposeObject(child);
    roomMeshGroup.remove(child);
  }
  interactive3DObjects.length = 0;
}

window.toggle3DView = function() {
  const container2D = document.getElementById('canvas2DContainer');
  const container3D = document.getElementById('canvas3DContainer');

  is3DActive = !is3DActive;

  if (is3DActive) {
    container2D.style.display = 'none';
    container3D.style.display = 'block';

    setTimeout(() => {
      const width = container3D.clientWidth || window.innerWidth;
      const height = container3D.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      build3DScene();
      animate3D();
    }, 50);
  } else {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    container3D.style.display = 'none';
    container2D.style.display = 'block';
  }
};

function build3DScene() {
  clear3DScene();

  const gridHelper = new THREE.GridHelper(2000, 20, 0x00f2fe, 0x1e2937);
  roomMeshGroup.add(gridHelper);

  if (!canvas) return;

  const objects = canvas.getObjects().filter(o => !o.isGridLine);
  if (objects.length === 0) return;

  const rooms = objects.filter(o => o.symbolType === 'architectural' || o.mepType === 'architectural');
  const doorsAndWindows = objects.filter(o => (o.symbolType && o.symbolType.includes('carpentry')) || o.mepType === 'carpentry');
  const otherSymbols = objects.filter(o => o.symbolType !== 'architectural' && o.mepType !== 'architectural' && !doorsAndWindows.includes(o));

  rooms.forEach(obj => {
    let w = (obj.roomWidth || obj.width) * (obj.scaleX || 1);
    let h = (obj.roomHeight || obj.height) * (obj.scaleY || 1);
    let centerX = obj.originX === 'center' ? obj.left : obj.left + w / 2;
    let centerY = obj.originY === 'center' ? obj.top : obj.top + h / 2;

    const wallH = obj.roomWallHeight || 280;
    const thickness = 15;

    const roomGroup3D = new THREE.Group();

    const floorGeo = new THREE.BoxGeometry(w, 2, h);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, 1, 0);
    roomGroup3D.add(floorMesh);

    const roomLeft = obj.left - (obj.originX === 'center' ? w / 2 : 0);
    const roomTop = obj.top - (obj.originY === 'center' ? h / 2 : 0);
    const roomRight = roomLeft + w;
    const roomBottom = roomTop + h;

    const backItems = doorsAndWindows.filter(d => Math.abs(d.top - roomTop) < 30);
    const frontItems = doorsAndWindows.filter(d => Math.abs(d.top - roomBottom) < 30);
    const leftItems = doorsAndWindows.filter(d => Math.abs(d.left - roomLeft) < 30);
    const rightItems = doorsAndWindows.filter(d => Math.abs(d.left - roomRight) < 30);

    const backWall = createWallWithOpenings(w, wallH, thickness, backItems);
    backWall.position.set(0, 0, -h / 2);
    roomGroup3D.add(backWall);

    const frontWall = createWallWithOpenings(w, wallH, thickness, frontItems);
    frontWall.position.set(0, 0, h / 2);
    roomGroup3D.add(frontWall);

    const leftWall = createWallWithOpenings(h, wallH, thickness, leftItems);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-w / 2, 0, 0);
    roomGroup3D.add(leftWall);

    const rightWall = createWallWithOpenings(h, wallH, thickness, rightItems);
    rightWall.rotation.y = Math.PI / 2;
    rightWall.position.set(w / 2, 0, 0);
    roomGroup3D.add(rightWall);

    roomGroup3D.position.set(centerX - (canvas.width / 2), 0, centerY - (canvas.height / 2));
    roomGroup3D.rotation.y = -(obj.angle || 0) * (Math.PI / 180);

    roomMeshGroup.add(roomGroup3D);
  });

  doorsAndWindows.forEach(item => {
    const itemWidth = (item.doorWidth || item.width) * (item.scaleX || 1);
    const isWindow = (item.nameTag || item.mepName || '').includes('شباك');
    const itemHeight = isWindow ? 120 : 210;
    const winSillHeight = 100;

    let centerX = item.originX === 'center' ? item.left : item.left + (item.width * item.scaleX) / 2;
    let centerY = item.originY === 'center' ? item.top : item.top + (item.height * item.scaleY) / 2;

    const posX = centerX - (canvas.width / 2);
    const posZ = centerY - (canvas.height / 2);
    const posY_3D = isWindow ? winSillHeight : 0;

    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(posX - itemWidth / 2, posY_3D, posZ);

    if (!isWindow) {
      const doorLeafGeo = new THREE.BoxGeometry(itemWidth, itemHeight, 4);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 });
      const doorLeaf = new THREE.Mesh(doorLeafGeo, doorMat);
      doorLeaf.position.set(itemWidth / 2, itemHeight / 2, 0);

      const handleGeo = new THREE.SphereGeometry(3.5, 16, 16);
      const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8 });
      const handle = new THREE.Mesh(handleGeo, handleMat);
      handle.position.set(itemWidth - 10, itemHeight / 2, 5);

      doorLeaf.add(handle);
      pivotGroup.add(doorLeaf);

      doorLeaf.userData = { isOpen: false, type: 'door', targetAngle: -Math.PI / 2, pivotGroup: pivotGroup };
      interactive3DObjects.push(doorLeaf);
    } else {
      const frameGeo = new THREE.BoxGeometry(itemWidth, itemHeight, 8);
      const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x88ccee, transparent: true, opacity: 0.5, transmission: 0.9 });
      const windowLeaf = new THREE.Mesh(frameGeo, glassMat);
      windowLeaf.position.set(itemWidth / 2, itemHeight / 2, 0);

      pivotGroup.add(windowLeaf);
    }

    pivotGroup.rotation.y = -(item.angle || 0) * (Math.PI / 180);
    roomMeshGroup.add(pivotGroup);
  });

  otherSymbols.forEach(obj => {
    let w = (obj.width * obj.scaleX) || 30;
    let h = (obj.height * obj.scaleY) || 30;
    let centerX = obj.originX === 'center' ? obj.left : obj.left + w / 2;
    let centerY = obj.originY === 'center' ? obj.top : obj.top + h / 2;

    const posX = centerX - (canvas.width / 2);
    const posZ = centerY - (canvas.height / 2);
    const name = obj.nameTag || obj.mepName || '';

    // --- عناصر تفاعلية محسنة للـ 3D ---
    if (obj.mepType === 'electrical' && (name.includes('لمبة') || name.includes('سبوت'))) {
      const bulbGeo = new THREE.SphereGeometry(8, 16, 16);
      const bulbMat = new THREE.MeshBasicMaterial({ color: obj.isOn ? 0xffffaa : 0x555555 });
      const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
      bulbMesh.position.set(posX, 260, posZ);

      const pointLight = new THREE.PointLight(0xffea00, obj.isOn ? 1.5 : 0, 400);
      pointLight.position.set(posX, 255, posZ);
      
      roomMeshGroup.add(bulbMesh, pointLight);
      
      bulbMesh.userData = { type: 'light', lightRef: pointLight, matRef: bulbMat, canvasObj: obj };
      interactive3DObjects.push(bulbMesh);
    } else if (name.includes('موتور') || (obj.symbolType && obj.symbolType.includes('motor'))) {
      const motorGeo = new THREE.CylinderGeometry(15, 15, 35, 16);
      const motorMat = new THREE.MeshStandardMaterial({ color: obj.isOn ? 0x22c55e : 0x64748b });
      const motorMesh = new THREE.Mesh(motorGeo, motorMat);
      motorMesh.rotation.z = Math.PI / 2;
      motorMesh.position.set(posX, 20, posZ);

      const shaftGeo = new THREE.CylinderGeometry(3, 3, 50, 8);
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db });
      const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
      shaftMesh.rotation.z = Math.PI / 2;
      shaftMesh.position.set(posX, 20, posZ);

      roomMeshGroup.add(motorMesh, shaftMesh);

      motorMesh.userData = { type: 'motor', shaft: shaftMesh, canvasObj: obj };
      interactive3DObjects.push(motorMesh);
    } else if (obj.mepType === 'furniture' || name.includes('سرير') || name.includes('كنبة') || name.includes('طاولة')) {
      let furnH = 50;
      if (name.includes('سرير')) furnH = 60;
      else if (name.includes('كنبة')) furnH = 80;
      else if (name.includes('طاولة')) furnH = 75;

      const geo = new THREE.BoxGeometry(w, furnH, h);
      const mat = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, furnH / 2, posZ);
      mesh.rotation.y = -(obj.angle || 0) * (Math.PI / 180);
      roomMeshGroup.add(mesh);
    } else if (name.includes('بريزة')) {
      const geo = new THREE.BoxGeometry(12, 12, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xf5b813 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, 40, posZ);
      roomMeshGroup.add(mesh);
    } else if (name.includes('مفتاح')) {
      const geo = new THREE.BoxGeometry(10, 14, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff3344 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, 110, posZ);
      roomMeshGroup.add(mesh);
    } else if (obj.mepType === 'plumbing') {
      const geo = new THREE.BoxGeometry(w, 20, h);
      const mat = new THREE.MeshStandardMaterial({ color: 0x0284c7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, 10, posZ);
      roomMeshGroup.add(mesh);
    } else {
      const geo = new THREE.BoxGeometry(w, 15, h);
      const mat = new THREE.MeshStandardMaterial({ color: 0x64748b });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, 7.5, posZ);
      roomMeshGroup.add(mesh);
    }
  });

  camera.position.set(0, 500, 700);
  camera.lookAt(0, 0, 0);
  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function handle3DClick(event) {
  if (!is3DActive) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactive3DObjects);

  if (intersects.length > 0) {
    const target = intersects[0].object;
    const data = target.userData;

    if (data) {
      // 1. تشغيل / إطفاء الإضاءة في 3D
      if (data.type === 'light') {
        data.canvasObj.isOn = !data.canvasObj.isOn;
        data.lightRef.intensity = data.canvasObj.isOn ? 1.5 : 0;
        data.matRef.color.setHex(data.canvasObj.isOn ? 0xffffaa : 0x555555);
      }

      // 2. تشغيل / إيقاف الموتور في 3D
      if (data.type === 'motor') {
        data.canvasObj.isOn = !data.canvasObj.isOn;
        target.material.color.setHex(data.canvasObj.isOn ? 0x22c55e : 0x64748b);
      }

      // 3. فتح وغلق الأبواب
      if (data.type === 'door' || (target.parent && target.parent.userData && target.parent.userData.type === 'door')) {
        const doorData = data.type === 'door' ? data : target.parent.userData;
        const pivotGroup = doorData.pivotGroup || target.parent;
        const isOpen = doorData.isOpen;
        const targetRotation = isOpen ? 0 : doorData.targetAngle;

        const animateDoor = () => {
          if (Math.abs(pivotGroup.rotation.y - targetRotation) > 0.05) {
            pivotGroup.rotation.y += (targetRotation - pivotGroup.rotation.y) * 0.15;
            requestAnimationFrame(animateDoor);
          } else {
            pivotGroup.rotation.y = targetRotation;
            doorData.isOpen = !isOpen;
          }
        };
        animateDoor();
      }

      updateSimulationEngine();
      if (canvas) canvas.renderAll();
    }
  }
}

// --- 10. BOM Quantity Table & General Exports ---
window.toggleBOMModal = function() {
  const modal = document.getElementById('bom-modal');
  if (!modal) return;
  modal.classList.toggle('hidden');

  if (!modal.classList.contains('hidden')) {
    generateBOMTable();
  }
};

function generateBOMTable() {
  const tbody = document.getElementById('bom-table-body');
  if (!tbody || !canvas) return;
  tbody.innerHTML = '';

  const objects = canvas.getObjects().filter(o => !o.isGridLine);
  const counts = {};

  objects.forEach(obj => {
    const key = obj.nameTag || obj.mepName || 'عنصر هندسي';
    if (!counts[key]) {
      counts[key] = {
        name: key,
        category: obj.mepType || 'عام',
        count: 0,
        status: obj.isOn ? 'نشط' : (obj.isOpen ? 'مفتوح' : 'جاهز')
      };
    }
    counts[key].count++;
  });

  Object.values(counts).forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.category}</td>
      <td>${item.count}</td>
      <td>مواصفات قياسية MEP</td>
      <td><span class="status-tag on">${item.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

window.exportPNG = function() {
  if (!canvas) return;
  const dataURL = canvas.toDataURL({ format: 'png', quality: 1.0 });
  const link = document.createElement('a');
  link.download = 'SNElectric_MEP_Plan.png';
  link.href = dataURL;
  link.click();
};

window.exportTXTReport = function() {
  if (!canvas) return;
  let report = `=====================================\n`;
  report += `   S⚡N ELECTRIC MEP REPORT v4.0     \n`;
  report += `=====================================\n\n`;
  report += `تاريخ التقرير: ${new Date().toLocaleString('ar-EG')}\n`;
  report += `الحمل الكهربائي: ${EngineState.simulationMetrics.totalCurrentA} A (${EngineState.simulationMetrics.totalPowerKW} kW)\n`;
  report += `ضغط السباكة: ${EngineState.simulationMetrics.waterPressureBar} Bar\n\n`;
  report += `--- قائمة الحصر والمكونات ---\n`;

  const counts = {};
  canvas.getObjects().forEach(obj => {
    if (obj.isGridLine) return;
    const name = obj.nameTag || obj.mepName || 'عنصر هندسي';
    counts[name] = (counts[name] || 0) + 1;
  });

  Object.keys(counts).forEach(key => {
    report += `- ${key}: ${counts[key]} قطعة\n`;
  });

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.download = 'MEP_Inventory_Report.txt';
  link.href = URL.createObjectURL(blob);
  link.click();
};

// --- 11. Utility Functions & UI Callbacks ---
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebarMenu');
  if (sidebar) {
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('collapsed');
  }
};

window.togglePopup = function(popupId, event) {
  if (event) event.stopPropagation();
  const targetPopup = document.getElementById(popupId);
  if (!targetPopup) return;
  const isOpen = targetPopup.classList.contains('active');
  
  closeAllPopups();
  if (!isOpen) {
    targetPopup.classList.add('active');
  }
};

window.closeAllPopups = function() {
  document.querySelectorAll('.popup-window').forEach(p => p.classList.remove('active'));
};

window.toggleSnap = function() {
  EngineState.snapToGrid = !EngineState.snapToGrid;
  const btn = document.getElementById('snapToggleBtn');
  const stat = document.getElementById('statSnap');

  if (btn) {
    btn.innerText = EngineState.snapToGrid ? '🧲 الانجذاب: مفعل' : '🧲 الانجذاب: معطل';
    if (EngineState.snapToGrid) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  if (stat) stat.innerText = EngineState.snapToGrid ? 'نشط' : 'غير نشط';
  drawGrid();
};

window.updateScaleSettings = function() {
  const scaleInput = document.getElementById('scaleInput');
  const gridInput = document.getElementById('gridInput');
  EngineState.scaleMm = parseFloat(scaleInput ? scaleInput.value : 10) || 10;
  EngineState.gridStepMm = parseFloat(gridInput ? gridInput.value : 100) || 100;
  drawGrid();
};

window.updateSelectedObjectColor = function(type, colorValue) {
  if (!canvas) return;
  EngineState.selectedColor[type] = colorValue;
  const activeObjects = canvas.getActiveObjects();
  if (activeObjects.length === 0) return;

  activeObjects.forEach(obj => {
    if (obj.type === 'group') {
      obj.forEachObject(child => {
        if (type === 'stroke' && child.stroke) child.set('stroke', colorValue);
        if (type === 'fill' && child.fill && child.type !== 'text' && !child.is2DMask) child.set('fill', colorValue);
      });
    } else {
      if (type === 'stroke') obj.set('stroke', colorValue);
      if (type === 'fill' && !obj.is2DMask) obj.set('fill', colorValue);
    }
  });

  canvas.requestRenderAll();
  saveCanvasState();
};

window.addFreeText = function() {
  const input = document.getElementById('freeTextInput');
  if (!input || !input.value.trim()) return;

  const center = canvas.getVpCenter();
  const text = new fabric.Text(input.value.trim(), {
    left: center.x, top: center.y, fontSize: 18, fill: EngineState.selectedColor.stroke, fontFamily: 'Segoe UI', originX: 'center', originY: 'center'
  });

  text.nameTag = input.value.trim();
  canvas.add(text);
  canvas.bringToFront(text);
  text.setCoords();
  canvas.setActiveObject(text);

  input.value = '';
  saveCanvasState();
  canvas.requestRenderAll();
};

function saveCanvasState() {
  if (!canvas) return;
  if (EngineState.historyStack.length > 20) EngineState.historyStack.shift();
  EngineState.historyStack.push(JSON.stringify(canvas.toJSON([
    'mepType', 'mepName', 'nameTag', 'symbolType', 'roomWallHeight', 
    'roomWidth', 'roomHeight', 'isLine', 'lineLengthMm', 'doorWidth', 
    'isOn', 'isOpen', 'flowActive', 'loadCurrent', 'isPanel'
  ])));
}

window.undoLastAction = function() {
  if (EngineState.historyStack.length > 1) {
    EngineState.historyStack.pop();
    const prevState = EngineState.historyStack[EngineState.historyStack.length - 1];
    canvas.loadFromJSON(prevState, () => {
      canvas.renderAll();
      drawGrid();
      updateSimulationEngine();
    });
  }
};

function handleResize() {
  const container = document.getElementById('canvas2DContainer');
  if (!container || !canvas) return;

  canvas.setWidth(container.clientWidth);
  canvas.setHeight(container.clientHeight);
  drawGrid();

  if (renderer && camera) {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
}

function setupEventListeners() {
  window.addEventListener('click', closeAllPopups);
}

// --- 12. WebAssembly & C++ Calculation Engine Bridge ---
let wasmCalculateVoltageDrop = null;

if (typeof Module !== 'undefined') {
  Module['onRuntimeInitialized'] = function() {
    if (typeof Module.cwrap === 'function') {
      wasmCalculateVoltageDrop = Module.cwrap('calculate_voltage_drop', 'number', ['number', 'number', 'number', 'number']);
      console.log("✅ تم ربط محرك C++ (WebAssembly) بنجاح مع script.js");
    }
  };
}

window.calculateVoltageDropBridge = function(current, length, resistance, voltage) {
  if (typeof wasmCalculateVoltageDrop === 'function') {
    return wasmCalculateVoltageDrop(current, length, resistance, voltage);
  } 
  
  if (typeof Module !== 'undefined' && typeof Module._calculate_voltage_drop === 'function') {
    return Module._calculate_voltage_drop(current, length, resistance, voltage);
  }

  console.warn("⚠️ محرك C++ غير جاهز بعد، تم استخدام الحساب الاحتياطي بـ JS.");
  if (voltage <= 0) return 0;
  return ((2 * current * length * (resistance / 1000)) / voltage) * 100;
};
