let currentFont = 'Arial';
let currentBrushType = 'pencil';
let isDeleteSegmentMode = false;
let pendingRoomName = '';
let deferredPrompt = null;
let isPencilActiveBeforeTouch = false;

let undoStack = [];
let redoStack = [];
let isPerformingHistoryAction = false;

let scene3D, camera3D, renderer3D, controls3D;

window.toggleDropdown = function(id) { document.getElementById(id).classList.toggle('show'); };
window.toggleAccordion = function(id) { document.getElementById(id).classList.toggle('show'); };

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('btnInstall').style.display = 'flex';
});

document.getElementById('btnInstall').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('btnInstall').style.display = 'none';
        }
        deferredPrompt = null;
    } else {
        alert('يمكنك تثبيت التطبيق مباشرة من إعدادات المتصفح بالضغط على (إضافة إلى الشاشة الرئيسية / Add to Home screen)');
    }
});

function saveHistory(canvas) {
    if (isPerformingHistoryAction || !canvas) return;
    const json = JSON.stringify(canvas.toJSON(['nameTag', 'symbolType', 'roomDimensions', 'roomData']));
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === json) return;
    undoStack.push(json);
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
    updateInventorySummary(canvas);
}

function updateHistoryButtons() {
    document.getElementById('btnUndo').disabled = undoStack.length <= 1;
    document.getElementById('btnRedo').disabled = redoStack.length === 0;
}

function updateInventorySummary(canvas) {
    const container = document.getElementById('inventoryListContainer');
    const totalCountBadge = document.getElementById('totalItemsCount');
    if (!canvas) return;

    const objects = canvas.getObjects();
    const counts = {};
    let validItemsCount = 0;

    objects.forEach(obj => {
        let name = obj.nameTag;
        if (name && name !== 'العلامة المائية S⚡N electric' && !name.includes('مقاس جدار') && !name.includes('أبعاد:')) {
            counts[name] = (counts[name] || 0) + 1;
            validItemsCount++;
        }
    });

    totalCountBadge.innerText = validItemsCount + ' رمز';

    if (Object.keys(counts).length === 0) {
        container.innerHTML = `<div style="font-size:11px; color:#94a3b8; text-align:center; padding: 8px;">لم يتم إضافة عناصر بعد...</div>`;
        return;
    }

    let html = '';
    for (let [name, count] of Object.entries(counts)) {
        html += `
            <div class="inventory-item">
                <span>${name}</span>
                <span>عدد ${count}</span>
            </div>
        `;
    }
    container.innerHTML = html;
}

window.onclick = function(e) {
    if (!e.target.matches('.menu-item') && !e.target.matches('#fontLabel') && !e.target.matches('#brushLabel')) {
        document.querySelectorAll('.menu-dropdown').forEach(d => d.classList.remove('show'));
    }
};

window.setFont = function(fontName, label) {
    currentFont = fontName;
    document.getElementById('fontLabel').innerText = "الخط: " + label + " ▾";
    const activeObj = window.canvasApp ? window.canvasApp.getActiveObject() : null;
    if (activeObj && activeObj.type === 'i-text') {
        activeObj.set('fontFamily', fontName);
        window.canvasApp.renderAll();
        saveHistory(window.canvasApp);
    }
};

window.setBrush = function(type, label) {
    currentBrushType = type;
    document.getElementById('brushLabel').innerText = "النوع: " + label + " ▾";
    if(window.updateBrushSettings) window.updateBrushSettings();
};

window.openSmartDistributor = function() {
    const canvas = window.canvasApp;
    if (!canvas) return;
    const objects = canvas.getObjects().filter(o => o.nameTag && o.nameTag !== 'العلامة المائية S⚡N electric');
    
    if (objects.length === 0) {
        alert('قم بإضافة رموز كهربائية أولاً لتوزيعها على الدوائر والأحمال!');
        return;
    }

    let lightingCount = 0;
    let socketsCount = 0;
    let powerSocketsCount = 0;
    let acCount = 0;

    objects.forEach(obj => {
        const name = obj.nameTag;
        if (name.includes('لمبه') || name.includes('اسبوت')) lightingCount++;
        else if (name.includes('بريزة احادى')) socketsCount++;
        else if (name.includes('قوى')) powerSocketsCount++;
        else if (name.includes('تكييف')) acCount++;
    });

    const lightCircuits = Math.ceil(lightingCount / 10) || (lightingCount > 0 ? 1 : 0);
    const socketCircuits = Math.ceil(socketsCount / 8) || (socketsCount > 0 ? 1 : 0);
    const powerCircuits = powerSocketsCount;
    const acCircuits = acCount;
    const totalCircuits = lightCircuits + socketCircuits + powerCircuits + acCircuits;

    alert(`⚡ التوزيع الآلي المقترح للدوائر الكهربائية:\n\n` +
          `💡 دوائر الإنارة (10A / 1.5mm²): ${lightCircuits} دائرة (${lightingCount} مخرج)\n` +
          `🔌 دوائر البرايز العادية (16A / 2.5mm²): ${socketCircuits} دائرة (${socketsCount} مخرج)\n` +
          `⚡ دوائر برائز القوى (20A / 4mm²): ${powerCircuits} دائرة\n` +
          `❄️ دوائر التكييفات (25A / 6mm²): ${acCircuits} دائرة\n\n` +
          `📊 إجمالي القواطع الفرعية المطلوبة: ${totalCircuits} قاطع فرعي\n` +
          `🛡️ القاطع الرئيسي المقترح: MCCB 63A + RCCB 30mA للتأريض والتسريب.`);
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('canvasContainer');
    const sidebar = document.getElementById('sidebar');
    const floatingGroup = document.getElementById('floatingActionGroup');
    const floatingDeleteBtn = document.getElementById('floatingDeleteBtn');
    const floatingDuplicateBtn = document.getElementById('floatingDuplicateBtn');
    const elementColorPicker = document.getElementById('elementColorPicker');

    const canvas = new fabric.Canvas('drawCanvas', {
        width: container.clientWidth,
        height: container.clientHeight,
        isDrawingMode: false,
        subTargetDetection: true
    });
    window.canvasApp = canvas;

    let isMultiTouching = false;
    let startDist = 0;
    let startZoom = 1;
    let lastMidX = 0;
    let lastMidY = 0;

    const canvasWrapper = container;

    canvasWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isMultiTouching = true;
            isPencilActiveBeforeTouch = canvas.isDrawingMode;
            
            canvas.isDrawingMode = false;
            canvas.discardActiveObject().renderAll();

            const t1 = e.touches[0];
            const t2 = e.touches[1];

            startDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            startZoom = canvas.getZoom();

            const rect = canvasWrapper.getBoundingClientRect();
            lastMidX = ((t1.clientX + t2.clientX) / 2) - rect.left;
            lastMidY = ((t1.clientY + t2.clientY) / 2) - rect.top;
        }
    }, { passive: false });

    canvasWrapper.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && isMultiTouching) {
            e.preventDefault();

            const t1 = e.touches[0];
            const t2 = e.touches[1];

            const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            if (startDist === 0) return;

            let newZoom = startZoom * (currentDist / startDist);
            if (newZoom > 12) newZoom = 12;
            if (newZoom < 0.2) newZoom = 0.2;

            const rect = canvasWrapper.getBoundingClientRect();
            const currentMidX = ((t1.clientX + t2.clientX) / 2) - rect.left;
            const currentMidY = ((t1.clientY + t2.clientY) / 2) - rect.top;

            canvas.zoomToPoint({ x: currentMidX, y: currentMidY }, newZoom);

            const deltaX = currentMidX - lastMidX;
            const deltaY = currentMidY - lastMidY;

            const vpt = canvas.viewportTransform;
            vpt[4] += deltaX;
            vpt[5] += deltaY;

            canvas.requestRenderAll();

            lastMidX = currentMidX;
            lastMidY = currentMidY;

            updateFloatingButtonGroup();
        }
    }, { passive: false });

    canvasWrapper.addEventListener('touchend', (e) => {
        if (e.touches.length < 2 && isMultiTouching) {
            isMultiTouching = false;
            startDist = 0;

            if (document.getElementById('btnPencil').classList.contains('active')) {
                canvas.isDrawingMode = true;
            }
        }
    });

    canvas.on('mouse:wheel', function(opt) {
        let delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 12) zoom = 12;
        if (zoom < 0.2) zoom = 0.2;
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
        updateFloatingButtonGroup();
    });

    document.getElementById('btnResetZoom').addEventListener('click', () => {
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.setZoom(1);
        canvas.renderAll();
        updateFloatingButtonGroup();
    });

    function addWatermark() {
        const wmGroup = new fabric.Group([
            new fabric.Rect({ left: 0, top: 0, width: 150, height: 28, fill: 'rgba(255, 255, 255, 0.02)', rx: 6, ry: 6, stroke: 'rgba(255,255,255,0.05)', strokeWidth: 1 }),
            new fabric.IText('S', { left: 8, top: 5, fontSize: 14, fontWeight: '900', fill: 'rgba(0,102,255,0.25)', fontFamily: 'Arial' }),
            new fabric.IText('⚡', { left: 22, top: 5, fontSize: 12, fill: 'rgba(255,0,0,0.25)', fontFamily: 'Arial' }),
            new fabric.IText('N', { left: 38, top: 5, fontSize: 14, fontWeight: '900', fill: 'rgba(0,102,255,0.25)', fontFamily: 'Arial' }),
            new fabric.IText(' electric', { left: 54, top: 7, fontSize: 11, fontWeight: '700', fill: 'rgba(255,255,255,0.18)', fontFamily: 'Arial' })
        ], {
            left: canvas.width - 165,
            top: canvas.height - 40,
            selectable: false,
            evented: false,
            opacity: 0.35,
            nameTag: 'العلامة المائية S⚡N electric'
        });
        canvas.add(wmGroup);
    }

    addWatermark();
    saveHistory(canvas);

    document.getElementById('btnUndo').addEventListener('click', () => {
        if (undoStack.length > 1) {
            isPerformingHistoryAction = true;
            const currentState = undoStack.pop();
            redoStack.push(currentState);
            const previousState = undoStack[undoStack.length - 1];
            
            canvas.loadFromJSON(previousState, () => {
                canvas.renderAll();
                setTimeout(() => { isPerformingHistoryAction = false; }, 30);
                updateHistoryButtons();
                updateInventorySummary(canvas);
                floatingGroup.style.display = 'none';
            });
        }
    });

    document.getElementById('btnRedo').addEventListener('click', () => {
        if (redoStack.length > 0) {
            isPerformingHistoryAction = true;
            const nextState = redoStack.pop();
            undoStack.push(nextState);
            
            canvas.loadFromJSON(nextState, () => {
                canvas.renderAll();
                setTimeout(() => { isPerformingHistoryAction = false; }, 30);
                updateHistoryButtons();
                updateInventorySummary(canvas);
                floatingGroup.style.display = 'none';
            });
        }
    });

    canvas.on('object:added', () => saveHistory(canvas));
    canvas.on('object:removed', () => saveHistory(canvas));
    canvas.on('object:modified', () => saveHistory(canvas));
    canvas.on('path:created', () => saveHistory(canvas));

    fabric.Object.prototype.set({
        transparentCorners: false,
        cornerColor: '#00f2fe',
        cornerStrokeColor: '#ffffff',
        borderColor: '#ff007f',
        cornerSize: 12,
        cornerStyle: 'circle'
    });

    window.addEventListener('resize', () => {
        canvas.setWidth(container.clientWidth);
        canvas.setHeight(container.clientHeight);
        canvas.renderAll();
    });

    document.getElementById('btnToggleSidebar').addEventListener('click', () => sidebar.classList.toggle('active'));
    function autoCloseSidebarOnMobile() { if (window.innerWidth <= 768) sidebar.classList.remove('active'); }

    function updateFloatingButtonGroup() {
        const activeObj = canvas.getActiveObject();
        if (activeObj && activeObj.nameTag !== 'العلامة المائية S⚡N electric' && !isDeleteSegmentMode) {
            const bound = activeObj.getBoundingRect();
            floatingGroup.style.display = 'flex';
            
            let targetTop = bound.top - 50;
            if (targetTop < 10) {
                targetTop = bound.top + bound.height + 15;
            }

            floatingGroup.style.left = (bound.left + bound.width / 2) + 'px';
            floatingGroup.style.top = targetTop + 'px';
        } else {
            floatingGroup.style.display = 'none';
        }
    }

    canvas.on('selection:created', updateFloatingButtonGroup);
    canvas.on('selection:updated', updateFloatingButtonGroup);
    canvas.on('selection:cleared', () => floatingGroup.style.display = 'none');
    canvas.on('object:moving', updateFloatingButtonGroup);
    canvas.on('object:scaling', updateFloatingButtonGroup);
    canvas.on('object:rotating', updateFloatingButtonGroup);

    floatingDeleteBtn.addEventListener('click', () => {
        canvas.getActiveObjects().forEach(obj => {
            if (obj.nameTag !== 'العلامة المائية S⚡N electric') canvas.remove(obj);
        });
        canvas.discardActiveObject();
        canvas.renderAll();
        floatingGroup.style.display = 'none';
        updateInventorySummary(canvas);
    });

    floatingDuplicateBtn.addEventListener('click', () => {
        const activeObj = canvas.getActiveObject();
        if (!activeObj || activeObj.nameTag === 'العلامة المائية S⚡N electric') return;

        activeObj.clone((cloned) => {
            canvas.discardActiveObject();
            cloned.set({
                left: activeObj.left + 25,
                top: activeObj.top + 25,
                evented: true,
            });
            if (cloned.type === 'activeSelection') {
                cloned.canvas = canvas;
                cloned.forEachObject((obj) => { canvas.add(obj); });
                cloned.setCoords();
            } else {
                canvas.add(cloned);
            }
            canvas.setActiveObject(cloned);
            canvas.renderAll();
            updateInventorySummary(canvas);
        }, ['nameTag', 'symbolType', 'roomDimensions', 'roomData']);
    });

    elementColorPicker.addEventListener('input', () => {
        const newColor = elementColorPicker.value;
        const activeObj = canvas.getActiveObject();
        if (!activeObj || activeObj.nameTag === 'العلامة المائية S⚡N electric') return;

        if (activeObj.type === 'group') {
            activeObj.forEachObject(subObj => {
                if (subObj.stroke) subObj.set('stroke', newColor);
                if (subObj.fill && subObj.fill !== 'none') subObj.set('fill', newColor);
                if (subObj.type === 'i-text') subObj.set('fill', newColor);
            });
        } else {
            if (activeObj.stroke) activeObj.set('stroke', newColor);
            if (activeObj.fill && activeObj.fill !== 'none') activeObj.set('fill', newColor);
            if (activeObj.type === 'i-text') activeObj.set('fill', newColor);
        }
        canvas.renderAll();
        saveHistory(canvas);
    });

    const colorPicker = document.getElementById('colorPicker');
    const colorCirclePreview = document.getElementById('colorCirclePreview');
    const brushWidth = document.getElementById('brushWidth');
    const btnSelect = document.getElementById('btnSelect');
    const btnDeleteSegment = document.getElementById('btnDeleteSegment');
    const btnPencil = document.getElementById('btnPencil');
    const btnText = document.getElementById('btnText');

    window.updateBrushSettings = function() {
        const color = colorPicker.value;
        const width = parseInt(brushWidth.value, 10);
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = color;
        canvas.freeDrawingBrush.width = width;
        if (currentBrushType === 'highlighter') {
            canvas.freeDrawingBrush.color = color + '66';
            canvas.freeDrawingBrush.width = width * 3;
        } else if (currentBrushType === 'dotted') {
            canvas.freeDrawingBrush.strokeDashArray = [8, 8];
        }
    };

    colorPicker.addEventListener('input', () => {
        const selectedColor = colorPicker.value;
        colorCirclePreview.style.background = selectedColor;
        colorCirclePreview.style.boxShadow = `0 0 10px ${selectedColor}`;
        window.updateBrushSettings();
    });

    function setActiveTool(activeBtn) {
        [btnSelect, btnDeleteSegment, btnPencil, btnText].forEach(b => b.classList.remove('active'));
        activeBtn.classList.add('active');
        isDeleteSegmentMode = (activeBtn === btnDeleteSegment);
    }

    btnSelect.addEventListener('click', () => {
        canvas.isDrawingMode = false;
        setActiveTool(btnSelect);
        autoCloseSidebarOnMobile();
    });

    btnDeleteSegment.addEventListener('click', () => {
        canvas.isDrawingMode = false;
        setActiveTool(btnDeleteSegment);
        autoCloseSidebarOnMobile();
    });

    canvas.on('mouse:down', (options) => {
        if (isDeleteSegmentMode && options.target && options.target.nameTag !== 'العلامة المائية S⚡N electric') {
            const target = options.target;
            canvas.remove(target);
            canvas.discardActiveObject();
            canvas.renderAll();
            saveHistory(canvas);
            updateInventorySummary(canvas);
        }
    });

    btnPencil.addEventListener('click', () => {
        canvas.isDrawingMode = true;
        window.updateBrushSettings();
        setActiveTool(btnPencil);
        autoCloseSidebarOnMobile();
    });

    btnText.addEventListener('click', () => {
        canvas.isDrawingMode = false;
        setActiveTool(btnSelect);
        const text = new fabric.IText('اكتب النص هنا', {
            left: canvas.width / 2 - 40, top: canvas.height / 2 - 15,
            fontFamily: currentFont, fontSize: 20, fill: colorPicker.value, direction: 'rtl',
            nameTag: 'نص توضيحي'
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        autoCloseSidebarOnMobile();
    });

    window.promptAddRoom = function(roomName) {
        pendingRoomName = roomName;
        document.getElementById('roomModalTitle').innerText = '🏠 إدخال أبعاد: ' + roomName;
        document.getElementById('roomInputModal').style.display = 'flex';
        autoCloseSidebarOnMobile();
    };

    window.closeRoomModal = function() {
        document.getElementById('roomInputModal').style.display = 'none';
    };

    window.confirmAddRoom = function() {
        const lengthVal = parseFloat(document.getElementById('inputRoomLength').value) || 4.0;
        const widthVal = parseFloat(document.getElementById('inputRoomWidth').value) || 3.0;
        const heightVal = parseFloat(document.getElementById('inputRoomHeight').value) || 2.8;
        window.closeRoomModal();
        createRoomOnCanvas(pendingRoomName, lengthVal, widthVal, heightVal);
    };

    function createRoomOnCanvas(roomName, length, width, height) {
        canvas.isDrawingMode = false;
        setActiveTool(btnSelect);
        
        const color = colorPicker.value;
        const strokeWidth = parseInt(brushWidth.value, 10) || 4;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        let w = length * 50;
        let h = width * 50;
        let p1 = {x:-w/2, y:-h/2}, p2 = {x:w/2, y:-h/2}, p3 = {x:w/2, y:h/2}, p4 = {x:-w/2, y:h/2};

        let elements = [];
        elements.push(new fabric.Line([p1.x, p1.y, p2.x, p2.y], { stroke: color, strokeWidth: strokeWidth, nameTag: 'جدار علوي' }));
        elements.push(new fabric.Line([p2.x, p2.y, p3.x, p3.y], { stroke: color, strokeWidth: strokeWidth, nameTag: 'جدار أيمن' }));
        elements.push(new fabric.Line([p3.x, p3.y, p4.x, p4.y], { stroke: color, strokeWidth: strokeWidth, nameTag: 'جدار سفلي' }));
        elements.push(new fabric.Line([p4.x, p4.y, p1.x, p1.y], { stroke: color, strokeWidth: strokeWidth, nameTag: 'جدار أيسر' }));

        const area = (length * width).toFixed(1);

        elements.push(new fabric.IText(length + ' م', { left: -20, top: -h/2 - 20, fontSize: 12, fill: color, fontFamily: currentFont, nameTag: 'مقاس جدار' }));
        elements.push(new fabric.IText(width + ' م', { left: w/2 + 8, top: -10, fontSize: 12, fill: color, fontFamily: currentFont, nameTag: 'مقاس جدار' }));

        elements.push(new fabric.IText(`${roomName}\n(${area} م² - ع:${height}م)`, {
            left: -50, top: -15,
            fontFamily: currentFont, fontSize: 14, fill: color, direction: 'rtl', fontWeight: 'bold', textAlign: 'center',
            nameTag: roomName
        }));

        const roomGroup = new fabric.Group(elements, {
            left: centerX - w/2,
            top: centerY - h/2,
            nameTag: roomName,
            roomDimensions: `${length} × ${width} × ${height} متر (${area} م²)`,
            roomData: { length: length, width: width, height: height }
        });

        canvas.add(roomGroup);
        canvas.setActiveObject(roomGroup);
        canvas.renderAll();
    }

    const getSvgData = (color) => ({
        single_sw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="28" stroke="${color}" stroke-width="6" fill="none"/><line x1="50" y1="22" x2="50" y2="0" stroke="${color}" stroke-width="6"/></svg>`,
        double_sw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="28" stroke="${color}" stroke-width="6" fill="none"/><line x1="40" y1="22" x2="40" y2="0" stroke="${color}" stroke-width="6"/><line x1="60" y1="22" x2="60" y2="0" stroke="${color}" stroke-width="6"/></svg>`,
        triple_sw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="28" stroke="${color}" stroke-width="6" fill="none"/><line x1="34" y1="22" x2="34" y2="0" stroke="${color}" stroke-width="5"/><line x1="50" y1="22" x2="50" y2="0" stroke="${color}" stroke-width="5"/><line x1="66" y1="22" x2="66" y2="0" stroke="${color}" stroke-width="5"/></svg>`,
        two_way_sw: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="28" stroke="${color}" stroke-width="6" fill="${color}"/><line x1="50" y1="22" x2="50" y2="0" stroke="${color}" stroke-width="6"/></svg>`,
        single_socket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 20 50 A 30 30 0 0 0 80 50 Z" stroke="${color}" stroke-width="6" fill="none"/><line x1="20" y1="50" x2="80" y2="50" stroke="${color}" stroke-width="6"/><line x1="50" y1="50" x2="50" y2="85" stroke="${color}" stroke-width="6"/></svg>`,
        power_socket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 20 50 A 30 30 0 0 0 80 50 Z" stroke="${color}" stroke-width="6" fill="${color}"/><line x1="20" y1="50" x2="80" y2="50" stroke="${color}" stroke-width="6"/><line x1="50" y1="50" x2="50" y2="85" stroke="${color}" stroke-width="6"/></svg>`,
        ac_outlet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="25" width="70" height="50" rx="8" stroke="${color}" stroke-width="6" fill="none"/><text x="50" y="58" font-size="22" font-family="sans-serif" text-anchor="middle" font-weight="900" fill="${color}">AC</text></svg>`,
        exhaust_fan: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="32" stroke="${color}" stroke-width="6" fill="none"/><path d="M50 18 L50 82 M18 50 L82 50" stroke="${color}" stroke-width="6"/></svg>`,
        wall_spot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="22" fill="#ffb703" stroke="${color}" stroke-width="4"/><path d="M 15 85 L 50 50 L 85 85" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,
        lamp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" stroke="${color}" stroke-width="6" fill="none"/><line x1="28" y1="28" x2="72" y2="72" stroke="${color}" stroke-width="6"/><line x1="72" y1="28" x2="28" y2="72" stroke="${color}" stroke-width="6"/></svg>`,
        bell: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M30 65 C30 35 70 35 70 65 Z" stroke="${color}" stroke-width="6" fill="none"/><rect x="25" y="65" width="50" height="8" fill="${color}"/></svg>`,
        alarm: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,15 85,80 15,80" stroke="${color}" stroke-width="6" fill="none"/><circle cx="50" cy="62" r="6" fill="${color}"/></svg>`,
        audio_out: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="20,40 40,40 60,20 60,80 40,60 20,60" fill="${color}"/><path d="M70 35 Q82 50 70 65" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`,
        data_out: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="18" y="18" width="64" height="64" rx="6" stroke="${color}" stroke-width="6" fill="none"/><text x="50" y="58" font-size="24" font-family="sans-serif" text-anchor="middle" font-weight="900" fill="${color}">IT</text></svg>`,
        panel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect x="5" y="5" width="90" height="50" fill="none" stroke="${color}" stroke-width="6"/><polygon points="5,5 95,5 5,55" fill="${color}"/></svg>`,
        
        main_meter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" rx="10" stroke="${color}" stroke-width="6" fill="none"/><rect x="25" y="25" width="50" height="25" fill="${color}" opacity="0.3"/><circle cx="50" cy="68" r="10" stroke="${color}" stroke-width="5" fill="none"/></svg>`,
        sub_panel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="15" width="80" height="70" rx="6" stroke="${color}" stroke-width="6" fill="none"/><line x1="10" y1="50" x2="90" y2="50" stroke="${color}" stroke-width="5"/><line x1="50" y1="15" x2="50" y2="85" stroke="${color}" stroke-width="5"/></svg>`,
        mcb_breaker: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="25" y="10" width="50" height="80" rx="8" stroke="${color}" stroke-width="6" fill="none"/><rect x="38" y="35" width="24" height="35" rx="4" fill="${color}"/></svg>`,
        rccb_breaker: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="18" y="10" width="64" height="80" rx="8" stroke="${color}" stroke-width="6" fill="none"/><circle cx="35" cy="35" r="8" fill="${color}"/><rect x="50" y="48" width="18" height="28" rx="3" fill="${color}"/></svg>`,
        earth_pit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" stroke="${color}" stroke-width="6" fill="none" stroke-dasharray="8,6"/><line x1="50" y1="25" x2="50" y2="55" stroke="${color}" stroke-width="6"/><line x1="28" y1="55" x2="72" y2="55" stroke="${color}" stroke-width="6"/><line x1="36" y1="65" x2="64" y2="65" stroke="${color}" stroke-width="5"/><line x1="44" y1="75" x2="56" y2="75" stroke="${color}" stroke-width="4"/></svg>`,
        earth_rod: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="50" y1="10" x2="50" y2="60" stroke="${color}" stroke-width="8" stroke-linecap="round"/><line x1="22" y1="60" x2="78" y2="60" stroke="${color}" stroke-width="6"/><line x1="32" y1="72" x2="68" y2="72" stroke="${color}" stroke-width="5"/><line x1="42" y1="84" x2="58" y2="84" stroke="${color}" stroke-width="4"/></svg>`,
        ats_switch: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" rx="10" stroke="${color}" stroke-width="6" fill="none"/><text x="50" y="58" font-size="22" font-family="sans-serif" text-anchor="middle" font-weight="900" fill="${color}">ATS</text></svg>`,
        generator: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" stroke="${color}" stroke-width="6" fill="none"/><text x="50" y="60" font-size="30" font-family="sans-serif" text-anchor="middle" font-weight="900" fill="${color}">G</text></svg>`,
        ups_system: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="20" width="70" height="60" rx="8" stroke="${color}" stroke-width="6" fill="none"/><text x="50" y="58" font-size="22" font-family="sans-serif" text-anchor="middle" font-weight="900" fill="${color}">UPS</text></svg>`,

        door: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect x="5" y="5" width="6" height="50" fill="${color}"/><line x1="11" y1="5" x2="55" y2="5" stroke="${color}" stroke-width="4"/><path d="M 55 5 A 44 44 0 0 1 11 49" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="4 3"/></svg>`,
        door_double: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect x="5" y="5" width="6" height="50" fill="${color}"/><rect x="69" y="5" width="6" height="50" fill="${color}"/><path d="M 11 5 A 29 29 0 0 1 40 34" fill="none" stroke="${color}" stroke-width="3"/><path d="M 69 5 A 29 29 0 0 0 40 34" fill="none" stroke="${color}" stroke-width="3"/></svg>`,
        door_sliding: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 40"><line x1="5" y1="20" x2="65" y2="20" stroke="${color}" stroke-width="3" stroke-dasharray="4 2"/><rect x="5" y1="12" width="28" height="6" fill="${color}"/><rect x="37" y1="22" width="28" height="6" fill="${color}"/></svg>`,
        window: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 30"><rect x="2" y="5" width="76" height="20" fill="none" stroke="${color}" stroke-width="4"/><line x1="2" y1="15" x2="78" y2="15" stroke="${color}" stroke-width="2"/></svg>`,
        window_double: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 30"><rect x="2" y="5" width="76" height="20" fill="none" stroke="${color}" stroke-width="4"/><line x1="40" y1="5" x2="40" y2="25" stroke="${color}" stroke-width="4"/></svg>`,
        balcony: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect x="4" y="8" width="72" height="24" fill="none" stroke="${color}" stroke-width="4"/><line x1="4" y1="20" x2="76" y2="20" stroke="${color}" stroke-width="2" stroke-dasharray="4 4"/></svg>`,
        sink: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect x="8" y="10" width="34" height="30" rx="8" fill="none" stroke="${color}" stroke-width="4"/><circle cx="25" cy="25" r="6" fill="none" stroke="${color}" stroke-width="3"/></svg>`,
        toilet: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 60"><rect x="10" y="5" width="30" height="18" rx="4" fill="none" stroke="${color}" stroke-width="4"/><ellipse cx="25" cy="38" rx="15" ry="18" fill="none" stroke="${color}" stroke-width="4"/></svg>`,
        shower: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect x="5" y="5" width="40" height="40" rx="4" fill="none" stroke="${color}" stroke-width="3"/><circle cx="25" cy="25" r="10" fill="none" stroke="${color}" stroke-width="3"/></svg>`,
        bathtub: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect x="5" y="5" width="70" height="30" rx="12" fill="none" stroke="${color}" stroke-width="4"/><circle cx="20" cy="20" r="4" fill="${color}"/></svg>`,
        drain: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="${color}" stroke-width="4"/><circle cx="20" cy="20" r="6" fill="${color}"/></svg>`,
        wooden_chair: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="25" y="25" width="50" height="50" rx="6" stroke="${color}" stroke-width="6" fill="none"/><line x1="25" y1="36" x2="75" y2="36" stroke="${color}" stroke-width="6"/></svg>`,
        armchair: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60" rx="16" stroke="${color}" stroke-width="6" fill="none"/><rect x="14" y="30" width="12" height="40" rx="4" fill="${color}"/><rect x="74" y="30" width="12" height="40" rx="4" fill="${color}"/></svg>`,
        sofa: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="25" width="80" height="50" rx="12" stroke="${color}" stroke-width="6" fill="none"/><rect x="16" y="32" width="68" height="15" rx="5" fill="${color}"/></svg>`,
        table: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="25" width="70" height="50" rx="6" stroke="${color}" stroke-width="6" fill="none"/></svg>`,
        wardrobe: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="15" y="15" width="70" height="70" rx="4" stroke="${color}" stroke-width="6" fill="none"/><line x1="50" y1="15" x2="50" y2="85" stroke="${color}" stroke-width="5"/></svg>`,
        stove: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60" rx="6" stroke="${color}" stroke-width="6" fill="none"/><circle cx="38" cy="38" r="8" fill="${color}"/><circle cx="62" cy="38" r="8" fill="${color}"/><circle cx="38" cy="62" r="8" fill="${color}"/><circle cx="62" cy="62" r="8" fill="${color}"/></svg>`,
        water_heater: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" stroke="${color}" stroke-width="6" fill="none"/><text x="50" y="58" font-size="22" font-family="sans-serif" text-anchor="middle" fill="${color}" font-weight="900">H</text></svg>`,
        tv_screen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="5" y="40" width="90" height="20" rx="4" fill="${color}"/><polygon points="40,60 60,60 65,72 35,72" fill="${color}"/></svg>`,
        bed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80"><rect x="5" y="5" width="50" height="70" rx="6" fill="none" stroke="${color}" stroke-width="4"/><rect x="9" y="9" width="42" height="18" rx="4" fill="none" stroke="${color}" stroke-width="3"/></svg>`
    });

    window.addSymbol = function(type, labelName) {
        canvas.isDrawingMode = false;
        setActiveTool(btnSelect);
        const svgStr = getSvgData(colorPicker.value)[type] || getSvgData(colorPicker.value)['single_socket'];
        fabric.loadSVGFromString(svgStr, (objects, options) => {
            const obj = fabric.util.groupSVGElements(objects, options);
            obj.set({
                left: canvas.width / 2 - 25, top: canvas.height / 2 - 25,
                scaleX: 0.8, scaleY: 0.8,
                nameTag: labelName,
                symbolType: type
            });
            canvas.add(obj);
            canvas.setActiveObject(obj);
        });
        autoCloseSidebarOnMobile();
    };

    document.getElementById('btnClear').addEventListener('click', () => {
        if (confirm('هل ترغب في مسح اللوحة بالكامل؟')) {
            canvas.clear();
            addWatermark();
            floatingGroup.style.display = 'none';
            saveHistory(canvas);
            updateInventorySummary(canvas);
        }
    });

    document.getElementById('btnFullscreen').addEventListener('click', () => {
        const elem = document.documentElement;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    });

    let projectDirHandle = null;

    async function getSNelectricDirectory() {
        if (!window.showDirectoryPicker) return null;
        try {
            if (!projectDirHandle) {
                alert("يرجى تحديد أو إنشاء المجلد 'SNelectric' لتنظيم حفظ وفتح الملفات والصور به.");
                projectDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            }
            return projectDirHandle;
        } catch (e) {
            return null;
        }
    }

    document.getElementById('btnOpenFile').addEventListener('click', async () => {
        const fileInput = document.getElementById('fileInputJSON');
        fileInput.value = '';
        fileInput.click();
    });

    document.getElementById('fileInputJSON').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const jsonContent = evt.target.result;
                canvas.loadFromJSON(jsonContent, () => {
                    canvas.renderAll();
                    undoStack = [];
                    redoStack = [];
                    saveHistory(canvas);
                    updateInventorySummary(canvas);
                    alert("تم تحميل المشروع وتحديث اللوحة بنجاح 📂✨");
                });
            } catch (err) {
                alert("حدث خطأ أثناء فتح ملف المشروع. تأكد من تحديد ملف JSON صالح.");
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('btnSaveProject').addEventListener('click', async () => {
        const jsonStr = JSON.stringify(canvas.toJSON(['nameTag', 'symbolType', 'roomDimensions', 'roomData']), null, 2);
        const fileName = `SNelectric_Project_${Date.now()}.json`;

        const dirHandle = await getSNelectricDirectory();
        if (dirHandle) {
            try {
                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                alert(`تم حفظ ملف المشروع بنجاح داخل مجلد SNelectric!\nاسم الملف: ${fileName}`);
                return;
            } catch (e) {
                console.log('متابعة بالطريقة التقليدية...');
            }
        }

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    document.getElementById('btnSave').addEventListener('click', () => {
        const objects = canvas.getObjects().filter(o => o.nameTag !== 'العلامة المائية S⚡N electric');
        if (objects.length === 0) {
            alert('اللوحة فارغة تماماً، لا يوجد عناصر لحفظها!');
            return;
        }
        window.openSummaryModal(canvas);
    });

    window.openSummaryModal = function(canvas) {
        const modal = document.getElementById('dimensionsModal');
        const listContainer = document.getElementById('elementsListContainer');
        listContainer.innerHTML = '';

        const objects = canvas.getObjects();
        let hasItems = false;

        objects.forEach((obj) => {
            if (obj.roomDimensions) {
                hasItems = true;
                const row = document.createElement('div');
                row.className = 'element-row';
                row.innerHTML = `<span>🏠 ${obj.nameTag || 'غرفة'}: ${obj.roomDimensions}</span>`;
                listContainer.appendChild(row);
            }
        });

        if (!hasItems) {
            listContainer.innerHTML = `<div style="font-size:12px; color:#94a3b8; text-align:center;">جاهز لحفظ تصميم اللوحة الحالية كصورة high-resolution.</div>`;
        }

        modal.style.display = 'flex';
    };

    window.closeModal = function() {
        document.getElementById('dimensionsModal').style.display = 'none';
    };

    window.saveFinalImage = async function() {
        window.closeModal();

        const originalViewport = canvas.viewportTransform;
        const originalZoom = canvas.getZoom();

        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.setZoom(1);

        const dataURL = canvas.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 2
        });

        canvas.setViewportTransform(originalViewport);
        canvas.setZoom(originalZoom);
        canvas.renderAll();

        const fileName = `SNelectric_Design_${Date.now()}.png`;
        const dirHandle = await getSNelectricDirectory();
        
        if (dirHandle) {
            try {
                const response = await fetch(dataURL);
                const blob = await response.blob();
                const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                alert(`تم حفظ صورة التصميم المخطط بنجاح!\nاسم الملف: ${fileName}`);
                return;
            } catch (e) {
                console.log('متابعة بالطريقة التقليدية للتنزيل...');
            }
        }

        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataURL;
        link.click();
    };

    // 3D Rendering
    document.getElementById('btnView3D').addEventListener('click', () => {
        const roomObjects = canvas.getObjects().filter(o => o.roomData);
        if (roomObjects.length === 0) {
            alert('يرجى إضافة حجرة معمارية أولاً من قائمة "مساحات وحجرات معمارية" لمعاينتها وتجسيدها 3D!');
            return;
        }
        open3DModal(roomObjects);
    });

    function open3DModal(roomObjects) {
        const modal3D = document.getElementById('modal3D');
        const container3D = document.getElementById('container3D');
        container3D.innerHTML = '';
        modal3D.style.display = 'block';

        const width = container3D.clientWidth;
        const height = container3D.clientHeight;

        scene3D = new THREE.Scene();
        scene3D.background = new THREE.Color(0x0b0f19);

        camera3D = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera3D.position.set(0, 12, 16);

        renderer3D = new THREE.WebGLRenderer({ antialias: true });
        renderer3D.setSize(width, height);
        renderer3D.shadowMap.enabled = true;
        container3D.appendChild(renderer3D.domElement);

        controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
        controls3D.enableDamping = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene3D.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0x00f2fe, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        scene3D.add(dirLight);

        const gridHelper = new THREE.GridHelper(40, 40, 0x00f2fe, 0x1e293b);
        scene3D.add(gridHelper);

        const allObjects = canvas.getObjects();
        let roomOffsetX = 0;

        roomObjects.forEach((roomObj) => {
            const rData = roomObj.roomData;
            const rLen = rData.length;
            const rWid = rData.width;
            const rHgt = rData.height;

            const roomGroup3D = new THREE.Group();

            const floorGeo = new THREE.PlaneGeometry(rLen, rWid);
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, side: THREE.DoubleSide });
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.rotation.x = Math.PI / 2;
            roomGroup3D.add(floorMesh);

            const wallMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.25 });
            const wallThick = 0.15;

            const w1Geo = new THREE.BoxGeometry(rLen, rHgt, wallThick);
            const w1 = new THREE.Mesh(w1Geo, wallMat);
            w1.position.set(0, rHgt / 2, -rWid / 2);
            roomGroup3D.add(w1);

            const w2 = new THREE.Mesh(w1Geo, wallMat);
            w2.position.set(0, rHgt / 2, rWid / 2);
            roomGroup3D.add(w2);

            const w3Geo = new THREE.BoxGeometry(wallThick, rHgt, rWid);
            const w3 = new THREE.Mesh(w3Geo, wallMat);
            w3.position.set(-rLen / 2, rHgt / 2, 0);
            roomGroup3D.add(w3);

            const w4 = new THREE.Mesh(w3Geo, wallMat);
            w4.position.set(rLen / 2, rHgt / 2, 0);
            roomGroup3D.add(w4);

            const roomBound = roomObj.getBoundingRect();

            allObjects.forEach(obj => {
                if (obj === roomObj || obj.nameTag === 'العلامة المائية S⚡N electric' || (obj.nameTag && obj.nameTag.includes('مقاس جدار'))) return;

                const objCenter = obj.getCenterPoint();
                if (objCenter.x >= roomBound.left && objCenter.x <= roomBound.left + roomBound.width &&
                    objCenter.y >= roomBound.top && objCenter.y <= roomBound.top + roomBound.height) {

                    const relX = ((objCenter.x - roomBound.left) / roomBound.width - 0.5) * rLen;
                    const relZ = ((objCenter.y - roomBound.top) / roomBound.height - 0.5) * rWid;

                    const sType = obj.symbolType || '';
                    const tag = obj.nameTag || '';
                    let mesh3D = null;

                    if (sType.includes('door') || tag.includes('باب')) {
                        mesh3D = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xff9900 }));
                        mesh3D.position.set(relX, 1.05, relZ);
                    } else if (sType.includes('window') || tag.includes('شباك')) {
                        mesh3D = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 }));
                        mesh3D.position.set(relX, 1.6, relZ);
                    } else if (sType.includes('bed') || tag.includes('سرير')) {
                        mesh3D = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), new THREE.MeshStandardMaterial({ color: 0x9b59b6 }));
                        mesh3D.position.set(relX, 0.25, relZ);
                    } else if (sType.includes('sofa') || sType.includes('armchair') || tag.includes('كنبه')) {
                        mesh3D = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0xe67e22 }));
                        mesh3D.position.set(relX, 0.3, relZ);
                    } else {
                        mesh3D = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
                        mesh3D.position.set(relX, 0.15, relZ);
                    }

                    if (mesh3D) roomGroup3D.add(mesh3D);
                }
            });

            roomGroup3D.position.x = roomOffsetX;
            scene3D.add(roomGroup3D);
            roomOffsetX += rLen + 3;
        });

        function animate3D() {
            if (modal3D.style.display === 'block') {
                requestAnimationFrame(animate3D);
                controls3D.update();
                renderer3D.render(scene3D, camera3D);
            }
        }
        animate3D();
    }

    window.close3DModal = function() {
        document.getElementById('modal3D').style.display = 'none';
        if (renderer3D) renderer3D.dispose();
    };
});
