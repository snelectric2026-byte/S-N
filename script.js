/* ==========================================================================
   SNelectric MEP Engine - UI & Application Logic (script.js) - v3.6 FIXED
   ظٹط¹ظ…ظ„ ظ…ط¹ mep_engine.js + fabric.js + three.js
   ========================================================================== */

(function () {
  'use strict';

  let canvas = null;              // fabric canvas
  let scaleMMperPX = 10;          // 1px = 10mm
  let gridStepMM = 100;
  let gridColor = '#334155';
  let snapEnabled = true;
  let undoStack = [];
  let redoStack = [];
  let isRestoring = false;
  let wallMode = false;
  let wallStart = null;
  let tempWall = null;
  let pendingRoomName = 'ط؛ط±ظپط©';
  let targetObject = null;

  /* ---------------------- ط¥ط®ظپط§ط، ط´ط§ط´ط© ط§ظ„ط¨ط¯ط§ظٹط© ---------------------- */
  function hideSplash() {
    const s = document.getElementById('splash-screen');
    if (s) s.classList.add('splash-hidden');
  }
  window.addEventListener('load', () => setTimeout(hideSplash, 2200));
  setTimeout(hideSplash, 6000); // ط£ظ…ط§ظ†: ظ„ط§ طھط¹ظ„ظ‚ ط§ظ„ط´ط§ط´ط© ط£ط¨ط¯ط§ظ‹

  /* ---------------------- ط¨ط¯ط، ط§ظ„طھط·ط¨ظٹظ‚ ---------------------- */
  document.addEventListener('DOMContentLoaded', initApp);

  function initApp() {
    initCanvas();
    initToolBarListeners();
    initGlobalKeys();
    updateBottomStatusBar();
    setSysStatus('ط¬ط§ظ‡ط² ًںں¢', '#22c55e');
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
      setText('statX', Math.round(p.x * scaleMMperPX));
      setText('statY', Math.round(p.y * scaleMMperPX));
      if (wallMode && wallStart && tempWall) {
        const q = snapPoint(p);
        tempWall.set({ x2: q.x, y2: q.y });
        canvas.requestRenderAll();
      }
    });

    canvas.on('mouse:down', (opt) => {
      if (!wallMode) return;
      const p = snapPoint(canvas.getPointer(opt.e));
      if (!wallStart) {
        wallStart = p;
        tempWall = new fabric.Line([p.x, p.y, p.x, p.y], {
          stroke: '#94a3b8', strokeWidth: 6, selectable: true, snElement: true
        });
        canvas.add(tempWall);
      } else {
        tempWall.set({ x2: p.x, y2: p.y });
        tempWall.setCoords();
        const len = Math.hypot(p.x - wallStart.x, p.y - wallStart.y) * scaleMMperPX / 1000;
        if (window.mepEngine) {
          window.mepEngine.addElement('wall', 'ط¬ط¯ط§ط±', wallStart.x, wallStart.y, {
            width: Math.abs(p.x - wallStart.x) || 6,
            height: Math.abs(p.y - wallStart.y) || 6,
            label: 'ط¬ط¯ط§ط± ' + len.toFixed(2) + ' ظ…'
          });
        }
        wallStart = null; tempWall = null;
        pushUndo();
        updateBottomStatusBar();
        showToast('طھظ… ط±ط³ظ… ط§ظ„ط¬ط¯ط§ط± âœ…');
      }
    });

    canvas.on('selection:created', onSelect);
    canvas.on('selection:updated', onSelect);
    canvas.on('selection:cleared', () => { setText('statW', 0); setText('statH', 0); });
    canvas.on('object:modified', () => { pushUndo(); onSelect(); });

    drawGrid();
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
    const w = canvas.getWidth(), h = canvas.getHeight();
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

  /* ---------------------- ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط¬ط§ظ†ط¨ظٹط© ظˆط§ظ„ظ‚ظˆط§ط¦ظ… ط§ظ„ظ…ظ†ط³ط¯ظ„ط© ---------------------- */
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

  /* ---------------------- ط¥ط¶ط§ظپط© ط¹ظ†ط§طµط± ظ…ظ† ط§ظ„ظƒطھط§ظ„ظˆط¬ ---------------------- */
  const PRESETS = {
    architectural: { w: 120, h: 90, fill: 'rgba(0,242,254,0.08)', stroke: '#00f2fe' },
    carpentry:     { w: 60,  h: 20, fill: 'rgba(245,184,19,0.15)', stroke: '#f5b813' },
    electrical:    { w: 34,  h: 34, fill: 'rgba(255,51,68,0.15)',  stroke: '#ff3344', load: 15 },
    power:         { w: 44,  h: 44, fill: 'rgba(255,51,68,0.2)',   stroke: '#ff3344', load: 20 },
    plumbing:      { w: 50,  h: 40, fill: 'rgba(56,189,248,0.15)', stroke: '#38bdf8', pressure: 2.5 },
    ac:            { w: 60,  h: 30, fill: 'rgba(34,197,94,0.15)',  stroke: '#22c55e', load: 25 },
    furniture:     { w: 70,  h: 50, fill: 'rgba(148,163,184,0.15)',stroke: '#94a3b8' }
  };

  window.addCatalogItem = function (type, subType) {
    if (type === 'architectural') { openRoomModal(subType); return; }
    createShape(type, subType);
  };

  function createShape(type, subType, opts) {
    if (!canvas) return;
    const p = Object.assign({}, PRESETS[type] || PRESETS.furniture, opts || {});
    const custom = (document.getElementById('shapeLabelInput') || {}).value;
    const label = (custom && custom.trim()) ? custom.trim() : subType;
    const hideLabel = (document.getElementById('hideShapeLabelCheckbox') || {}).checked;

    const start = snapPoint({ x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 });
    const rect = new fabric.Rect({
      width: p.w, height: p.h, fill: p.fill, stroke: p.stroke,
      strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center'
    });
    const parts = [rect];
    if (!hideLabel) {
      parts.push(new fabric.Text(label, {
        fontSize: 11, fill: p.stroke, fontFamily: 'Tahoma',
        originX: 'center', originY: 'center', top: p.h / 2 + 10
      }));
    }
    const group = new fabric.Group(parts, {
      left: start.x, top: start.y, originX: 'center', originY: 'center',
      snElement: true, snType: type, snLabel: label
    });
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    if (window.mepEngine) {
      const e = window.mepEngine.addElement(type, subType, start.x, start.y, {
        width: p.w, height: p.h, label: label,
        load: p.load || 0, pressure: p.pressure || 0
      });
      group.snId = e.id;
    }
    pushUndo();
    updateBottomStatusBar();
    showToast('طھظ… ط¥ط¯ط±ط§ط¬: ' + label);
  }

  window.addFreeText = function () {
    if (!canvas) return;
    const txt = prompt('ط£ط¯ط®ظ„ ط§ظ„ظ†طµ ط§ظ„ط­ط±:', 'ظ…ظ„ط§ط­ط¸ط©');
    if (!txt) return;
    const t = new fabric.IText(txt, {
      left: canvas.getWidth() / 2, top: canvas.getHeight() / 2,
      fontSize: 18, fill: '#00f2fe', fontFamily: 'Tahoma', snElement: true
    });
    canvas.add(t); canvas.setActiveObject(t); canvas.requestRenderAll();
    pushUndo();
  };

  /* ---------------------- ط§ظ„ط¬ط¯ط±ط§ظ† ---------------------- */
  window.startDrawingWall = function () {
    wallMode = !wallMode;
    wallStart = null; tempWall = null;
    setSysStatus(wallMode ? 'ظˆط¶ط¹ ط±ط³ظ… ط§ظ„ط¬ط¯ط±ط§ظ† âœڈï¸ڈ' : 'ط¬ط§ظ‡ط² ًںں¢', wallMode ? '#f5b813' : '#22c55e');
    showToast(wallMode ? 'ط§ط¶ط؛ط· ظ†ظ‚ط·ط© ط§ظ„ط¨ط¯ط§ظٹط© ط«ظ… ظ†ظ‚ط·ط© ط§ظ„ظ†ظ‡ط§ظٹط©' : 'طھظ… ط¥ظٹظ‚ط§ظپ ط±ط³ظ… ط§ظ„ط¬ط¯ط±ط§ظ†');
  };

  /* ---------------------- ظ†ط§ظپط°ط© ط£ط¨ط¹ط§ط¯ ط§ظ„ط؛ط±ظپط© ---------------------- */
  function openRoomModal(name) {
    pendingRoomName = name || 'ط؛ط±ظپط©';
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
    const wPx = (wCm * 10) / scaleMMperPX;
    const hPx = (lCm * 10) / scaleMMperPX;
    window.closeRoomModal();
    createShape('architectural', pendingRoomName, { w: wPx, h: hPx });
  };

  /* ---------------------- ظ†ط§ظپط°ط© ط£ط¨ط¹ط§ط¯ ط§ظ„ط¹ظ†طµط± (T) ---------------------- */
  function openObjectDimModal() {
    const o = canvas && canvas.getActiveObject();
    if (!o) { showToast('ط§ط®طھط± ط¹ظ†طµط±ط§ظ‹ ط£ظˆظ„ط§ظ‹'); return; }
    targetObject = o;
    setText('targetObjectName', o.snLabel || 'ط¹ظ†طµط±');
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

  /* ---------------------- ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ ---------------------- */
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

  /* ---------------------- طھط±ط§ط¬ط¹ / ط¥ط¹ط§ط¯ط© ---------------------- */
  function pushUndo() {
    if (!canvas || isRestoring) return;
    undoStack.push(JSON.stringify(canvas.toJSON(['snElement', 'snType', 'snLabel', 'snId'])));
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
    if (undoStack.length < 2) { showToast('ظ„ط§ ظٹظˆط¬ط¯ ظ…ط§ ظٹظ…ظƒظ† ط§ظ„طھط±ط§ط¬ط¹ ط¹ظ†ظ‡'); return; }
    redoStack.push(undoStack.pop());
    restore(undoStack[undoStack.length - 1]);
    showToast('â†©ï¸ڈ طھظ… ط§ظ„طھط±ط§ط¬ط¹');
  };

  window.redoLastAction = function () {
    if (!redoStack.length) { showToast('ظ„ط§ ظٹظˆط¬ط¯ ط¥ط¬ط±ط§ط، ظ„ط§ط­ظ‚'); return; }
    const j = redoStack.pop();
    undoStack.push(j);
    restore(j);
    showToast('â†ھï¸ڈ طھظ…طھ ط§ظ„ط¥ط¹ط§ط¯ط©');
  };

  /* ---------------------- ط§ظ„طھطµط¯ظٹط± ---------------------- */
  window.exportPNG = function () {
    if (!canvas) return;
    const url = canvas.toDataURL({ format: 'png', multiplier: 2, backgroundColor: '#020617' });
    downloadFile(url, 'SNelectric-plan.png');
    showToast('ًں–¼ï¸ڈ طھظ… طھطµط¯ظٹط± ط§ظ„طµظˆط±ط©');
  };

  window.exportTXTReport = function () {
    const eng = window.mepEngine;
    let t = 'طھظ‚ط±ظٹط± ظ…ط´ط±ظˆط¹ SNelectric MEP\n============================\n\n';
    if (eng) {
      const boq = eng.generateBOQ ? eng.generateBOQ() : null;
      t += 'ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط¹ظ†ط§طµط±: ' + eng.elements.length + '\n';
      t += 'ط§ظ„ط­ظ…ظ„ ط§ظ„ظƒظ‡ط±ط¨ط§ط¦ظٹ ط§ظ„ظƒظ„ظٹ: ' + eng.totalLoad + ' A\n';
      t += 'ط¶ط؛ط· ط§ظ„ط³ط¨ط§ظƒط© ط§ظ„ظƒظ„ظٹ: ' + eng.totalPressure + ' Bar\n\n';
      if (boq) {
        t += 'ط­طµط± ط§ظ„ظƒظ…ظٹط§طھ (BOQ):\n';
        Object.keys(boq).forEach(k => { t += ' - ' + k + ': ' + boq[k] + '\n'; });
        t += '\n';
      }
      t += 'ظ‚ط§ط¦ظ…ط© ط§ظ„ط¹ظ†ط§طµط±:\n';
      eng.elements.forEach((el, i) => {
        t += (i + 1) + '. ' + (el.label || el.subType) + ' [' + el.type + '] X:' + Math.round(el.x) + ' Y:' + Math.round(el.y) + '\n';
      });
    }
    const blob = new Blob([t], { type: 'text/plain;charset=utf-8' });
    downloadFile(URL.createObjectURL(blob), 'SNelectric-report.txt');
    showToast('ًں“„ طھظ… طھطµط¯ظٹط± ط§ظ„طھظ‚ط±ظٹط±');
  };

  function downloadFile(href, name) {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------------- ط¹ط±ط¶ 2D / 3D ---------------------- */
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
      camera.position.set(300, 300, 400);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(cont.clientWidth, cont.clientHeight);
      cont.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const dir = new THREE.DirectionalLight(0x00f2fe, 0.8);
      dir.position.set(200, 400, 200); scene.add(dir);
      scene.add(new THREE.GridHelper(1000, 40, 0x00f2fe, 0x1e293b));

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

    // ط¥ط¹ط§ط¯ط© ط¨ظ†ط§ط، ط§ظ„ظ…ط¬ط³ظ…ط§طھ ظ…ظ† ط§ظ„ط¹ظ†ط§طµط±
    while (three.group.children.length) three.group.remove(three.group.children[0]);
    const eng = window.mepEngine;
    if (!eng) return;
    eng.elements.forEach(el => {
      const h = el.type === 'wall' || el.type === 'architectural' ? 120 : 30;
      const geo = new THREE.BoxGeometry(el.width || 40, h, el.height || 40);
      const color = el.type === 'electrical' ? 0xff3344
        : el.type === 'plumbing' ? 0x38bdf8
        : el.type === 'furniture' ? 0x94a3b8 : 0x00f2fe;
      const mat = new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((el.x || 0) - 250, h / 2, (el.y || 0) - 250);
      three.group.add(mesh);
    });
    three.renderer.setSize(cont.clientWidth, cont.clientHeight);
  }

  function setActiveBtn(id) {
    ['btnView2D', 'btnView3D'].forEach(b => {
      const el = document.getElementById(b);
      if (el) el.classList.toggle('active', b === id);
    });
  }

  /* ---------------------- ط§ظ„ط£ط¯ظˆط§طھ ط§ظ„ظ‡ظ†ط¯ط³ظٹط© ---------------------- */
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
    if (!errors.length) { alert('âœ… ط§ظ„ظ…ط®ط·ط· ط³ظ„ظٹظ… ظ‡ظ†ط¯ط³ظٹط§ظ‹: ظ„ط§ طھظˆط¬ط¯ ط£ط®ط·ط§ط، ط£ظˆ طھط¹ط§ط±ط¶ط§طھ ط¸ط§ظ‡ط±ط©.'); return; }
    let t = 'âڑ ï¸ڈ طھظ‚ط±ظٹط± ط§ظ„طھط¯ظ‚ظٹظ‚ ط§ظ„ظ‡ظ†ط¯ط³ظٹ:\n\n';
    errors.forEach((e, i) => { t += (i + 1) + '. [' + e.type.toUpperCase() + '] ' + e.message + '\n'; });
    alert(t);
  }
  window.runSmartValidationReport = runSmartValidationReport;

  function showBOQReport() {
    if (!window.mepEngine || !window.mepEngine.generateBOQ) return;
    const boq = window.mepEngine.generateBOQ();
    let m = 'ًں“ٹ ط­طµط± ط§ظ„ظƒظ…ظٹط§طھ ط§ظ„ط¢ظ„ظٹ (BOQ):\n\n';
    Object.keys(boq).forEach(k => { m += '- ' + k + ': ' + boq[k] + '\n'; });
    alert(m);
  }
  window.showBOQReport = showBOQReport;

  function openCableCalculator() {
    const a = prompt('ط£ط¯ط®ظ„ ط§ظ„طھظٹط§ط± (ط£ظ…ط¨ظٹط±):', '16'); if (!a) return;
    const l = prompt('ط£ط¯ط®ظ„ ط·ظˆظ„ ط§ظ„ط®ط· (ظ…طھط±):', '20'); if (!l) return;
    const r = window.mepEngine.calculateCableSize(parseFloat(a), parseFloat(l));
    alert('âڑ، ط­ط³ط§ط¨ ط§ظ„ظƒط§ط¨ظ„ط§طھ:\n\n- ط§ظ„طھظٹط§ط±: ' + r.amps + ' A\n- ط§ظ„ط·ظˆظ„: ' + r.length + ' ظ…\n- ط§ظ„ظ…ظ‚ط·ط¹ ط§ظ„ظ…ظˆطµظ‰ ط¨ظ‡: ' + r.sectionMM2 + ' ظ…ظ…آ²\n- ط§ظ„ظ‡ط¨ظˆط·: ' + r.voltageDropVolts + ' V\n- ط§ظ„طھظ‚ظٹظٹظ…: ' + r.evaluation);
  }
  window.openCableCalculator = openCableCalculator;

  /* ---------------------- ط§ط®طھطµط§ط±ط§طھ ظ„ظˆط­ط© ط§ظ„ظ…ظپط§طھظٹط­ ---------------------- */
  function initGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (window.mepEngine) window.mepEngine.saveToLocalStorage();
        showToast('ًں’¾ طھظ… ط­ظپط¸ ط§ظ„ظ…ط´ط±ظˆط¹ ظ…ط­ظ„ظٹط§ظ‹');
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); window.undoLastAction(); }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); window.redoLastAction(); }
      if (e.key === 'F1') { e.preventDefault(); runSmartValidationReport(); }
      if (e.key.toLowerCase() === 't') { openObjectDimModal(); }
      if (e.key === 'Escape') {
        wallMode = false; wallStart = null;
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        document.querySelectorAll('.popup-window').forEach(p => p.classList.remove('active'));
        setSysStatus('ط¬ط§ظ‡ط² ًںں¢', '#22c55e');
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && canvas) {
        const o = canvas.getActiveObject();
        if (o) {
          if (o.snId && window.mepEngine) window.mepEngine.removeElement(o.snId);
          canvas.remove(o); canvas.discardActiveObject(); canvas.requestRenderAll();
          pushUndo(); updateBottomStatusBar();
        }
      }
    });
  }

  /* ---------------------- ط£ط¯ظˆط§طھ ظ…ط³ط§ط¹ط¯ط© ---------------------- */
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

  // ط¥ط؛ظ„ط§ظ‚ ط§ظ„ظ‚ظˆط§ط¦ظ… ط§ظ„ظ…ظ†ط¨ط«ظ‚ط© ط¹ظ†ط¯ ط§ظ„ط¶ط؛ط· ط®ط§ط±ط¬ظ‡ط§
  document.addEventListener('click', (e) => {
    if (e.target.closest('.category-item')) return;
    document.querySelectorAll('.popup-window').forEach(p => p.classList.remove('active'));
  });
})();
