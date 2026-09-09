/* ==========================================================================
   SNelectric MEP Engine - UI & Application Logic (script.js) - v3.96 FIXED MASTER
   ========================================================================== */

(function () {
  'use strict';

  let canvas = null;
  let scaleMMperPX = 10;
  let gridStepMM = 100;
  let gridColor = '#334155';
  let snapEnabled = true;
  let undoStack = [];
  let redoStack = [];
  let isRestoring = false;
  let wallMode = false;
  let wallStart = null;
  let tempWall = null;
  let pendingRoomName = 'غرفة';
  let targetObject = null;

  /* ---------------------- إخفاء شاشة البداية ---------------------- */
  function hideSplash() {
    const s = document.getElementById('splash-screen');
    if (s) s.classList.add('splash-hidden');
  }
  window.addEventListener('load', () => setTimeout(hideSplash, 2200));
  setTimeout(hideSplash, 6000);

  /* ---------------------- بدء التطبيق ---------------------- */
  document.addEventListener('DOMContentLoaded', initApp);

  function initApp() {
    initCanvas();
    initToolBarListeners();
    initGlobalKeys();
    updateBottomStatusBar();
    setSysStatus('جاهز 🟢', '#22c55e');
  }

  /* ---------------------- Canvas 2D ---------------------- */
  function initCanvas() {
    const el = document.getElementById('mepCanvas');
    if (!el || typeof fabric === 'undefined') return;

    const wrap = document.getElementById('canvas2DContainer');
    canvas = new fabric.Canvas('mepCanvas', {
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selection: true
    });
    window.mepCanvas = canvas;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    canvas.on('mouse:move', (opt) => {
      const p = canvas.getPointer(opt.e);
      const snapped = snapPoint(p);
      setText('statX', Math.round(snapped.x * scaleMMperPX));
      setText('statY', Math.round(snapped.y * scaleMMperPX));
      
      if (wallMode && wallStart && tempWall) {
        tempWall.set({ x2: snapped.x, y2: snapped.y });
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:down', (opt) => {
      if (!wallMode) return;
      const p = snapPoint(canvas.getPointer(opt.e));
      if (!wallStart) {
        wallStart = p;
        tempWall = new fabric.Line([p.x, p.y, p.x, p.y], {
          stroke: '#f5b813', strokeWidth: 8, selectable: false
        });
        canvas.add(tempWall);
      } else {
        tempWall.set({ x2: p.x, y2: p.y });
        const lenM = Math.hypot(p.x - wallStart.x, p.y - wallStart.y) * scaleMMperPX / 1000;
        canvas.remove(tempWall);
        
        if (window.mepEngine) {
          window.mepEngine.addElement('wall', 'جدار', wallStart.x, wallStart.y, {
            width: Math.abs(p.x - wallStart.x) || 100,
            height: Math.abs(p.y - wallStart.y) || 14,
            label: 'جدار (' + lenM.toFixed(1) + 'م)',
            wallHeight: 280
          });
        }
        wallStart = null; tempWall = null;
        wallMode = false;
        pushUndo();
        updateBottomStatusBar();
        showToast('تم رسم الجدار بنجاح ✅');
      }
    });

    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', () => { setText('statW', 0); setText('statH', 0); });
    canvas.on('object:modified', (opt) => {
      if (opt.target) {
        syncObjectDataToEngine(opt.target);
      }
      pushUndo(); 
      onSelect(); 
    });

    drawGrid();
    
    // التحقق من وجود بيانات محفوظة محلياً لتحميلها بشكل صحيح بدون تداخل
    if (window.mepEngine && typeof window.mepEngine.loadFromLocalStorage === 'function') {
      window.mepEngine.loadFromLocalStorage();
    }
    
    pushUndo();
  }

  function resizeCanvas() {
    if (!canvas) return;
    const wrap = document.getElementById('canvas2DContainer');
    if (!wrap) return;
    canvas.setWidth(wrap.clientWidth);
    canvas.setHeight(wrap.clientHeight);
    drawGrid();
    canvas.requestRenderAll();
  }

  function drawGrid() {
    if (!canvas) return;
    const step = Math.max(6, gridStepMM / scaleMMperPX);
    const c = document.createElement('canvas');
    c.width = step; c.height = step;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(step - 0.5, 0); ctx.lineTo(step - 0.5, step);
    ctx.moveTo(0, step - 0.5); ctx.lineTo(step, step - 0.5);
    ctx.stroke();
    const wrap = document.getElementById('canvas2DContainer');
    if (wrap) {
      wrap.style.backgroundImage = 'url(' + c.toDataURL() + ')';
      wrap.style.backgroundRepeat = 'repeat';
    }
  }

  function snapPoint(p) {
    if (!snapEnabled) return { x: p.x, y: p.y };
    const step = Math.max(6, gridStepMM / scaleMMperPX);
    return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
  }

  function onSelect() {
    const o = canvas && canvas.getActiveObject();
    if (!o) return;
    setText('statW', Math.round(o.getScaledWidth() * scaleMMperPX));
    setText('statH', Math.round(o.getScaledHeight() * scaleMMperPX));
  }

  /* ---------------------- القائمة الجانبية والقوائم المنسدلة ---------------------- */
  window.toggleSidebar = function () {
    const sb = document.getElementById('sidebarMenu');
    if (sb) sb.classList.toggle('collapsed');
  };

  window.togglePopup = function (id, event) {
    if (event) event.stopPropagation();
    const target = document.getElementById(id);
    document.querySelectorAll('.popup-window').forEach(p => {
      if (p !== target) p.classList.remove('active');
    });
    if (target) target.classList.toggle('active');
  };

  /* ---------------------- مولد الرموز الهندسية ---------------------- */
  function createArchitecturalSymbol(subType, p) {
    const parts = [];
    if (subType === 'باب' || subType.includes('باب')) {
      const doorWidth = p.w;
      const rect = new fabric.Rect({ width: doorWidth, height: 8, fill: '#334155', stroke: '#00f2fe', strokeWidth: 1, originX: 'left', originY: 'center' });
      const leaf = new fabric.Rect({ width: doorWidth, height: 4, fill: '#00f2fe', originX: 'left', originY: 'center', top: -4 });
      const arc = new fabric.Circle({ radius: doorWidth, startAngle: 0, endAngle: Math.PI / 2, stroke: '#00f2fe', strokeWidth: 1, fill: 'transparent', originX: 'left', originY: 'top' });
      parts.push(rect, leaf, arc);
    } else if (subType === 'شباك' || subType.includes('شباك')) {
      const w = p.w, h = p.h;
      const frame = new fabric.Rect({ width: w, height: h, fill: 'transparent', stroke: '#38bdf8', strokeWidth: 2, originX: 'center', originY: 'center' });
      const glass1 = new fabric.Line([-w/2, 0, w/2, 0], { stroke: '#38bdf8', strokeWidth: 1, originX: 'center', originY: 'center' });
      const glass2 = new fabric.Line([0, -h/2, 0, h/2], { stroke: '#38bdf8', strokeWidth: 1, originX: 'center', originY: 'center' });
      parts.push(frame, glass1, glass2);
    } else {
      parts.push(new fabric.Rect({ width: p.w, height: p.h, fill: p.fill, stroke: p.stroke, strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center' }));
    }
    return parts;
  }

  function createElectricalSymbol(subType, p) {
    const parts = [new fabric.Circle({ radius: p.w/2, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' })];
    if (subType.includes('مفتاح') || subType.includes('ls')) {
      parts.push(new fabric.Text('S', { fontSize: 14, fill: p.stroke, fontFamily: 'Arial', originX: 'center', originY: 'center', fontWeight: 'bold' }));
    } else if (subType.includes('بريزة') || subType.includes('socket')) {
      parts.push(new fabric.Line([-8, 0, 8, 0], { stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' }));
      parts.push(new fabric.Line([0, -6, 0, 6], { stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' }));
    } else if (subType.includes('لوحة') || subType.includes('panel')) {
      parts[0] = new fabric.Rect({ width: p.w, height: p.h, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' });
      parts.push(new fabric.Text('DB', { fontSize: 12, fill: p.stroke, fontFamily: 'Arial', originX: 'center', originY: 'center', fontWeight: 'bold' }));
    } else {
      parts.push(new fabric.Circle({ radius: 4, fill: p.stroke, originX: 'center', originY: 'center' }));
    }
    return parts;
  }

  function createPlumbingSymbol(subType, p) {
    const parts = [];
    if (subType.includes('حوض') || subType.includes('sink')) {
      parts.push(new fabric.Rect({ width: p.w, height: p.h, rx: 8, ry: 8, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' }));
      parts.push(new fabric.Circle({ radius: 8, fill: 'transparent', stroke: p.stroke, strokeWidth: 1.5, originX: 'center', originY: 'center' }));
    } else if (subType.includes('صحي') || subType.includes('wc') || subType.includes('مرحاض')) {
      parts.push(new fabric.Rect({ width: p.w, height: p.h * 0.6, rx: 6, ry: 6, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center', top: 6 }));
      parts.push(new fabric.Circle({ radius: p.w * 0.35, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center', top: -10 }));
    } else {
      parts.push(new fabric.Rect({ width: p.w, height: p.h, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' }));
      parts.push(new fabric.Circle({ radius: 6, fill: p.stroke, originX: 'center', originY: 'center' }));
    }
    return parts;
  }

  function createMechanicalSymbol(subType, p) {
    const parts = [];
    if (subType.includes('تكييف') || subType.includes('ac')) {
      parts.push(new fabric.Rect({ width: p.w, height: p.h, rx: 3, ry: 3, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' }));
      parts.push(new fabric.Text('AC', { fontSize: 12, fill: p.stroke, fontFamily: 'Arial', originX: 'center', originY: 'center', fontWeight: 'bold' }));
    } else {
      parts.push(new fabric.Rect({ width: p.w, height: p.h, fill: p.fill, stroke: p.stroke, strokeWidth: 2, originX: 'center', originY: 'center' }));
    }
    return parts;
  }

  /* ---------------------- الكتالوج وإضافة العناصر ---------------------- */
  const PRESETS = {
    architectural: { w: 120, h: 90, fill: 'rgba(0,242,254,0.08)', stroke: '#00f2fe' },
    carpentry:     { w: 80,  h: 20, fill: 'rgba(245,184,19,0.15)', stroke: '#f5b813' },
    electrical:    { w: 34,  h: 34, fill: 'rgba(255,51,68,0.15)',  stroke: '#ff3344', load: 15 },
    power:         { w: 44,  h: 44, fill: 'rgba(255,51,68,0.2)',   stroke: '#ff3344', load: 20 },
    plumbing:      { w: 50,  h: 40, fill: 'rgba(56,189,248,0.15)', stroke: '#38bdf8', pressure: 2.5 },
    ac:            { w: 60,  h: 30, fill: 'rgba(34,197,94,0.15)',  stroke: '#22c55e', load: 25 },
    furniture:     { w: 70,  h: 50, fill: 'rgba(148,163,184,0.15)',stroke: '#94a3b8' }
  };

  window.addCatalogItem = function (type, subType) {
    if (type === 'architectural' && (subType === 'غرفة' || subType.includes('غرفة'))) { openRoomModal(subType); return; }
    createShape(type, subType);
  };

  function createShape(type, subType, opts) {
    if (!canvas) return;
    const p = Object.assign({}, PRESETS[type] || PRESETS.furniture, opts || {});
    const custom = (document.getElementById('shapeLabelInput') || {}).value;
    const label = (custom && custom.trim()) ? custom.trim() : subType;
    const hideLabel = (document.getElementById('hideShapeLabelCheckbox') || {}).checked;

    const start = snapPoint({ x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 });
    
    let parts = [];
    if (type === 'architectural' || type === 'carpentry') {
      parts = createArchitecturalSymbol(subType, p);
    } else if (type === 'electrical' || type === 'power') {
      parts = createElectricalSymbol(subType, p);
    } else if (type === 'plumbing') {
      parts = createPlumbingSymbol(subType, p);
    } else if (type === 'ac') {
      parts = createMechanicalSymbol(subType, p);
    } else {
      parts = [new fabric.Rect({ width: p.w, height: p.h, fill: p.fill, stroke: p.stroke, strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center' })];
    }

    if (!hideLabel && subType !== 'باب') {
      parts.push(new fabric.Text(label, {
        fontSize: 11, fill: p.stroke, fontFamily: 'Tahoma',
        originX: 'center', originY: 'center', top: p.h / 2 + 10
      }));
    }

    const group = new fabric.Group(parts, {
      left: start.x, top: start.y, originX: 'center', originY: 'center',
      snElement: true, snType: type === 'carpentry' ? 'door' : type, snSubtype: subType, snLabel: label,
      customHeight: p.wallHeight || 280
    });
    
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    if (window.mepEngine) {
      const e = window.mepEngine.addElement(type, subType, start.x, start.y, {
        width: p.w, height: p.h, label: label,
        load: p.load || 0, pressure: p.pressure || 0, wallHeight: p.wallHeight || 280
      });
      group.snId = e.id;
    }
    pushUndo();
    updateBottomStatusBar();
    showToast('تم إدراج: ' + label);
  }

  function syncObjectDataToEngine(obj) {
    if (!obj || !obj.snId || !window.mepEngine) return;
    window.mepEngine.updateElement(obj.snId, {
      left: obj.left,
      top: obj.top,
      width: obj.getScaledWidth(),
      height: obj.getScaledHeight()
    });
    updateBottomStatusBar();
  }

  window.duplicateActiveObject = function() {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || !active.snId) { showToast('اختر عنصراً لنسخه'); return; }
    if (window.mepEngine) {
      window.mepEngine.duplicateElement(active.snId);
      pushUndo();
      updateBottomStatusBar();
      showToast('📋 تم نسخ العنصر');
    }
  };

  window.deleteActiveObject = function() {
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (!active || !active.snId) { showToast('اختر عنصراً لحذفه'); return; }
    window.mepEngine.removeElement(active.snId);
    canvas.remove(active);
    canvas.requestRenderAll();
    pushUndo();
    updateBottomStatusBar();
    showToast('🗑️ تم الحذف');
  };

  window.addFreeText = function () {
    if (!canvas) return;
    const txt = prompt('أدخل النص الحر:', 'ملاحظة');
    if (!txt) return;
    const snapped = snapPoint({ x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 });
    const t = new fabric.IText(txt, {
      left: snapped.x, top: snapped.y,
      fontSize: 18, fill: '#00f2fe', fontFamily: 'Tahoma', snElement: true
    });
    canvas.add(t); canvas.setActiveObject(t); canvas.requestRenderAll();
    pushUndo();
  };

  /* ---------------------- الجدران ---------------------- */
  window.startDrawingWall = function () {
    wallMode = !wallMode;
    wallStart = null; tempWall = null;
    setSysStatus(wallMode ? 'وضع رسم الجدران ✍️' : 'جاهز 🟢', wallMode ? '#f5b813' : '#22c55e');
    showToast(wallMode ? 'اضغط نقطة البداية ثم نقطة النهاية' : 'تم إيقاف رسم الجدران');
  };

  /* ---------------------- نافذة أبعاد الغرفة ---------------------- */
  function openRoomModal(name) {
    pendingRoomName = name || 'غرفة';
    setText('modalRoomName', pendingRoomName);
    const m = document.getElementById('roomDimensionModal');
    if (m) m.classList.remove('hidden');
  }
  window.openRoomModal = openRoomModal;

  window.closeRoomModal = function () {
    const m = document.getElementById('roomDimensionModal');
    if (m) m.classList.add('hidden');
  };

  window.confirmRoomDimensions = function () {
    const wCm = parseFloat((document.getElementById('roomWidthInput') || {}).value) || 400;
    const lCm = parseFloat((document.getElementById('roomLengthInput') || {}).value) || 300;
    const hCm = parseFloat((document.getElementById('roomHeightInput') || {}).value) || 280;
    
    const wPx = (wCm * 10) / scaleMMperPX;
    const hPx = (lCm * 10) / scaleMMperPX;
    
    window.closeRoomModal();
    createShape('architectural', pendingRoomName, { w: wPx, h: hPx, wallHeight: hCm });
  };

  /* ---------------------- نافذة أبعاد العنصر (T) ---------------------- */
  function openObjectDimModal() {
    const o = canvas && canvas.getActiveObject();
    if (!o) { showToast('اختر عنصراً أولاً'); return; }
    targetObject = o;
    setText('targetObjectName', o.snLabel || 'عنصر');
    setVal('objWidthInput', Math.round(o.getScaledWidth() * scaleMMperPX));
    setVal('objHeightInput', Math.round(o.getScaledHeight() * scaleMMperPX));
    const m = document.getElementById('objectDimensionModal');
    if (m) m.classList.remove('hidden');
  }
  window.openObjectDimModal = openObjectDimModal;

  window.closeObjectDimModal = function () {
    const m = document.getElementById('objectDimensionModal');
    if (m) m.classList.add('hidden');
  };

  window.applyObjectDimensions = function () {
    if (!targetObject) { window.closeObjectDimModal(); return; }
    const wMM = parseFloat((document.getElementById('objWidthInput') || {}).value);
    const hMM = parseFloat((document.getElementById('objHeightInput') || {}).value);
    if (wMM > 0) targetObject.scaleToWidth(wMM / scaleMMperPX);
    if (hMM > 0) targetObject.scaleToHeight(hMM / scaleMMperPX);
    targetObject.setCoords();
    canvas.requestRenderAll();
    window.closeObjectDimModal();
    pushUndo(); onSelect();
  };

  /* ---------------------- الإعدادات ---------------------- */
  window.updateGridColor = function (color) { gridColor = color; drawGrid(); };

  window.updateScaleSettings = function () {
    scaleMMperPX = parseFloat((document.getElementById('scaleInput') || {}).value) || 10;
    gridStepMM = parseFloat((document.getElementById('gridInput') || {}).value) || 100;
    drawGrid();
  };

  window.toggleSnap = function (on) {
    snapEnabled = !!on;
    if (window.mepEngine) window.mepEngine.snapEnabled = snapEnabled;
  };

  /* ---------------------- تراجع / إعادة (Undo / Redo) ---------------------- */
  function pushUndo() {
    if (!canvas || isRestoring) return;
    undoStack.push(JSON.stringify(canvas.toJSON(['snElement', 'snType', 'snSubtype', 'snLabel', 'snId', 'customHeight'])));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }

  function restore(json) {
    isRestoring = true;
    canvas.loadFromJSON(json, () => {
      canvas.renderAll();
      isRestoring = false;
    });
  }

  window.undoLastAction = function () {
    if (undoStack.length < 2) { showToast('لا يوجد ما يمكن التراجع عنه'); return; }
    redoStack.push(undoStack.pop());
    restore(undoStack[undoStack.length - 1]);
    showToast('↩️ تم التراجع');
  };

  window.redoLastAction = function () {
    if (!redoStack.length) { showToast('لا يوجد إجراء لاحق'); return; }
    const j = redoStack.pop();
    undoStack.push(j);
    restore(j);
    showToast('↪️ تمت الإعادة');
  };

  /* ---------------------- التصدير ---------------------- */
  window.exportPNG = function () {
    if (!canvas) return;
    const url = canvas.toDataURL({ format: 'png', multiplier: 2, backgroundColor: '#020617' });
    downloadFile(url, 'SNelectric-plan.png');
    showToast('🖼️ تم تصدير الصورة');
  };

  window.exportTXTReport = function () {
    const eng = window.mepEngine;
    let t = 'تقرير مشروع SNelectric MEP\n============================\n\n';
    if (eng) {
      const boq = eng.generateBOQ ? eng.generateBOQ() : null;
      t += 'إجمالي العناصر: ' + eng.elements.length + '\n';
      t += 'الحمل الكهربائي الكلي: ' + eng.totalLoad + ' A\n';
      t += 'ضغط السباكة الكلي: ' + eng.totalPressure + ' Bar\n\n';
      if (boq) {
        t += 'حصر الكميات (BOQ):\n';
        Object.keys(boq).forEach(k => { t += ' - ' + k + ': ' + boq[k] + '\n'; });
        t += '\n';
      }
      t += 'قائمة العناصر:\n';
      eng.elements.forEach((el, i) => {
        t += (i + 1) + '. ' + (el.label || el.subType) + ' [' + el.type + '] X:' + Math.round(el.x) + ' Y:' + Math.round(el.y) + '\n';
      });
    }
    const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    downloadFile(URL.createObjectURL(blob), 'SNelectric-report.txt');
    showToast('📄 تم تصدير التقرير');
  };

  function downloadFile(href, name) {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------------- عرض 2D / 3D Sync ---------------------- */
  let three = null;

  window.toggle2DView = function () {
    show('canvas2DContainer', true); show('canvas3DContainer', false);
    setActiveBtn('btnView2D');
    resizeCanvas();
  };

  window.toggle3DView = function () {
    show('canvas2DContainer', false); show('canvas3DContainer', true);
    setActiveBtn('btnView3D');
    build3D();
  };

  function build3D() {
    const cont = document.getElementById('canvas3DContainer');
    if (!cont || typeof THREE === 'undefined') return;

    if (!three) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617);
      const camera = new THREE.PerspectiveCamera(55, cont.clientWidth / cont.clientHeight, 0.1, 5000);
      camera.position.set(0, 400, 500);
      
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(cont.clientWidth, cont.clientHeight);
      cont.appendChild(renderer.domElement);
      
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(300, 600, 300); 
      scene.add(dir);
      
      scene.add(new THREE.GridHelper(1200, 50, 0x00f2fe, 0x1e293b));

      let controls = null;
      if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
      }
      three = { scene, camera, renderer, controls, group: new THREE.Group() };
      scene.add(three.group);

      (function animate() {
        requestAnimationFrame(animate);
        if (three.controls) three.controls.update();
        three.renderer.render(three.scene, three.camera);
      })();

      window.addEventListener('resize', () => {
        if (!three || !cont.clientWidth) return;
        three.camera.aspect = cont.clientWidth / cont.clientHeight;
        three.camera.updateProjectionMatrix();
        three.renderer.setSize(cont.clientWidth, cont.clientHeight);
      });
    }

    while (three.group.children.length) three.group.remove(three.group.children[0]);
    const eng = window.mepEngine;
    if (!eng) return;

    eng.elements.forEach(el => {
      let mesh;
      const posX = (el.x || el.left || 0) - 250;
      const posZ = (el.y || el.top || 0) - 250;
      const w = el.width || 40;
      const d = el.height || 40;
      const hVal = el.wallHeight || 280;

      if (el.type === 'wall') {
        const wallGeo = new THREE.BoxGeometry(w, hVal, d);
        const wallMat = new THREE.MeshLambertMaterial({ color: 0x475569, transparent: true, opacity: 0.9 });
        mesh = new THREE.Mesh(wallGeo, wallMat);
        mesh.position.set(posX, hVal / 2, posZ);

      } else if (el.type === 'architectural' || el.type === 'room') {
        const floorGeo = new THREE.BoxGeometry(w, hVal, d);
        const floorMat = new THREE.MeshLambertMaterial({ color: 0x0f172a, transparent: true, opacity: 0.7 });
        mesh = new THREE.Mesh(floorGeo, floorMat);
        mesh.position.set(posX, hVal / 2, posZ);

      } else {
        const geo = new THREE.BoxGeometry(w, 35, d);
        const mat = new THREE.MeshLambertMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.85 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(posX, 17.5, posZ);
      }

      if (mesh) {
        three.group.add(mesh);
      }
    });

    three.renderer.setSize(cont.clientWidth, cont.clientHeight);
  }

  function setActiveBtn(id) {
    ['btnView2D', 'btnView3D'].forEach(b => {
      const el = document.getElementById(b);
      if (el) el.classList.toggle('active', b === id);
    });
  }

  /* ---------------------- الأدوات الهندسية والتقارير ---------------------- */
  function initToolBarListeners() {
    bind('validate-btn', '.btn-validate', runSmartValidationReport);
    bind('boq-btn', '.btn-boq', showBOQReport);
    bind('cable-calc-btn', '.btn-cable', openCableCalculator);
  }

  function bind(id, sel, fn) {
    const el = document.getElementById(id) || document.querySelector(sel);
    if (el) el.addEventListener('click', fn);
  }

  function runSmartValidationReport() {
    if (!window.mepEngine) return;
    const errors = window.mepEngine.validateSystem();
    if (!errors.length) { alert('✅ المخطط سليم هندسياً: لا توجد أخطاء أو تعارضات ظاهرة.'); return; }
    let t = '⚠️ تقرير التدقيق الهندسي:\n\n';
    errors.forEach((e, i) => { t += (i + 1) + '. [' + e.type.toUpperCase() + '] ' + e.message + '\n'; });
    alert(t);
  }
  window.runSmartValidationReport = runSmartValidationReport;

  function showBOQReport() {
    if (!window.mepEngine || !window.mepEngine.generateBOQ) return;
    const boq = window.mepEngine.generateBOQ();
    let m = '📊 حصر الكميات الآلي (BOQ):\n\n';
    Object.keys(boq).forEach(k => { m += '- ' + k + ': ' + boq[k] + '\n'; });
    alert(m);
  }
  window.showBOQReport = showBOQReport;

  function openCableCalculator() {
    const a = prompt('أدخل التيار (أمبير):', '16'); if (!a) return;
    const l = prompt('أدخل طول الخط (متر):', '20'); if (!l) return;
    const r = window.mepEngine.calculateCableSize(parseFloat(a), parseFloat(l));
    alert('⚡ حساب الكابلات:\n\n- التيار: ' + r.amps + ' A\n- الطول: ' + r.length + ' م\n- المقطع الموصى به: ' + r.sectionMM2 + ' مم²\n- الهبوط: ' + r.voltageDropVolts + ' V\n- التقييم: ' + r.evaluation);
  }
  window.openCableCalculator = openCableCalculator;

  /* ---------------------- اختصارات لوحة المفاتيح ---------------------- */
  function initGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (window.mepEngine) window.mepEngine.saveToLocalStorage();
        showToast('💾 تم حفظ المشروع محلياً');
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); window.undoLastAction(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); window.redoLastAction(); }
      if (e.key === 'F1') { e.preventDefault(); runSmartValidationReport(); }
      if (e.key.toLowerCase() === 't') { openObjectDimModal(); }
      if (e.key === 'Escape') {
        wallMode = false; wallStart = null;
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        document.querySelectorAll('.popup-window').forEach(p => p.classList.remove('active'));
        setSysStatus('جاهز 🟢', '#22c55e');
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && canvas) {
        window.deleteActiveObject();
      }
    });
  }

  /* ---------------------- أدوات مساعدة ---------------------- */
  function updateBottomStatusBar() {
    const eng = window.mepEngine;
    if (!eng) return;
    const kw = (eng.totalLoad * 220 / 1000).toFixed(1);
    setText('total-load-text', eng.totalLoad.toFixed(2) + ' A / ' + kw + ' kW');
    setText('total-pressure-text', eng.totalPressure.toFixed(1) + ' Bar');
  }
  window.updateBottomStatusBar = updateBottomStatusBar;

  function setSysStatus(txt, color) {
    const el = document.getElementById('sys-status-text');
    if (el) { el.innerText = txt; el.style.color = color || '#22c55e'; }
  }

  function setText(id, v) { const e = document.getElementById(id); if (e) e.innerText = v; }
  function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v; }
  function show(id, on) { const e = document.getElementById(id); if (e) e.style.display = on ? 'block' : 'none'; }

  function showToast(message) {
    let toast = document.getElementById('snelectric-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'snelectric-toast';
      toast.style.cssText = 'position:fixed; bottom:90px; right:20px; background:#00f2fe; color:#020617; padding:10px 20px; border-radius:8px; font-weight:bold; z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:opacity .3s; font-family:Tahoma;';
      document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2600);
  }
  window.showToast = showToast;

  document.addEventListener('click', (e) => {
    if (e.target.closest('.category-item')) return;
    document.querySelectorAll('.popup-window').forEach(p => p.classList.remove('active'));
  });
})();
