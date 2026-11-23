'use strict';
/* ===================== الإعدادات (عدّل هنا فقط) ===================== */
const CONFIG = {
  VERSION: '10',                     // يظهر أسفل الصفحة؛ زِده عند كل تحديث (وغيّر ?v= في index.html)
  PROJECT_NAME: 'تقييم المساجد في أكاديمية روبوغيكس',
  ACADEMY_NAME: 'ROBOGEEX academy',   // يظهر بدل الشعار إذا تعذّر تحميله
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwDZxaKA2mpC37LdTHuk48740QbRLZ0H7pI7b-hsntor9p7bog0FgrU5Zam4LIValCa/exec',
  CSV_URL: 'data/students.csv',     // ملف الأسماء
  CODE_LENGTH: 4,                   // عدد أرقام الرمز (يجب أن يطابق CODE_LENGTH في Code.gs)
  // طلاب المدرب بعد إدخال الرمز: 'mosque' = كل طلاب مسجده، 'supervisor' = الطلاب المسجّل اسمه مشرفاً عليهم فقط
  STUDENTS_SCOPE: 'mosque',
};
const OPTIONS = {
  majors: ['هندسة حاسوب', 'هندسة كهرباء', 'هندسة ميكانيك', 'علوم حاسوب', 'تقنية معلومات'],
  years: ['أولى', 'ثانية', 'ثالثة', 'رابعة', 'خامسة', 'خريج'],
  trained: ['0', '1-10', '11-30', '31-60', 'أكثر من 60'],
  otherSkills: ['تصميم', 'مونتاج', 'كهرباء', 'لحام', 'لغات', 'إلقاء', 'تصوير'],
};
const SECTIONS = { students: 'تقييم الطلاب', trainer: 'معلومات عن المدرب' };

/* ===================== تعريف النماذج ===================== */
const YN = ['نعم', 'لا'];
const STUDENT_FIELDS = [
  { id: 'attendance', label: 'الالتزام بالحضور', type: 'rate' },
  { id: 'programming', label: 'المستوى البرمجي', type: 'rate' },
  { id: 'creativity', label: 'الإبداع', type: 'rate' },
  { id: 'recommend', label: 'هل ترشّح الطالب للمستوى 2؟', type: 'choice', options: YN, yn: true },
];
const TRAINER_FIELDS = [
  { id: 'trainability', label: 'قابلية التدريب', type: 'rate' },
  { id: 'newTrainings', label: 'قابلية المشاركة في تدريبات جديدة', type: 'choice', options: ['نعم', 'لا', 'ربما'], yn: true },
  { id: 'major', label: 'الاختصاص الجامعي', type: 'choice', options: OPTIONS.majors, own: 'اكتب اختصاصاً آخر' },
  { id: 'year', label: 'السنة الجامعية', type: 'choice', options: OPTIONS.years },
  { id: 'trained', label: 'عدد الطلاب الذين دربتهم سابقاً', type: 'choice', options: OPTIONS.trained },
  { id: 'skill_prog', label: 'البرمجة', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_ai', label: 'الذكاء الاصطناعي', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_mech', label: 'الميكانيك', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_3d', label: 'الطباعة ثلاثية الأبعاد', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_office', label: 'الأدوات المكتبية', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_robot', label: 'الروبوت', type: 'rate', group: 'مستوى المهارات' },
  { id: 'otherSkills', label: 'مهارات أخرى (اختياري)', type: 'multi', options: OPTIONS.otherSkills, own: 'أضف مهارة أخرى', optional: true },
];
const fieldsOf = (f) => (f.kind === 'student' ? STUDENT_FIELDS : TRAINER_FIELDS);

/* ===================== أدوات مساعدة ===================== */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
const normCode = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, CONFIG.CODE_LENGTH);
const mosqueKey = (n) => String(n || '').trim().replace(/^(الجامع|جامع|مسجد)\s+/, '');
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* التخزين غير متاح */ } },
};
function parseCSV(t) {
  t = t.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/* ===================== الحالة ===================== */
let MOSQUES = [];             // [{ name, area, students:[{key,name,mosque,area,sup}] }]
const MOS = {};               // اسم المسجد -> نفس الكائن
const findMosque = (name) => MOS[name] || MOSQUES.find((m) => mosqueKey(m.name) === mosqueKey(name));
const saved = LS.get('mev2', {});
let store = { students: saved.students || {}, trainers: saved.trainers || {}, queue: saved.queue || [], session: saved.session || null };
const persist = () => LS.set('mev2', store);
const ui = { reg: null, newCode: null, view: 'home', section: 'students', onlyPending: false, search: '', form: null, done: null };

/* ===================== تحميل البيانات ===================== */
async function loadData() {
  const r = await fetch(CONFIG.CSV_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error('csv');
  const rows = parseCSV(await r.text()); rows.shift();
  for (const [m, a, s, sup] of rows) {
    const mosque = (m || '').trim(), name = (s || '').trim();
    if (!mosque || !name) continue;
    const M = (MOS[mosque] ||= (MOSQUES.push({ name: mosque, area: (a || '').trim(), students: [] }), MOSQUES[MOSQUES.length - 1]));
    M.students.push({ key: mosque + '|' + name, name, mosque, area: M.area, sup: (sup || '').split('|').map((x) => x.trim()).filter(Boolean) });
  }
  // طالبان بنفس الاسم في المسجد: نميّزهما بالمشرف ونعطي كل واحد مفتاحاً مستقلاً
  for (const M of MOSQUES) {
    const count = {}; M.students.forEach((s) => (count[s.name] = (count[s.name] || 0) + 1));
    const seen = {};
    for (const s of M.students) {
      if (count[s.name] < 2) continue;
      seen[s.name] = (seen[s.name] || 0) + 1;
      s.key = M.name + '|' + s.name + '#' + seen[s.name];
      s.name = s.name + (s.sup.length ? ' (مجموعة ' + s.sup.join(' و') + ')' : ' (' + seen[s.name] + ')');
    }
  }
}

/* ===================== المزامنة مع Google Sheets ===================== */
const api = async (body) => (await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(body) })).json();
let flushing = false;
async function flush() {
  if (flushing || !store.queue.length || !CONFIG.APPS_SCRIPT_URL) return;
  flushing = true;
  try {
    while (store.queue.length) {
      const it = store.queue[0];
      const j = await api({ kind: it.kind, key: it.key, ...it.data, code: it.code });
      if (!j.ok) {
        if (['invalid_code', 'forbidden', 'bad_request'].includes(j.error)) {   // لن ينجح أبداً: نتخلص منه كي لا يعلق الباقي
          if (j.error === 'invalid_code' && store.session && store.session.code === it.code) store.session = null;
          store.queue = store.queue.filter((x) => x !== it); persist(); continue;
        }
        throw new Error(j.error || 'fail');
      }
      store.queue = store.queue.filter((x) => x !== it); persist();
    }
  } catch (e) { /* سيُعاد المحاولة لاحقاً */ }
  flushing = false; updateBanner();
}
function updateBanner() {
  const b = $('#banner');
  if (!CONFIG.APPS_SCRIPT_URL) { b.textContent = 'وضع تجريبي: الدخول والحفظ في الجدول غير مفعّلين.'; b.className = 'banner'; b.hidden = false; }
  else if (store.queue.length) { b.textContent = `⏳ ${store.queue.length} بانتظار الإرسال (سيُرسل تلقائياً عند توفر الإنترنت)`; b.className = 'banner warn'; b.hidden = false; }
  else b.hidden = true;
}
function save(kind, key, data, code) {
  const rec = { ...data, time: new Date().toISOString() };
  (kind === 'student' ? store.students : store.trainers)[key] = rec;
  store.queue = store.queue.filter((q) => !(q.kind === kind && q.key === key));
  store.queue.push({ kind, key, data: rec, code });
  persist(); updateBanner(); flush();
}

/* ===================== دخول المدرب برمز ===================== */
function applyLogin(j, code) {
  const M = findMosque(j.mosque);
  store.session = { code: normCode(code), trainer: j.trainer, mosque: M ? M.name : j.mosque };
  if (j.info) store.trainers[j.trainer] = { ...j.info };
  const queued = new Set(store.queue.filter((q) => q.kind === 'student').map((q) => q.key));
  for (const [k, v] of Object.entries(j.students || {})) if (!queued.has(k)) store.students[k] = v;
  persist();
}
const LOGIN_ERRORS = {
  invalid_code: 'الرمز غير صحيح. تأكد منه وأعد المحاولة.',
  throttled: 'تم إيقاف الدخول مؤقتاً بسبب محاولات خاطئة كثيرة. حاول لاحقاً أو تواصل مع الأكاديمية.',
  network: 'تعذّر الاتصال بالإنترنت. تأكد من الاتصال وأعد المحاولة.',
  no_server: 'خدمة الدخول غير مفعّلة بعد.',
  name_exists: 'هذا الاسم مسجّل مسبقاً في الأكاديمية. إن كنت مسجّلاً فادخل برمزك، أو اطلب رمزك من الأكاديمية.',
  bad_name: 'اكتب اسمك (حرفان على الأقل).',
  bad_mosque: 'اختر المسجد أولاً.',
  registration_closed: 'تسجيل المدربين الجدد متوقف حالياً. تواصل مع الأكاديمية.',
};
async function registerTrainer(mosque, name) {
  if (!CONFIG.APPS_SCRIPT_URL) return { ok: false, error: 'no_server' };
  let j;
  try { j = await api({ kind: 'register', mosque, name }); } catch (e) { return { ok: false, error: 'network' }; }
  if (j.ok) applyLogin(j, j.code);
  return j;
}
async function login(code) {
  if (!CONFIG.APPS_SCRIPT_URL) return { ok: false, error: 'no_server' };
  let j;
  try { j = await api({ kind: 'login', code }); } catch (e) { return { ok: false, error: 'network' }; }
  if (j.ok) applyLogin(j, code);
  return j;
}
async function refreshSession() {
  if (!store.session || !CONFIG.APPS_SCRIPT_URL) return;
  try {
    const j = await api({ kind: 'login', code: store.session.code });
    if (j.ok) applyLogin(j, store.session.code);
    else if (j.error === 'invalid_code') { store.session = null; persist(); }
    if (ui.view === 'home') render();
  } catch (e) { /* بدون إنترنت: نبقى على آخر بيانات محفوظة */ }
}
function logout() {
  store.session = null; store.students = {}; store.trainers = {};   // لا نترك بيانات على جهاز مشترك
  persist(); resetAll();
}

/* ===================== التنقل ===================== */
function render() { ({ home: viewHome, form: viewForm, done: viewDone }[ui.view])($('#app')); }
function go(view) { ui.view = view; render(); window.scrollTo(0, 0); }
function back() { history.state && history.state.v ? history.back() : go('home'); }
function resetAll() {
  Object.assign(ui, { reg: null, newCode: null, view: 'home', section: 'students', onlyPending: false, search: '', form: null, done: null });
  go('home');
}
function myStudents() {
  const s = store.session, M = s && findMosque(s.mosque);
  if (!M) return [];
  if (CONFIG.STUDENTS_SCOPE === 'supervisor') { const mine = M.students.filter((x) => x.sup.includes(s.trainer)); if (mine.length) return mine; }
  return M.students;
}

/* --- قائمة طلاب المسجد --- */
function studentBlock(list) {
  const done = list.filter((s) => store.students[s.key]).length, n = list.length;
  return `<div class="progress-line"><span>تم تقييم ${done} من ${n}</span><span>${n ? Math.round(done / n * 100) : 0}%</span></div>
    <div class="bar"><i style="width:${n ? done / n * 100 : 0}%"></i></div>
    <div class="search"><input id="sq" type="search" placeholder="🔍  ابحث عن اسم طالب" autocomplete="off" value="${esc(ui.search)}"></div>
    <div class="toggle"><button class="chip sm ${ui.onlyPending ? 'on' : ''}" data-act="pending">لم يُقيَّم بعد فقط</button></div>
    <div id="slist" class="list"></div>`;
}
function drawStudents(list) {
  const draw = () => {
    ui.search = $('#sq').value;
    const q = norm(ui.search);
    const shown = list.filter((s) => norm(s.name).includes(q) && (!ui.onlyPending || !store.students[s.key]));
    $('#slist').innerHTML = shown.length ? shown.map((s) => {
      const ok = !!store.students[s.key];
      return `<button class="row" data-act="student" data-key="${esc(s.key)}">
        <span class="name">${esc(s.name)}</span><span class="badge ${ok ? 'ok' : ''}">${ok ? 'تم تقييمه ✓' : 'لم يُقيَّم'}</span></button>`;
    }).join('') : `<p class="empty">${q || ui.onlyPending ? 'لا يوجد طالب مطابق' : 'لا يوجد طلاب'}</p>`;
  };
  $('#sq').addEventListener('input', draw); draw();
}

/* --- تسجيل مدرب جديد --- */
function regHTML() {
  const r = ui.reg;
  return `<div class="gate" style="text-align:start">
    <h2>تسجيل مدرب جديد</h2>
    <p class="sub">اختر مسجدك واكتب اسمك، وسيُنشأ لك رمز من ${CONFIG.CODE_LENGTH} أرقام تلقائياً.</p>
    <div class="lbl" style="font-weight:700;margin:8px 0">المسجد</div>
    <div class="chips">${MOSQUES.map((m) => `<button type="button" class="chip ${r.mosque === m.name ? 'on' : ''}" data-act="reg-mosque" data-m="${esc(m.name)}">${esc(m.name)}</button>`).join('')}</div>
    <div class="lbl" style="font-weight:700;margin:16px 0 8px">اسمك</div>
    <div class="own" style="margin-top:0"><input id="regname" type="text" maxlength="60" placeholder="الاسم الكامل" autocomplete="off" value="${esc(r.name)}"></div>
    <div id="gerr" class="gate-err" role="alert" hidden></div>
    <button id="gbtn" class="btn" data-act="reg-submit">تسجيل وإنشاء الرمز</button>
    <button class="link newtr" data-act="reg-cancel">رجوع لإدخال الرمز</button></div>`;
}
async function doRegister() {
  const r = ui.reg, err = $('#gerr'), btn = $('#gbtn');
  r.name = $('#regname').value.replace(/\s+/g, ' ').trim();
  const show = (m) => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  if (!r.mosque) return show(LOGIN_ERRORS.bad_mosque);
  if (r.name.length < 2) return show(LOGIN_ERRORS.bad_name);
  btn.disabled = true; btn.textContent = 'جارٍ التسجيل…';
  const j = await registerTrainer(r.mosque, r.name);
  if (j.ok) { ui.newCode = j.code; ui.reg = null; ui.section = 'trainer'; render(); return; }
  btn.disabled = false; btn.textContent = 'تسجيل وإنشاء الرمز';
  show(LOGIN_ERRORS[j.error] || 'حدث خطأ. أعد المحاولة.');
}

/* --- الصفحة الأولى: قسمان، وكلاهما يتطلب رمز المدرب --- */
const LOCK_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
function viewHome(app) {
  const stu = ui.section === 'students', s = store.session;
  let body = '';
  if (!s) {
    body = `<div class="gate">
      <div class="lock">${LOCK_SVG}</div>
      <h2>دخول المدرب</h2>
      <p class="sub">أدخل الرمز الخاص بك (${CONFIG.CODE_LENGTH} أرقام) الذي أرسلته لك الأكاديمية.</p>
      <input id="code" class="code-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autocorrect="off" spellcheck="false" maxlength="${CONFIG.CODE_LENGTH}" placeholder="${'•'.repeat(CONFIG.CODE_LENGTH)}" aria-label="رمز الدخول">
      <div id="gerr" class="gate-err" role="alert" hidden></div>
      <button id="gbtn" class="btn" data-act="login">دخول</button>
      <button class="link newtr" data-act="reg-open">مدرب جديد ولا تملك رمزاً؟ سجّل هنا</button></div>`;
    if (ui.reg) body = regHTML();
  } else if (ui.newCode) {
    body = `<div class="gate">
      <div class="lock">${LOCK_SVG}</div>
      <h2>تم تسجيلك يا ${esc(s.trainer)}</h2>
      <p class="sub">${esc(s.mosque)}<br>رمزك الخاص للدخول:</p>
      <div class="code-show" dir="ltr">${esc(ui.newCode)}</div>
      <p class="sub">احفظ هذا الرمز (صوّر الشاشة أو اكتبه). ستحتاجه كلما دخلت من جهاز آخر.</p>
      <button class="btn" data-act="code-ok">حفظته، متابعة</button></div>`;
  } else {
    const M = findMosque(s.mosque), mine = store.trainers[s.trainer];
    body = `<div class="card who-card"><div><div class="meta">المدرب</div><div class="who-name">${esc(s.trainer)}</div><div class="meta">${esc(M ? M.name : s.mosque)}</div></div>
        <button class="link" data-act="logout">تسجيل الخروج</button></div>`;
    if (stu) {
      body += M ? `<div class="sec-title">طلاب ${esc(M.name)}</div>${studentBlock(myStudents())}`
        : '<p class="empty">لا توجد أسماء طلاب لهذا المسجد في الملف.</p>';
    } else {
      body += `<button class="row info-row" data-act="trainer-form"><span><span class="name">معلوماتي كمدرب</span><br><span class="meta">${mine ? 'تمت التعبئة، اضغط للتعديل' : 'لم تُعبّأ بعد'}</span></span>
        <span class="badge ${mine ? 'ok' : ''}">${mine ? 'تم ✓' : 'مطلوب'}</span></button>`;
    }
  }
  app.innerHTML = `
    <div class="seg" role="group" aria-label="القسم">${Object.entries(SECTIONS).map(([k, v]) =>
      `<button class="seg-btn ${ui.section === k ? 'on' : ''}" data-act="section" data-s="${k}">${v}</button>`).join('')}</div>
    ${body}<p class="ver">الإصدار ${esc(CONFIG.VERSION)}</p>`;
  if (s && stu && findMosque(s.mosque)) drawStudents(myStudents());
}

/* --- النماذج --- */
function openForm(kind, key) {
  const rec = kind === 'student' ? store.students[key] : store.trainers[store.session.trainer];
  const values = { ...(rec || {}) }; delete values.remote;
  ui.form = { kind, key, values };
  history.pushState({ v: 'form' }, '');
  go('form');
}
function bodyHTML(f, v) {
  let html = '';
  if (f.type === 'rate') {
    html = `<div class="rate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="set" data-id="${f.id}" data-v="${n}" class="${v === n ? 'on' : ''}" aria-label="${n}">${n}</button>`).join('')}</div>
      <div class="scale"><span>ضعيف</span><span>ممتاز</span></div>`;
  } else if (f.type === 'choice') {
    const opts = f.options.slice(); if (v != null && v !== '' && !opts.includes(v)) opts.push(v);
    html = `<div class="${f.yn ? 'yn' : 'chips'}">${opts.map((o) => `<button type="button" class="chip ${v === o ? 'on' : ''}" data-act="set" data-id="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  } else {
    const arr = Array.isArray(v) ? v : [], opts = f.options.concat(arr.filter((x) => !f.options.includes(x)));
    html = `<div class="chips">${opts.map((o) => `<button type="button" class="chip ${arr.includes(o) ? 'on' : ''}" data-act="toggle" data-id="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  }
  if (f.own) html += `<div class="own"><input id="own-${f.id}" data-own="${f.id}" type="text" maxlength="60" placeholder="${esc(f.own)}" autocomplete="off"><button type="button" class="add" data-act="add-own" data-id="${f.id}">إضافة</button></div>`;
  return html;
}
function refreshField(f) { $(`[data-field="${f.id}"] .body`).innerHTML = bodyHTML(f, ui.form.values[f.id]); }
function viewForm(app) {
  const { kind, key, values } = ui.form, s = store.session;
  let html = '', lastGroup = null;
  for (const f of fieldsOf(ui.form)) {
    if (f.group && f.group !== lastGroup) html += `<div class="sec-title">${f.group}</div>`;
    lastGroup = f.group || null;
    html += `<div class="field ${f.group ? 'group-item' : ''}" data-field="${f.id}"><div class="lbl">${f.label}</div><div class="body">${bodyHTML(f, values[f.id])}</div></div>`;
  }
  const M = findMosque(s.mosque);
  const title = kind === 'student' ? M.students.find((x) => x.key === key).name : 'معلومات عن المدرب';
  const sub = kind === 'student' ? M.name : `${s.trainer} · ${M ? M.name : s.mosque}`;
  app.innerHTML = `
    <div class="formtop"><button class="back" data-act="back">→ رجوع</button>
      <div class="who-name">${esc(title)}</div><div class="sub" style="margin:0">${esc(sub)}</div>
      <div class="progress-line"><span id="ptxt"></span></div><div class="bar"><i id="pbar"></i></div></div>
    ${html}
    <div class="submit-wrap"><div class="inner"><button id="submit" class="btn" data-act="submit" disabled>${kind === 'student' ? 'حفظ التقييم' : 'حفظ المعلومات'}</button></div></div>`;
  updateProgress();
}
const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
function updateProgress() {
  const req = fieldsOf(ui.form).filter((f) => !f.optional), n = req.filter((f) => filled(ui.form.values[f.id])).length;
  $('#ptxt').textContent = `تمت تعبئة ${n} من ${req.length}`;
  $('#pbar').style.width = (n / req.length * 100) + '%';
  $('#submit').disabled = n < req.length;
}
function submitForm() {
  const { kind, key, values } = ui.form, s = store.session, M = findMosque(s.mosque);
  const data = {};
  for (const f of fieldsOf(ui.form)) if (filled(values[f.id])) data[f.id] = values[f.id];
  data.trainer = s.trainer; data.mosque = M ? M.name : s.mosque;
  let k = key;
  if (kind === 'student') { const st = M.students.find((x) => x.key === key); Object.assign(data, { area: st.area, student: st.name }); }
  else k = s.trainer;
  save(kind, k, data, s.code);
  ui.done = { kind, key: k };
  history.replaceState({ v: 'done' }, '');
  go('done');
}
function nextPending() {
  const list = myStudents(), i = list.findIndex((s) => s.key === ui.done.key);
  return list.slice(i + 1).concat(list.slice(0, i + 1)).find((s) => !store.students[s.key]);
}
function viewDone(app) {
  const isStudent = ui.done.kind === 'student';
  const next = isStudent ? nextPending() : null;
  const offline = store.queue.length || !CONFIG.APPS_SCRIPT_URL;
  app.innerHTML = `<div class="done"><div class="tick">✓</div>
    <h2>${isStudent ? 'تم حفظ التقييم بنجاح' : 'تم حفظ معلوماتك بنجاح'}</h2>
    <p class="sub">${offline ? 'سيُرسل إلى الجدول تلقائياً عند توفر الاتصال.' : 'شكراً لك، وصلت البيانات إلى الجدول.'}</p>
    <div class="stack">
      ${next ? `<button class="btn" data-act="next" data-key="${esc(next.key)}">تقييم الطالب التالي: ${esc(next.name)}</button>` : ''}
      <button class="btn ${next ? 'alt' : ''}" data-act="back">${isStudent ? 'العودة إلى قائمة الطلاب' : 'العودة'}</button></div></div>`;
}

/* ===================== الأحداث ===================== */
async function doLogin() {
  const input = $('#code'), err = $('#gerr'), btn = $('#gbtn');
  const code = normCode(input.value);
  const show = (m) => { err.textContent = m; err.hidden = false; input.classList.remove('bad'); void input.offsetWidth; input.classList.add('bad'); };
  err.hidden = true;
  if (code.length < CONFIG.CODE_LENGTH) return show(`أدخل الرمز كاملاً (${CONFIG.CODE_LENGTH} أرقام).`);
  btn.disabled = true; btn.textContent = 'جارٍ التحقق…';
  const j = await login(code);
  if (j.ok) { render(); return; }
  btn.disabled = false; btn.textContent = 'دخول';
  show(LOGIN_ERRORS[j.error] || 'حدث خطأ. أعد المحاولة.');
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'reset': resetAll(); break;
    case 'section': ui.section = d.s; ui.search = ''; ui.onlyPending = false; render(); break;
    case 'pending': ui.onlyPending = !ui.onlyPending; render(); break;
    case 'student': openForm('student', d.key); break;
    case 'trainer-form': openForm('trainer', null); break;
    case 'login': doLogin(); break;
    case 'reg-open': ui.reg = { mosque: '', name: '' }; render(); break;
    case 'reg-cancel': ui.reg = null; render(); break;
    case 'reg-mosque': ui.reg.name = ($('#regname') || {}).value || ui.reg.name; ui.reg.mosque = d.m; render(); break;
    case 'reg-submit': doRegister(); break;
    case 'code-ok': ui.newCode = null; render(); break;
    case 'logout': logout(); break;
    case 'back': back(); break;
    case 'next':
      ui.form = { kind: 'student', key: d.key, values: { ...(store.students[d.key] || {}) } };
      delete ui.form.values.remote;
      history.replaceState({ v: 'form' }, ''); go('form'); break;
    case 'set': {
      const f = ui.form, isRate = !!el.closest('.rate');
      f.values[d.id] = isRate ? Number(d.v) : d.v;
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      updateProgress(); break;
    }
    case 'toggle': {
      const f = ui.form, arr = Array.isArray(f.values[d.id]) ? f.values[d.id] : [];
      f.values[d.id] = arr.includes(d.v) ? arr.filter((x) => x !== d.v) : [...arr, d.v];
      el.classList.toggle('on'); break;
    }
    case 'add-own': {
      const input = $(`#own-${d.id}`), v = input.value.replace(/\s+/g, ' ').trim(); if (!v) return;
      const f = fieldsOf(ui.form).find((x) => x.id === d.id), vals = ui.form.values;
      if (f.type === 'multi') { const arr = Array.isArray(vals[d.id]) ? vals[d.id].slice() : []; if (!arr.includes(v)) arr.push(v); vals[d.id] = arr; }
      else vals[d.id] = v;
      refreshField(f); updateProgress(); break;
    }
    case 'submit': submitForm(); break;
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'code') e.target.value = normCode(e.target.value); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.id && !(e.target.dataset && e.target.dataset.own)) return;
  e.preventDefault();
  if (e.target.id === 'code') doLogin();
  else if (e.target.id === 'regname') doRegister();
  else if (e.target.dataset.own) e.target.closest('.own').querySelector('[data-act="add-own"]').click();
});
window.addEventListener('popstate', () => { if (ui.view !== 'home') go('home'); });
window.addEventListener('online', () => { flush(); refreshSession(); });

/* ===================== البدء ===================== */
(async function init() {
  $('#academy').textContent = CONFIG.ACADEMY_NAME;
  document.title = CONFIG.PROJECT_NAME;
  updateBanner();
  try { await loadData(); }
  catch (e) { $('#app').innerHTML = '<p class="empty">تعذّر تحميل ملف الأسماء (data/students.csv).<br>إذا فتحت الملف مباشرة من الجهاز، انشره على GitHub Pages أو شغّل خادماً محلياً.</p>'; return; }
  render(); flush(); refreshSession();
})();
