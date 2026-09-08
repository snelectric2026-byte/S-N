/* ==========================================================================
   SNelectric MEP & BIM Master Engine (mep_engine.js)
   Unified Core & Advanced Engineering Logic
   ========================================================================== */

class MEPEngineMaster {
  constructor() {
    this.elements = []; // تخزين كافة العناصر الهندسية (جدران، كهرباء، سباكة، أثاث، لوحات)
    this.gridSize = 24;
    this.snapEnabled = true;
    this.totalLoad =       0; // أمبير أو كيلوواط كلي
    this.totalPressure =   0; // ضغط السباكة الكلي (Bar)
    this.circuits = [];
    this.loadFromLocalStorage();
  }

  // -------------------------------------------------------------------------
  // 1. إدارة العناصر الأساسية (Elements Management)
  // -------------------------------------------------------------------------
  addElement(type, subType, x, y, properties = {}) {
    const element = {
      id: 'elem_' + Date.now() + Math.random().toString(36).substring(2, 9),
      type: type,         // wall, electrical, plumbing, furniture, panel
      subType: subType,   // socket, pipe, desk, main_breaker, etc.
      label: properties.label || subType,
      x: this.snapEnabled ? Math.round(x / this.gridSize) * this.gridSize : x,
      y: this.snapEnabled ? Math.round(y / this.gridSize) * this.gridSize : y,
      left: x,
      top: y,
      width: properties.width || 50,
      height: properties.height || 50,
      rotation: properties.rotation || 0,
      load: properties.load || 0,          // الحمل الكهربائي
      pressure: properties.pressure || 0,  // ضغط السباكة
      category: type,
      status: 'active'
    };

    this.elements.push(element);
    this.calculateSystemMetrics();
    this.saveToLocalStorage();
    return element;
  }

  removeElement(id) {
    this.elements = this.elements.filter(el => el.id !== id);
    this.calculateSystemMetrics();
    this.saveToLocalStorage();
  }

  updateElement(id, newProps) {
    const el = this.elements.find(item => item.id === id);
    if (el) {
      Object.assign(el, newProps);
      if (newProps.x !== undefined) el.left = newProps.x;
      if (newProps.y !== undefined) el.top = newProps.y;
      this.calculateSystemMetrics();
      this.saveToLocalStorage();
    }
  }

  calculateSystemMetrics() {
    this.totalLoad = this.elements.reduce((sum, el) => sum + (el.load || 0), 0);
    this.totalPressure = this.elements.reduce((sum, el) => sum + (el.pressure || 0), 0);
  }

  // -------------------------------------------------------------------------
  // 2. الفحص الهندسي والتحقق الذكي (Validation & Clash Detection)
  // -------------------------------------------------------------------------
  validateSystem() {
    const errors = [];
    
    const panels = this.elements.filter(el => el.type === 'panel');
    if (panels.length === 0 && this.elements.some(el => el.type === 'electrical')) {
      errors.push({ type: 'warning', message: 'تنبيه: يوجد عناصر كهربائية بدون لوحة توزيع رئيسية (Panel) مرتبطة.' });
    }

    if (this.totalLoad > 100) {
      errors.push({ type: 'danger', message: 'خطر: الحمل الكهربائي الكلي متجاوز الحد الآمن (> 100A).' });
    }

    const plumbingItems = this.elements.filter(el => el.type === 'plumbing');
    if (plumbingItems.length > 0 && this.totalPressure === 0) {
      errors.push({ type: 'warning', message: 'تنبيه: شبكة السباكة غير متصلة بمصدر ضغط مياه رئيسي.' });
    }

    const clashes = this.checkClashes();
    clashes.forEach(cl => {
      errors.push({ type: 'danger', message: `تعارض هندسي: ${cl.elementA} متداخل مع ${cl.elementB}` });
    });

    return errors;
  }

  checkClashes() {
    let clashesFound = [];
    for (let i = 0; i < this.elements.length; i++) {
      for (let j = i + 1; j < this.elements.length; j++) {
        const el1 = this.elements[i];
        const el2 = this.elements[j];
        
        if (el1.category !== el2.category && this.isIntersecting(el1, el2)) {
          clashesFound.push({
            elementA: el1.label || el1.subType,
            elementB: el2.label || el2.subType
          });
        }
      }
    }
    return clashesFound;
  }

  isIntersecting(rect1, rect2) {
    const l1 = rect1.left || rect1.x;
    const t1 = rect1.top || rect1.y;
    const l2 = rect2.left || rect2.x;
    const t2 = rect2.top || rect2.y;

    return (
      l1 < l2 + (rect2.width || 50) &&
      l1 + (rect1.width || 50) > l2 &&
      t1 < t2 + (rect2.height || 50) &&
      t1 + (rect1.height || 50) > t2
    );
  }

  // -------------------------------------------------------------------------
  // 3. الحسابات الهندسية المتقدمة (Cable Sizing & BOQ & MCB)
  // -------------------------------------------------------------------------
  calculateCableSize(currentAmps, lengthMeters, voltage = 220, isThreePhase = false) {
    const allowableDrop = voltage * 0.03;
    const rho = 0.0175;
    
    let recommendedSection = 2.5; 
    if (currentAmps > 16 && currentAmps <= 25) recommendedSection = 4.0;
    else if (currentAmps > 25 && currentAmps <= 32) recommendedSection = 6.0;
    else if (currentAmps > 32 && currentAmps <= 50) recommendedSection = 10.0;
    else if (currentAmps > 50) recommendedSection = 16.0;

    const factor = isThreePhase ? (Math.sqrt(3) * rho * lengthMeters) : (2 * rho * lengthMeters);
    const actualDrop = (factor * currentAmps) / recommendedSection;

    let status = "آمن ومطابق 🟢";
    if (actualDrop > allowableDrop) {
      status = "تنبيه: الهبوط في الجهد أعلى من 3%، يفضل زيادة مقطع السلك ⚠️";
      recommendedSection *= 1.5;
    }

    return {
      amps: currentAmps,
      length: lengthMeters,
      sectionMM2: Math.ceil(recommendedSection * 10) / 10,
      voltageDropVolts: parseFloat(actualDrop.toFixed(2)),
      evaluation: status
    };
  }

  generateBOQ() {
    const boq = {
      switches: 0,
      sockets: 0,
      lights: 0,
      acSwitches: 0,
      sanitaryFixtures: 0,
      wallsTotalLengthMeters: 0,
      furnitureCount: 0
    };

    this.elements.forEach(obj => {
      const label = (obj.label || obj.subType || '').toLowerCase();
      if (label.includes('مفتاح') || label.includes('switch')) boq.switches++;
      else if (label.includes('بريزة') || label.includes('socket')) boq.sockets++;
      else if (label.includes('لمبة') || label.includes('light')) boq.lights++;
      else if (label.includes('تكييف') || label.includes('ac')) boq.acSwitches++;
      else if (label.includes('حوض') || label.includes('قاعدة') || label.includes('بالوعة') || obj.type === 'plumbing') boq.sanitaryFixtures++;
      else if (obj.type === 'wall') boq.wallsTotalLengthMeters += (obj.width || 100) / 50;
      else if (obj.type === 'furniture') boq.furnitureCount++;
    });

    return boq;
  }

  assignCircuitBreaker(loadAmps) {
    let mcbRating = 16;
    if (loadAmps > 16 && loadAmps <= 20) mcbRating = 20;
    else if (loadAmps > 20 && loadAmps <= 32) mcbRating = 32;
    else if (loadAmps > 32 && loadAmps <= 40) mcbRating = 40;
    else if (loadAmps > 40) mcbRating = 63;

    return {
      designedAmps: loadAmps,
      recommendedMCB: `${mcbRating}A - Type C/B`,
      safetyStatus: loadAmps <= mcbRating ? "محمي بنجاح 🟢" : "تنبيه: الحمل يتجاوز قدرة القاطع ⚠️"
    };
  }

  // -------------------------------------------------------------------------
  // 4. التخزين المحلي (Persistence)
  // -------------------------------------------------------------------------
  saveToLocalStorage() {
    try {
      localStorage.setItem('snelectric_master_project', JSON.stringify(this.elements));
    } catch (e) {
      console.error('فشل حفظ المشروع:', e);
    }
  }

  loadFromLocalStorage() {
    try {
      const data = localStorage.getItem('snelectric_master_project');
      if (data) {
        this.elements = JSON.parse(data);
        this.calculateSystemMetrics();
      }
    } catch (e) {
      console.error('فشل استرجاع المشروع:', e);
    }
  }
}

window.mepEngine = new MEPEngineMaster();
