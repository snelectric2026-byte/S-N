/* ==========================================================================
   SNelectric MEP Engine - UI & Application Logic (script.js)
   Integrated with MEPEngineMaster (mep_engine.js)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  console.log("SNelectric UI Engine Initialized.");
  
  // تفعيل الاستماع لأزرار كتالوج العناصر (جدران، كهرباء، سباكة، أثاث، لوحات)
  initCatalogListeners();
  
  // تفعيل أزرار الأدوات الذكية والتقارير في الواجهة
  initToolBarListeners();
  
  // تحديث شريط الحالة الأولي
  updateBottomStatusBar();
}

// -------------------------------------------------------------------------
// 1. إدارة إدراج العناصر من القائمة الجانبية
// -------------------------------------------------------------------------
function initCatalogListeners() {
  const catalogButtons = document.querySelectorAll('.symbol-btn, [data-element-type]');
  
  catalogButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = btn.dataset.type || btn.dataset.elementType || 'electrical';
      const subType = btn.dataset.subtype || btn.innerText.trim();
      
      // تحديد الأحمال والضغوط الافتراضية حسب التصنيف
      let defaultLoad = 0;
      let defaultPressure = 0;
      
      if (type === 'electrical') defaultLoad = 15; // 15 أمبير افتراضي للبرايز والإنارة
      if (type === 'ac') defaultLoad = 25;        // تكييف
      if (type === 'plumbing') defaultPressure = 2.5; // 2.5 بار للسباكة

      // إدراج العنصر عبر المحرك الرئيسي
      const newElement = window.mepEngine.addElement(type, subType, 150, 150, {
        load: defaultLoad,
        pressure: defaultPressure,
        width: 60,
        height: 60
      });

      updateBottomStatusBar();
      renderCanvasElements();
      showToast(`تم إدراج العنصر: ${subType} بنجاح.`);
    });
  });
}

// -------------------------------------------------------------------------
// 2. ربط أزرار الأدوات العلوية والتقارير (BOQ & Validation)
// -------------------------------------------------------------------------
function initToolBarListeners() {
  // زر فحص الأخطاء والتعارضات الهندسية (Validation & Clashes)
  const validateBtn = document.getElementById('validate-btn') || document.querySelector('.btn-validate');
  if (validateBtn) {
    validateBtn.addEventListener('click', () => {
      runSmartValidationReport();
    });
  }

  // زر التقرير الآلي للمقايسات (BOQ)
  const boqBtn = document.getElementById('boq-btn') || document.querySelector('.btn-boq');
  if (boqBtn) {
    boqBtn.addEventListener('click', () => {
      showBOQReportModal();
    });
  }

  // زر حاسبة الكابلات
  const cableBtn = document.getElementById('cable-calc-btn') || document.querySelector('.btn-cable');
  if (cableBtn) {
    cableBtn.addEventListener('click', () => {
      openCableCalculatorModal();
    });
  }
}

// -------------------------------------------------------------------------
// 3. التقارير والنوافذ التفاعلية
// -------------------------------------------------------------------------

// تقرير الفحص الذكي والتعارضات
function runSmartValidationReport() {
  const errors = window.mepEngine.validateSystem();
  if (errors.length === 0) {
    alert('✅ المخطط سليم هندسياً: لا توجد أخطاء أو تعارضات ظاهرة بين المسارات.');
  } else {
    let reportText = '⚠️ تقرير التدقيق الهندسي وفحص التعارضات:\n\n';
    errors.forEach((err, idx) => {
      reportText += `${idx + 1}. [${err.type.toUpperCase()}] ${err.message}\n`;
    });
    alert(reportText);
  }
}

// تقرير حصر الكميات الآلي (Automated BOQ)
function showBOQReportModal() {
  const boq = window.mepEngine.generateBOQ();
  let msg = '📊 تقرير المقايسات وحصر الكميات الآلي (BOQ):\n\n';
  msg += `- مفاتيح الإنارة: ${boq.switches}\n`;
  msg += `- البرايز والافياش: ${boq.sockets}\n`;
  msg += `- وحدات الإضاءة (لمبات): ${boq.lights}\n`;
  msg += `- مفاتيح التكييف: ${boq.acSwitches}\n`;
  msg += `- الأجهزة والوصلات الصحية: ${boq.sanitaryFixtures}\n`;
  msg += `- إجمالي أطوال الجدران التقديرية: ${boq.wallsTotalLengthMeters} متر\n`;
  msg += `- قطع الأثاث المضافة: ${boq.furnitureCount}\n`;
  
  alert(msg);
}

// حاسبة مقاطع الكابلات التفاعلية
function openCableCalculatorModal() {
  const ampsInput = prompt('أدخل قيمة التيار المراد حسابه (بالأمبير):', '16');
  if (!ampsInput) return;
  const lengthInput = prompt('أدخل طول الخط الكلي (بالمتر):', '20');
  if (!lengthInput) return;

  const result = window.mepEngine.calculateCableSize(parseFloat(ampsInput), parseFloat(lengthInput));
  
  let resultMsg = `⚡ نتائج حساب الكابلات والهبوط في الجهد:\n\n`;
  resultMsg += `- التيار المصمم: ${result.amps} A\n`;
  resultMsg += `- الطول: ${result.length} م\n`;
  resultMsg += `- مقطع السلك الموصى به: ${result.sectionMM2} مم²\n`;
  resultMsg += `- الهبوط الفعلي في الجهد: ${result.voltageDropVolts} V\n`;
  resultMsg += `- التقييم: ${result.evaluation}\n`;
  
  alert(resultMsg);
}

// -------------------------------------------------------------------------
// 4. تحديث شاشة العرض وحالة النظام
// -------------------------------------------------------------------------
function updateBottomStatusBar() {
  const loadText = document.getElementById('total-load-text');
  const pressureText = document.getElementById('total-pressure-text');
  
  if (loadText) loadText.innerText = window.mepEngine.totalLoad + ' A';
  if (pressureText) pressureText.innerText = window.mepEngine.totalPressure + ' Bar';
}

function renderCanvasElements() {
  // دالة مخصصة لإعادة رسم عناصر المخطط على الـ Canvas أو منطقة العمل في الـ DOM
  console.log("Rendering elements on canvas:", window.mepEngine.elements.length);
}

// رسائل التنبيه السريعة (Toast Notification)
function showToast(message) {
  let toast = document.getElementById('snelectric-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'snelectric-toast';
    toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#00f2fe; color:#020617; padding:10px 20px; border-radius:8px; font-weight:bold; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.3); transition: opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
}

// -------------------------------------------------------------------------
// 5. اختصارات لوحة المفاتيح الهندسية
// -------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    window.mepEngine.saveToLocalStorage();
    showToast('💾 تم حفظ المشروع بنجاح في التخزين المحلي.');
  }
  if (e.key === 'F1') {
    e.preventDefault();
    runSmartValidationReport();
  }
});
