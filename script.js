(() => {
  const STORAGE_KEY = 'citeAttendanceSystem_v1';
  const state = loadState();
  let serialPort = null;
  let serialReader = null;
  let serialBuffer = '';
  let keyboardBuffer = '';
  let keyboardTimer = null;
  let pendingUnknownUid = '';
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.students && saved.events && saved.currentEventId) return saved;
    } catch (e) { console.warn('Could not load saved attendance data', e); }
    const id = makeId();
    return { students: [], events: [{ id, name: 'CITE ASCEND', createdAt: new Date().toISOString(), records: [] }], currentEventId: id };
  }
  function makeId() { return 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function currentEvent() { return state.events.find(e => e.id === state.currentEventId) || state.events[0]; }
  function cleanUid(value) { return String(value || '').trim().replace(/^\s+|\s+$/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }
  function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2800); }
  function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase(); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function render() {
    const event = currentEvent();
    $('brandTitle').textContent = event.name.toUpperCase();
    $('eventName').textContent = 'Current event: ' + event.name;
    $('count').textContent = event.records.length;
    $('presentCount').textContent = event.records.length;
    $('rosterCount').textContent = state.students.length;
    const query = $('search').value.trim().toLowerCase();
    const records = [...event.records].reverse().filter(r => [r.name,r.studentNumber,r.section,r.uid].some(v => String(v || '').toLowerCase().includes(query)));
    const list = $('attendanceList');
    if (!records.length) {
      list.innerHTML = `<div class="empty"><div>${event.records.length ? 'No matching attendance records' : 'No students have tapped in yet'}<span>${event.records.length ? 'Try another search.' : 'Connect your reader or enter a student number to begin.'}</span></div></div>`;
    } else {
      list.innerHTML = records.map(r => `<article class="student-row"><div class="avatar">${escapeHtml(initials(r.name))}</div><div class="student-info"><div class="student-name">${escapeHtml(r.name)}</div><div class="student-section">${escapeHtml(r.section || 'No section')}</div><div class="student-meta">${escapeHtml(r.studentNumber)} · ${new Date(r.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div></div><div class="row-actions"><button class="icon-btn" title="Remove attendance" aria-label="Remove attendance" data-remove="${escapeHtml(r.id)}">×</button></div></article>`).join('');
    }
  }
  function setReaderStatus(message, connected = false) { $('readerStatus').textContent = message; $('readerStatus').classList.toggle('connected', connected); }
  function markPresent(student) {
    const event = currentEvent();
    const duplicate = event.records.find(r => r.studentId === student.id);
    if (duplicate) { showToast(student.name + ' is already marked present.'); return; }
    event.records.push({ id: makeId(), studentId: student.id, studentNumber: student.studentNumber, name: student.name, section: student.section, uid: student.uid || '', time: new Date().toISOString() });
    saveState(); render(); showToast('Attendance recorded: ' + student.name);
  }
  function lookupByStudentNumber(value) { return state.students.find(s => String(s.studentNumber).trim().toLowerCase() === String(value).trim().toLowerCase()); }
  function handleCardValue(raw) {
    const value = cleanUid(raw);
    if (!value) return;
    const student = state.students.find(s => cleanUid(s.uid) === value);
    if (student) { markPresent(student); return; }
    pendingUnknownUid = value;
    $('uidInput').value = value;
    $('studentNumberInput').value = '';
    $('nameInput').value = '';
    $('sectionInput').value = '';
    $('studentModal').classList.add('show');
    $('studentNumberInput').focus();
    showToast('Unregistered card. Add the student details to enroll this UID.');
  }
  $('manualForm').addEventListener('submit', e => {
    e.preventDefault();
    const value = $('manualId').value.trim();
    if (!value) return;
    const student = lookupByStudentNumber(value);
    if (!student) { showToast('Student number not found. Import the roster or register the student first.'); return; }
    markPresent(student); $('manualId').value = ''; $('manualId').focus();
  });
  $('search').addEventListener('input', render);
  $('attendanceList').addEventListener('click', e => {
    const button = e.target.closest('[data-remove]'); if (!button) return;
    const event = currentEvent(); event.records = event.records.filter(r => r.id !== button.dataset.remove); saveState(); render(); showToast('Attendance entry removed.');
  });
  $('newEvent').addEventListener('click', () => { $('eventInput').value = ''; $('eventModal').classList.add('show'); $('eventInput').focus(); });
  $('cancelEvent').addEventListener('click', () => $('eventModal').classList.remove('show'));
  $('saveEvent').addEventListener('click', () => {
    const name = $('eventInput').value.trim(); if (!name) { showToast('Enter an event name first.'); return; }
    const event = { id: makeId(), name, createdAt: new Date().toISOString(), records: [] };
    state.events.push(event); state.currentEventId = event.id; saveState(); $('eventModal').classList.remove('show'); render(); showToast('New event created.');
  });
  $('cancelStudent').addEventListener('click', () => $('studentModal').classList.remove('show'));
  $('saveStudent').addEventListener('click', () => {
    const uid = cleanUid($('uidInput').value), studentNumber = $('studentNumberInput').value.trim(), name = $('nameInput').value.trim(), section = $('sectionInput').value.trim();
    if (!studentNumber || !name) { showToast('Student number and full name are required.'); return; }
    if (state.students.some(s => s.studentNumber.toLowerCase() === studentNumber.toLowerCase())) { showToast('That student number is already registered.'); return; }
    if (uid && state.students.some(s => cleanUid(s.uid) === uid)) { showToast('That card UID is already assigned to another student.'); return; }
    const student = { id: makeId(), uid, studentNumber, name, section };
    state.students.push(student); saveState(); $('studentModal').classList.remove('show'); render(); markPresent(student); pendingUnknownUid = '';
  });
  $('importRoster').addEventListener('click', () => $('csvFile').click());
  $('csvFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { showToast('CSV appears empty. Include a header row.'); e.target.value = ''; return; }
    const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[ _-]/g,''));
    const index = (...names) => headers.findIndex(h => names.includes(h));
    const uidI = index('uid','carduid','cardid','rfid','nfcuid');
    const numI = index('studentnumber','studentno','studentid','idnumber','id');
    const nameI = index('fullname','name','studentname');
    const sectionI = index('section','courseandsection','programsection');
    if (numI < 0 || nameI < 0) { showToast('CSV needs Student Number and Full Name columns.'); e.target.value = ''; return; }
    let added = 0, updated = 0;
    rows.slice(1).forEach(row => {
      const studentNumber = (row[numI] || '').trim(), name = (row[nameI] || '').trim(), section = sectionI >= 0 ? (row[sectionI] || '').trim() : '', uid = uidI >= 0 ? cleanUid(row[uidI]) : '';
      if (!studentNumber || !name) return;
      const existing = state.students.find(s => s.studentNumber.toLowerCase() === studentNumber.toLowerCase());
      if (existing) { existing.name = name; existing.section = section; if (uid) existing.uid = uid; updated++; }
      else { state.students.push({ id: makeId(), uid, studentNumber, name, section }); added++; }
    });
    saveState(); render(); showToast(`Roster imported: ${added} added, ${updated} updated.`); e.target.value = '';
  });
  function parseCsv(input) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i], next = input[i+1];
      if (c === '"' && quoted && next === '"') { field += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) { row.push(field); field = ''; }
      else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && next === '\n') i++; row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; }
      else field += c;
    }
    row.push(field); if (row.some(v => v.trim())) rows.push(row); return rows;
  }
  $('exportCsv').addEventListener('click', () => {
    const event = currentEvent();
    if (!event.records.length) { showToast('There are no attendance records to export yet.'); return; }
    const data = [['Event','Student Number','Full Name','Section','Card UID','Date','Time'], ...event.records.map(r => [event.name,r.studentNumber,r.name,r.section,r.uid,new Date(r.time).toLocaleDateString(),new Date(r.time).toLocaleTimeString()])];
    const csv = data.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = event.name.replace(/[^a-z0-9-_]+/gi,'_') + '_attendance.csv'; a.click(); URL.revokeObjectURL(url); showToast('Attendance CSV exported. Open it in Excel.');
  });
  $('connectReader').addEventListener('click', connectSerialReader);
  $('keyboardMode').addEventListener('click', () => { $('manualId').focus(); setReaderStatus('Keyboard mode ready · Click the input, then tap a card', true); showToast('Keyboard mode enabled.'); });
  async function connectSerialReader() {
    if (!('serial' in navigator)) { showToast('Web Serial is unavailable here. Use Chrome or Edge on HTTPS/localhost, or keyboard mode.'); setReaderStatus('Web Serial unavailable · Use keyboard mode'); return; }
    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });
      setReaderStatus('USB serial reader connected · 9600 baud', true);
      readSerialLoop();
    } catch (error) { console.error(error); setReaderStatus('Reader connection cancelled or failed'); showToast('Could not connect. Check the USB cable and reader mode.'); }
  }
  async function readSerialLoop() {
    const decoder = new TextDecoder();
    try {
      while (serialPort && serialPort.readable) {
        serialReader = serialPort.readable.getReader();
        try {
          while (true) {
            const { value, done } = await serialReader.read(); if (done) break;
            if (value) consumeSerialText(decoder.decode(value, {stream:true}));
          }
        } finally { serialReader.releaseLock(); serialReader = null; }
      }
    } catch (error) { console.error(error); setReaderStatus('Reader disconnected · You can reconnect', false); }
  }
  function consumeSerialText(chunk) {
    serialBuffer += chunk;
    const parts = serialBuffer.split(/[\r\n]+/);
    serialBuffer = parts.pop() || '';
    parts.forEach(part => { const value = cleanUid(part); if (value.length >= 4) handleCardValue(value); });
    if (serialBuffer.length > 48) { const value = cleanUid(serialBuffer); serialBuffer = ''; if (value.length >= 4) handleCardValue(value); }
  }
  // Fallback for readers configured as USB keyboard/HID: capture scans only when the user is not typing in a form field.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    if (e.key === 'Enter') {
      if (keyboardBuffer.length >= 4) { const value = keyboardBuffer; keyboardBuffer = ''; handleCardValue(value); }
      return;
    }
    if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
      keyboardBuffer += e.key;
      clearTimeout(keyboardTimer); keyboardTimer = setTimeout(() => { keyboardBuffer = ''; }, 900);
    }
  });
  navigator.serial?.addEventListener?.('disconnect', () => { setReaderStatus('Reader disconnected', false); serialPort = null; });
  render();
})();
