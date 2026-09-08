/**
 * S⚡N Electric MEP Engine v3.5 - Advanced Engineering Additions
 */

class MEPEngineAdvanced {
  constructor() {
    this.circuits = [];
    this.quantities = {};
  }

  // 1. حاسبة قطاعات الأسلاك والهبوط في الجهد (Cable Sizing & Voltage Drop)
  calculateCableSize(currentAmps, lengthMeters, voltage = 220, isThreePhase = false) {
    // المعيار الهندسي: السماح بهبوط أقصى 3% للدوائر الفرعية
    const allowableDrop = voltage * 0.03;
    // النحاس: معامل المقاومة التقديري للخط الطولي
    const rho = 0.0175; // Ohm*mm2/m
    
    // مساحة المقطع المبدئية بناءً على التيار (معيار تقريبي آمن للاستخدام الميداني)
    let recommendedSection = 2.5; // مم² كحد أدنى للإنارة والبرايز
    if (currentAmps > 16 && currentAmps <= 25) recommendedSection = 4.0;
    else if (currentAmps > 25 && currentAmps <= 32) recommendedSection = 6.0;
    else if (currentAmps > 32 && currentAmps <= 50) recommendedSection = 10.0;
    else if (currentAmps > 50) recommendedSection = 16.0;

    // حساب الهبوط الفعلي في الجهد
    const factor = isThreePhase ? (Math.sqrt(3) * rho * lengthMeters) : (2 * rho * lengthMeters);
    const actualDrop = (factor * currentAmps) / recommendedSection;

    let status = "آمن ومطابق";
    if (actualDrop > allowableDrop) {
      status = "تنبيه: الهبوط في الجهد أعلى من 3%، يفضل زيادة مقطع السلك";
      recommendedSection *= 1.5; // ترقية المقطع لتلافي الهبوط
    }

    return {
      amps: currentAmps,
      length: lengthMeters,
      sectionMM2: Math.ceil(recommendedSection * 10) / 10,
      voltageDropVolts: parseFloat(actualDrop.toFixed(2)),
      evaluation: status
    };
  }

  // 2. نظام التقرير الآلي للمقايسات وعرض الأسعار (Automated BOQ)
  generateBOQ(canvasObjects) {
    const boq = {
      switches: 0,
      sockets: 0,
      lights: 0,
      acSwitches: 0,
      sanitaryFixtures: 0,
      wallsTotalLengthMeters: 0
    };

    canvasObjects.forEach(obj => {
      const label = obj.label || obj.type || '';
      if (label.includes('مفتاح إنارة')) boq.switches++;
      else if (label.includes('بريزة')) boq.sockets++;
      else if (label.includes('لمبة سقف')) boq.lights++;
      else if (label.includes('مفتاح تكييف')) boq.acSwitches++;
      else if (label.includes('حوض') || label.includes('قاعدة') || label.includes('بالوعة')) boq.sanitaryFixtures++;
      else if (label.includes('جدار')) boq.wallsTotalLengthMeters += (obj.width || 1);
    });

    return boq;
  }

  // 3. فحص التعارض الهندسي الذكي (MEP Clash Detection)
  checkClashes(elements) {
    let clashesFound = [];
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const el1 = elements[i];
        const el2 = elements[j];
        
        // التحقق من تداخل الإحداثيات بين خطوط السباكة والكهرباء
        if (el1.category !== el2.category && this.isIntersecting(el1, el2)) {
          clashesFound.push({
            elementA: el1.label || 'عنصر 1',
            elementB: el2.label || 'عنصر 2',
            message: 'تعارض هندسي بين مسار كهربائي ومسار سباكة/تأسيس'
          });
        }
      }
    }
    return clashesFound;
  }

  isIntersecting(rect1, rect2) {
    return (
      rect1.left < rect2.left + rect2.width &&
      rect1.left + rect1.width > rect2.left &&
      rect1.top < rect2.top + rect2.height &&
      rect1.top + rect1.height > rect2.top
    );
  }

  // 4. إدارة الدوائر الكهربائية وقواطع الحماية (MCB Distribution Management)
  assignCircuitBreaker(loadAmps) {
    let mcbRating = 16; // قاطع قياسي للإنارة والبرايز العادية
    if (loadAmps > 16 && loadAmps <= 20) mcbRating = 20;
    else if (loadAmps > 20 && loadAmps <= 32) mcbRating = 32; // للتكييف والأحمال العالية
    else if (loadAmps > 32 && loadAmps <= 40) mcbRating = 40;
    else if (loadAmps > 40) mcbRating = 63; // قاطع رئيسي للوحة الفرعية

    return {
      designedAmps: loadAmps,
      recommendedMCB: `${mcbRating}A - Type C/B`,
      safetyStatus: loadAmps <= mcbRating ? "محمي بنجاح 🟢" : "تنبيه: الحمل يتجاوز قدرة القاطع ⚠️"
    };
  }
}

// ربط المحرك المتقدم بالنظام العام
window.mepAdvancedEngine = new MEPEngineAdvanced();
