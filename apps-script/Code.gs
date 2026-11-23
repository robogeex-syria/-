/**
 * خادم التقييمات (Google Apps Script) مع رموز دخول المدربين.
 *
 * الأوراق (تُنشأ تلقائياً):
 *   "تقييم الطلاب"      تقييمات الطلاب
 *   "معلومات المدربين"  معلومات كل مدرب
 *   "الرموز"            رمز كل مسجد ومدربه (سرّية، لا تُرسل أبداً إلى الموقع)
 *
 * طريقة التشغيل أول مرة: اختر الدالة setupCodes من القائمة أعلى المحرر ثم اضغط "تشغيل".
 * ستظهر الرموز (4 أرقام لكل مدرب) في ورقة "الرموز".
 *
 * لإضافة مسجد أو مدرب جديد: أضف صفاً في ورقة "الرموز" (المسجد + المدرب) واترك خانة الرمز فارغة،
 * ثم شغّل setupCodes ليُولَّد له رمز. لإيقاف رمز اكتب "لا" في عمود "مفعّل".
 * إذا توقف الدخول مؤقتاً بسبب محاولات خاطئة كثيرة: شغّل الدالة clearLock.
 */

const STUDENT_COLS = [ // [الحقل، عنوان العمود]
  ['time', 'الوقت'], ['trainer', 'المدرب'], ['mosque', 'المسجد'], ['area', 'المنطقة'], ['student', 'الطالب'],
  ['attendance', 'الالتزام بالحضور'], ['programming', 'المستوى البرمجي'], ['creativity', 'الإبداع'],
  ['recommend', 'ترشيح للمستوى 2'], ['key', 'المفتاح'],
];
const TRAINER_COLS = [
  ['time', 'الوقت'], ['trainer', 'المدرب'], ['mosque', 'المسجد'], ['trainability', 'قابلية التدريب'], ['newTrainings', 'المشاركة في تدريبات جديدة'],
  ['major', 'الاختصاص الجامعي'], ['year', 'السنة'], ['trained', 'عدد الطلاب المدرَّبين سابقاً'],
  ['skill_prog', 'البرمجة'], ['skill_ai', 'الذكاء الاصطناعي'], ['skill_mech', 'الميكانيك'], ['skill_3d', 'الطباعة 3D'],
  ['skill_office', 'الأدوات المكتبية'], ['skill_robot', 'الروبوت'], ['otherSkills', 'مهارات أخرى'],
];
const SHEETS = {
  student: { name: 'تقييم الطلاب', cols: STUDENT_COLS, keyField: 'key' },
  trainer: { name: 'معلومات المدربين', cols: TRAINER_COLS, keyField: 'trainer' },
};

const CODES_SHEET = 'الرموز';
const CODES_HEADERS = ['الرمز', 'المسجد', 'المدرب', 'مفعّل', 'المصدر'];
// القيم الابتدائية فقط (أسماء المساجد والمدربين). عدّلها لاحقاً من ورقة "الرموز" مباشرة.
const DEFAULT_ASSIGNMENTS = [
  ['جامع القدم الكبير', 'محمود خاروف'],
  ['مسجد الإيمان', 'محمد رفاعي'],
  ['مسجد الأنصار', 'عبد الوهاب ناصر'],
  ['مسجد الصحابة', 'محمد صالح الدخيل'],
  ['مسجد الحسنين', 'محمد عَرَّاط'],
];
// أسماء قديمة تُصحَّح تلقائياً عند تشغيل setupCodes
const LEGACY_MOSQUES = { 'الحسنين': 'مسجد الحسنين' };
const LEGACY_TRAINERS = { 'مدرب جامع القدم الكبير': 'محمود خاروف' };

const CODE_LENGTH = 4;           // عدد أرقام الرمز. للأمان الأعلى اجعله 6.
const MAX_FAILS_SHORT = 15;      // محاولات خاطئة مسموحة خلال 10 دقائق
const MAX_FAILS_LONG = 60;       // محاولات خاطئة مسموحة خلال 6 ساعات
const OPEN_REGISTRATION = true;  // السماح للمدرب الجديد بتسجيل نفسه (false لإيقافه)
const MAX_REGISTRATIONS = 30;    // أقصى عدد تسجيلات جديدة خلال 6 ساعات

/* ===================== الرموز ===================== */
function latinDigits_(s) {
  const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(s == null ? '' : s).replace(/[٠-٩]/g, d => String(ar.indexOf(d)));
}

// ما يكتبه المدرب: نُبقي الأرقام فقط
function normInput_(c) { return latinDigits_(c).replace(/\D/g, ''); }

// ما في خانة الرمز في الجدول: يُقبل فقط إن كان أرقاماً بالطول المطلوب بالضبط
function cellCode_(v) {
  const s = latinDigits_(v).trim();
  return new RegExp('^\\d{' + CODE_LENGTH + '}$').test(s) ? s : '';
}

function newCode_() {
  const n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16);
  return String(n % Math.pow(10, CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

// يطابق "مسجد الحسنين" مع "الحسنين" و"جامع القدم" مع "القدم"
function mosqueKey_(n) { return String(n == null ? '' : n).trim().replace(/^(الجامع|جامع|مسجد)\s+/, ''); }

function codesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CODES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CODES_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([CODES_HEADERS]).setFontWeight('bold').setBackground('#fde0c8');
    sh.getRange(1, 1, 500, 1).setNumberFormat('@');   // الرمز نص دائماً (كي لا يُحذف الصفر من أوله)
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** شغّلها يدوياً: تنشئ ورقة الرموز، وتصحّح الأسماء القديمة، وتولّد رمزاً لكل صف بلا رمز صالح. آمنة للتكرار. */
function setupCodes() {
  const sh = codesSheet_();
  if (sh.getLastRow() < 2) DEFAULT_ASSIGNMENTS.forEach(a => sh.appendRow(['', a[0], a[1], 'نعم']));
  const last = sh.getLastRow();
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  rows.forEach((r, i) => {
    const m = LEGACY_MOSQUES[String(r[1]).trim()], t = LEGACY_TRAINERS[String(r[2]).trim()];
    if (m) sh.getRange(i + 2, 2).setValue(m);
    if (t) sh.getRange(i + 2, 3).setValue(t);
  });
  const taken = {};
  rows.forEach(r => { const c = cellCode_(r[0]); if (c) taken[c] = 0; });
  rows.forEach((r, i) => {
    if (!String(r[1]).trim()) return;
    const c = cellCode_(r[0]);
    if (c && taken[c] === 0) { taken[c] = 1; return; }          // رمز صالح وغير مكرر
    let n;
    do { n = newCode_(); } while (n in taken);                  // رمز فارغ أو قديم الشكل أو مكرر: نولّد بديلاً
    taken[n] = 1;
    sh.getRange(i + 2, 1).setValue(n);
  });
}

function findCode_(code) {
  const n = normInput_(code);
  if (n.length !== CODE_LENGTH) return null;
  const sh = codesSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (cellCode_(r[0]) === n && String(r[3]).trim() !== 'لا' && String(r[1]).trim() && String(r[2]).trim()) {
      return { mosque: String(r[1]).trim(), trainer: String(r[2]).trim() };
    }
  }
  return null;
}

function auth_(code) {
  const cache = CacheService.getScriptCache();
  const s = Number(cache.get('fails_s') || 0), l = Number(cache.get('fails_l') || 0);
  if (s >= MAX_FAILS_SHORT || l >= MAX_FAILS_LONG) return { error: 'throttled' };
  const who = findCode_(code);
  if (!who) {
    cache.put('fails_s', String(s + 1), 600);
    cache.put('fails_l', String(l + 1), 21600);
    return { error: 'invalid_code' };
  }
  return { who: who };
}


/** تسجيل مدرب جديد ذاتياً: يُنشئ له رمزاً من 4 أرقام في ورقة الرموز ويُدخله مباشرة. */
function register_(d) {
  if (!OPEN_REGISTRATION) return { ok: false, error: 'registration_closed' };
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('reg_n') || 0);
  if (n >= MAX_REGISTRATIONS) return { ok: false, error: 'throttled' };
  const name = String(d.name == null ? '' : d.name).replace(/\s+/g, ' ').replace(/^[=+\-@\s]+/, '').trim().slice(0, 60);
  if (name.length < 2) return { ok: false, error: 'bad_name' };
  const sh = codesSheet_();
  const last = sh.getLastRow();
  const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, 4).getValues();
  const want = mosqueKey_(d.mosque);
  const mrow = rows.find(r => want && mosqueKey_(r[1]) === want);
  if (!mrow) return { ok: false, error: 'bad_mosque' };
  const mosque = String(mrow[1]).trim();
  const lname = name.toLowerCase();
  if (rows.some(r => String(r[2]).trim().toLowerCase() === lname)) return { ok: false, error: 'name_exists' };
  const taken = {};
  rows.forEach(r => { const c = cellCode_(r[0]); if (c) taken[c] = 1; });
  let code, tries = 0;
  do { code = newCode_(); tries++; } while (code in taken && tries < 500);
  if (code in taken) return { ok: false, error: 'server_error' };
  if (!String(sh.getRange(1, 5).getValue()).trim()) sh.getRange(1, 5).setValue(CODES_HEADERS[4]).setFontWeight('bold').setBackground('#fde0c8');
  sh.appendRow([code, mosque, name, 'نعم', 'تسجيل ذاتي ' + Utilities.formatDate(new Date(), 'Asia/Damascus', 'yyyy-MM-dd HH:mm')]);
  cache.put('reg_n', String(n + 1), 21600);
  return { ok: true, code: code, trainer: name, mosque: mosque, info: null, students: studentsOf_(mosque) };
}

/** شغّلها يدوياً لفك الإيقاف المؤقت للدخول بعد محاولات خاطئة كثيرة. */
function clearLock() { CacheService.getScriptCache().removeAll(['fails_s', 'fails_l', 'reg_n']); }

/* ===================== مساعدات الأوراق ===================== */
function getSheet_(kind) {
  const cfg = SHEETS[kind];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) {
    sh = ss.insertSheet(cfg.name);
    sh.getRange(1, 1, 1, cfg.cols.length).setValues([cfg.cols.map(c => c[1])]).setFontWeight('bold').setBackground('#fde0c8');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return { sh: sh, cfg: cfg };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// يمنع تحويل النص إلى معادلة داخل الجدول
function safe_(v) {
  if (Array.isArray(v)) return v.map(x => String(safe_(x))).join('، ');
  if (typeof v === 'string') return /^[=+\-@]/.test(v) ? "'" + v.slice(0, 200) : v.slice(0, 200);
  return v === undefined || v === null ? '' : v;
}

function upsert_(kind, d) {
  const g = getSheet_(kind), sh = g.sh, cfg = g.cfg;
  const row = cfg.cols.map(c => safe_(d[c[0]]));
  const keyIdx = cfg.cols.findIndex(c => c[0] === cfg.keyField);
  const keyVal = String(d[cfg.keyField]);
  const last = sh.getLastRow();
  let target = last + 1;
  if (last > 1) {
    const keys = sh.getRange(2, keyIdx + 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = keys.indexOf(keyVal);
    if (i >= 0) target = i + 2;                         // تحديث بدل التكرار
  }
  sh.getRange(target, 1, 1, row.length).setValues([row]);
}

function rowToObj_(cfg, r) {
  const o = {};
  cfg.cols.forEach((c, i) => {
    let v = r[i];
    if (c[0] === 'otherSkills') v = v ? String(v).split('، ') : [];
    o[c[0]] = v;
  });
  return o;
}

function trainerInfo_(name) {
  const g = getSheet_('trainer'), last = g.sh.getLastRow();
  if (last < 2) return null;
  const rows = g.sh.getRange(2, 1, last - 1, g.cfg.cols.length).getValues();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][1]) === name) return rowToObj_(g.cfg, rows[i]);
  return null;
}

function studentsOf_(mosque) {
  const g = getSheet_('student'), last = g.sh.getLastRow(), out = {};
  if (last < 2) return out;
  g.sh.getRange(2, 1, last - 1, g.cfg.cols.length).getValues().forEach(r => {
    const o = rowToObj_(g.cfg, r);
    if (mosqueKey_(o.mosque) === mosqueKey_(mosque)) out[o.key] = o;
  });
  return out;
}

/* ===================== نقاط الدخول ===================== */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);

    if (d.kind === 'register') return json_(register_(d));   // الوحيدة التي لا تحتاج رمزاً: تُنشئ رمزاً جديداً

    // باقي العمليات تتطلب رمزاً صحيحاً
    if (['login', 'trainer', 'student'].indexOf(d.kind) < 0) return json_({ ok: false, error: 'bad_request' });
    const a = auth_(d.code);
    if (a.error) return json_({ ok: false, error: a.error });

    if (d.kind === 'login') {
      return json_({ ok: true, trainer: a.who.trainer, mosque: a.who.mosque,
        info: trainerInfo_(a.who.trainer), students: studentsOf_(a.who.mosque) });
    }

    if (d.kind === 'trainer') {
      d.trainer = a.who.trainer;                       // الاسم والمسجد من الرمز فقط، وليس من العميل
      d.mosque = a.who.mosque;
      upsert_('trainer', d);
      return json_({ ok: true });
    }

    // student
    if (!d.key || !d.mosque || String(d.key).indexOf(d.mosque + '|') !== 0) return json_({ ok: false, error: 'bad_request' });
    if (mosqueKey_(a.who.mosque) !== mosqueKey_(d.mosque)) return json_({ ok: false, error: 'forbidden' });
    d.trainer = a.who.trainer;
    upsert_('student', d);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

// لا يُرجع أي بيانات: كل شيء يتطلب رمزاً عبر doPost
function doGet(e) {
  return json_({ ok: true });
}
