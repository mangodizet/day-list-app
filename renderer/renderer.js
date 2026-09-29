let data = {};
let today = todayKey();
let viewDate = today;

function formatLabel(dateKey) {
  const [, m, d] = dateKey.split('-').map(Number);
  return `${m}월 ${d}일`;
}

function tasksFor(dateKey) {
  if (!data[dateKey]) data[dateKey] = [];
  return data[dateKey];
}

function persist() {
  window.api.saveData(data);
}

const todayLabel = document.getElementById('todayLabel');
const dowLabel = document.getElementById('dowLabel');
const datePicker = document.getElementById('datePicker');
const prevDayBtn = document.getElementById('prevDayBtn');
const nextDayBtn = document.getElementById('nextDayBtn');
const todayJumpBtn = document.getElementById('todayJumpBtn');
const miniModeBtn = document.getElementById('miniModeBtn');
const listEl = document.getElementById('list');
const inputEl = document.getElementById('taskInput');
const addBtn = document.getElementById('addBtn');
const carryBtn = document.getElementById('carryBtn');
const footerHint = document.getElementById('footerHint');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const rolloverModalLayer = document.getElementById('rolloverModalLayer');
const rolloverTitle = document.getElementById('rolloverTitle');
const rolloverList = document.getElementById('rolloverList');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModalLayer = document.getElementById('settingsModalLayer');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const autoLaunchCheckbox = document.getElementById('autoLaunchCheckbox');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const updateStatus = document.getElementById('updateStatus');
const updateModalLayer = document.getElementById('updateModalLayer');
const updateModalTitle = document.getElementById('updateModalTitle');
const updateModalNotes = document.getElementById('updateModalNotes');
const updateModalSub = document.getElementById('updateModalSub');
const updateLaterBtn = document.getElementById('updateLaterBtn');
const updateInstallBtn = document.getElementById('updateInstallBtn');

function renderDateHeader() {
  const [y, m, d] = viewDate.split('-').map(Number);
  todayLabel.textContent = `${m}월 ${d}일`;
  dowLabel.textContent = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()] + '요일';
  datePicker.value = viewDate;
  todayJumpBtn.style.display = viewDate === today ? 'none' : '';
}

// 커스텀 드래그 정렬 (Windows 네이티브 HTML5 드래그 이미지는 OS가 강제로 반투명 처리하므로
// 마우스 좌표를 직접 추적해 완전히 불투명한 바를 그려 따라가게 한다)
let dragCtx = null;

function onItemMouseDown(e, li, index, tasks) {
  if (e.button !== 0 || e.target.closest('.check, .del')) return;
  dragCtx = { startX: e.clientX, startY: e.clientY, index, li, tasks, started: false };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);
}

function beginDragVisual(e) {
  const { li } = dragCtx;
  const rect = li.getBoundingClientRect();
  const ghost = li.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);
  li.classList.add('dragging');
  document.body.style.userSelect = 'none';

  Object.assign(dragCtx, {
    started: true,
    ghost,
    offsetY: dragCtx.startY - rect.top,
    overIndex: dragCtx.index,
    dropAfter: false,
  });
}

function onDragMove(e) {
  if (!dragCtx) return;
  if (!dragCtx.started) {
    if (Math.hypot(e.clientX - dragCtx.startX, e.clientY - dragCtx.startY) < 5) return;
    beginDragVisual(e);
  }
  dragCtx.ghost.style.top = `${e.clientY - dragCtx.offsetY}px`;

  listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  for (const item of listEl.querySelectorAll('.item')) {
    if (item === dragCtx.li) continue;
    const r = item.getBoundingClientRect();
    if (e.clientY >= r.top && e.clientY <= r.bottom) {
      dragCtx.overIndex = Number(item.dataset.index);
      dragCtx.dropAfter = (e.clientY - r.top) >= r.height / 2;
      item.classList.add('drag-over');
      break;
    }
  }
}

function onDragUp() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragUp);
  if (!dragCtx) return;
  const ctx = dragCtx;
  dragCtx = null;
  if (!ctx.started) return;

  ctx.ghost.remove();
  ctx.li.classList.remove('dragging');
  listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.body.style.userSelect = '';

  let to = ctx.dropAfter ? ctx.overIndex + 1 : ctx.overIndex;
  const from = ctx.index;
  if (from === to) return;
  const [moved] = ctx.tasks.splice(from, 1);
  if (from < to) to -= 1;
  ctx.tasks.splice(to, 0, moved);
  persist();
  render();
}

function render() {
  renderDateHeader();
  const tasks = tasksFor(viewDate);

  listEl.innerHTML = '';
  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="empty-state">할 일을 입력해보세요</div>';
  }
  tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'item' + (t.done ? ' done' : '');
    li.dataset.index = i;
    li.innerHTML = `
      <span class="rank">${i + 1}</span>
      <button class="check">${t.done ? '✓' : ''}</button>
      <span class="item-text">${escapeHtml(t.text)}</span>
      ${t.carriedFrom ? `<span class="carry-badge">${formatLabel(t.carriedFrom)}에서 이월</span>` : ''}
      <button class="move-prev" title="이전 날로 이동">‹</button>
      <button class="del" title="삭제">×</button>
    `;
    li.querySelector('.check').onclick = () => { t.done = !t.done; persist(); render(); };
    li.querySelector('.item-text').onclick = () => { t.done = !t.done; persist(); render(); };
    li.querySelector('.move-prev').onclick = () => {
      tasks.splice(i, 1);
      tasksFor(addDays(viewDate, -1)).push(t);
      persist();
      render();
    };
    li.querySelector('.del').onclick = () => { tasks.splice(i, 1); persist(); render(); };
    li.addEventListener('mousedown', (e) => onItemMouseDown(e, li, i, tasks));

    listEl.appendChild(li);
  });

  const done = tasks.filter(t => t.done).length;
  const pending = tasks.length - done;
  progressLabel.textContent = `${done}/${tasks.length} 완료`;
  progressFill.style.width = tasks.length ? `${(done / tasks.length) * 100}%` : '0%';
  footerHint.textContent = pending > 0 ? `미완료 ${pending}개` : '미완료 항목이 없어요';
  carryBtn.disabled = pending === 0;
  renderLongTerms();
  if (calModalLayer.classList.contains('show')) renderCalendar();
}

addBtn.onclick = addTask;
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
function addTask() {
  const v = inputEl.value.trim();
  if (!v) return;
  tasksFor(viewDate).push({ id: crypto.randomUUID(), text: v, done: false, carriedFrom: null });
  inputEl.value = '';
  persist();
  render();
}

// --- 장기 일정 ---
const ltList = document.getElementById('ltList');
const ltModalLayer = document.getElementById('ltModalLayer');
const ltText = document.getElementById('ltText');
const ltStart = document.getElementById('ltStart');
const ltEnd = document.getElementById('ltEnd');
const ltError = document.getElementById('ltError');

function longTerms() {
  return Array.isArray(data.longTerm) ? data.longTerm : [];
}

function renderLongTerms() {
  const items = longTermsOn(data, viewDate, today);
  ltList.innerHTML = '';
  if (items.length === 0) {
    ltList.innerHTML = '<li class="lt-empty">이 날짜에 걸친 장기 일정이 없어요</li>';
    return;
  }
  items.forEach(lt => {
    const overDays = daysBetween(lt.end, viewDate);
    const li = document.createElement('li');
    li.className = 'lt-item' + (lt.done ? ' done' : '') + (overDays > 0 ? ' over' : '');
    li.innerHTML = `
      <button class="check">${lt.done ? '✓' : ''}</button>
      <div class="lt-body">
        <span class="lt-text">${escapeHtml(lt.text)}</span>
        <span class="lt-range">${formatShort(lt.start)} ~ ${formatShort(lt.end)}</span>
      </div>
      ${overDays > 0 ? `<span class="carry-badge">마감 ${overDays}일 지남</span>` : ''}
      <button class="del" title="삭제">×</button>
    `;
    const toggle = () => {
      lt.done = !lt.done;
      lt.doneDate = lt.done ? today : null;
      persist();
      render();
    };
    li.querySelector('.check').onclick = toggle;
    li.querySelector('.lt-text').onclick = toggle;
    li.querySelector('.del').onclick = () => {
      data.longTerm = longTerms().filter(x => x !== lt);
      persist();
      render();
    };
    ltList.appendChild(li);
  });
}

function openLongTermModal() {
  ltText.value = '';
  ltStart.value = viewDate;
  ltEnd.value = addDays(viewDate, 6);
  ltError.textContent = '';
  ltModalLayer.classList.add('show');
  ltText.focus();
}

function saveLongTerm() {
  const text = ltText.value.trim();
  const start = ltStart.value;
  const end = ltEnd.value;
  if (!text) { ltError.textContent = '일정 내용을 적어주세요'; ltText.focus(); return; }
  if (!start || !end) { ltError.textContent = '시작일과 종료일을 모두 골라주세요'; return; }
  if (end < start) { ltError.textContent = '종료일이 시작일보다 빨라요'; return; }
  data.longTerm = [...longTerms(), { id: crypto.randomUUID(), text, start, end, done: false, doneDate: null }];
  ltModalLayer.classList.remove('show');
  persist();
  render();
}

document.getElementById('ltAddBtn').onclick = openLongTermModal;
document.getElementById('ltCloseBtn').onclick = () => ltModalLayer.classList.remove('show');
document.getElementById('ltCancelBtn').onclick = () => ltModalLayer.classList.remove('show');
document.getElementById('ltSaveBtn').onclick = saveLongTerm;
ltText.addEventListener('keydown', e => { if (e.key === 'Enter') saveLongTerm(); });
ltStart.onchange = () => { if (ltEnd.value && ltEnd.value < ltStart.value) ltEnd.value = ltStart.value; };

// --- 달력 ---
const calModalLayer = document.getElementById('calModalLayer');
const calGrid = document.getElementById('calGrid');
const calTitle = document.getElementById('calTitle');
let calMonth = today.slice(0, 7);

function renderCalendar() {
  const [y, m] = calMonth.split('-').map(Number);
  calTitle.textContent = `${y}년 ${m}월`;
  const firstDow = new Date(y, m - 1, 1).getDay();
  const cellCount = Math.ceil((firstDow + new Date(y, m, 0).getDate()) / 7) * 7;
  const startKey = todayKey(new Date(y, m - 1, 1 - firstDow));

  calGrid.innerHTML = '';
  for (let i = 0; i < cellCount; i++) {
    const key = addDays(startKey, i);
    const cellMonth = Number(key.slice(5, 7));
    const lts = longTermsOn(data, key, today);
    const tasks = data[key] || [];
    const cell = document.createElement('button');
    cell.className = 'cal-cell'
      + (cellMonth !== m ? ' other' : '')
      + (key === today ? ' is-today' : '')
      + (key === viewDate ? ' is-view' : '')
      + (i % 7 === 0 ? ' sun' : '');
    const chips = lts.slice(0, 2).map(lt =>
      `<span class="cal-chip${key > lt.end ? ' over' : ''}${lt.done ? ' done' : ''}">${escapeHtml(lt.text)}</span>`
    ).join('');
    cell.innerHTML = `
      <span class="cal-day">${Number(key.slice(8))}</span>
      ${chips}
      ${lts.length > 2 ? `<span class="cal-more">+${lts.length - 2}</span>` : ''}
      ${tasks.length ? `<span class="cal-tasks">${tasks.filter(t => t.done).length}/${tasks.length}</span>` : ''}
    `;
    cell.title = [...lts.map(lt => `[장기] ${lt.text}`), ...tasks.map(t => `${t.done ? '✓' : '·'} ${t.text}`)].join('\n');
    cell.onclick = () => {
      viewDate = key;
      calModalLayer.classList.remove('show');
      render();
    };
    calGrid.appendChild(cell);
  }
}

function shiftCalMonth(n) {
  const [y, m] = calMonth.split('-').map(Number);
  calMonth = todayKey(new Date(y, m - 1 + n, 1)).slice(0, 7);
  renderCalendar();
}

document.getElementById('calendarBtn').onclick = () => {
  calMonth = viewDate.slice(0, 7);
  renderCalendar();
  calModalLayer.classList.add('show');
};
document.getElementById('calCloseBtn').onclick = () => calModalLayer.classList.remove('show');
document.getElementById('calPrevBtn').onclick = () => shiftCalMonth(-1);
document.getElementById('calNextBtn').onclick = () => shiftCalMonth(1);
calModalLayer.addEventListener('click', e => { if (e.target === calModalLayer) calModalLayer.classList.remove('show'); });

function carryOverTo(fromDate, toDate) {
  const list = tasksFor(fromDate);
  const pending = list.filter(t => !t.done);
  if (pending.length === 0) return 0;
  data[fromDate] = list.filter(t => t.done);
  const nextList = tasksFor(toDate);
  pending.forEach(t => nextList.push({ id: crypto.randomUUID(), text: t.text, done: false, carriedFrom: fromDate }));
  persist();
  return pending.length;
}

function carryOver(dateKey) {
  return carryOverTo(dateKey, addDays(dateKey, 1));
}

function getLastActiveDate() {
  try { return localStorage.getItem('lastActiveDate'); } catch { return null; }
}
function setLastActiveDate(d) {
  try { localStorage.setItem('lastActiveDate', d); } catch {}
}

function checkRollover(prevDate) {
  const pending = tasksFor(prevDate).filter(t => !t.done);
  if (pending.length === 0) return;
  rolloverTitle.textContent = `${formatLabel(prevDate)}에 못 끝낸 일이 있어요`;
  rolloverList.innerHTML = pending.map(t => `<li>${escapeHtml(t.text)}</li>`).join('');
  rolloverModalLayer.dataset.fromDate = prevDate;
  rolloverModalLayer.classList.add('show');
}

carryBtn.onclick = () => {
  const n = carryOver(viewDate);
  render();
  if (n > 0) footerHint.textContent = `${n}개를 다음날로 이월했어요`;
};

miniModeBtn.onclick = () => window.api.enterMiniMode();
window.api.onDataChanged(async () => {
  data = await window.api.loadData();
  render();
});

// 날짜 이동
prevDayBtn.onclick = () => { viewDate = addDays(viewDate, -1); render(); };
nextDayBtn.onclick = () => { viewDate = addDays(viewDate, 1); render(); };
todayJumpBtn.onclick = () => { viewDate = today; render(); };
datePicker.onchange = () => {
  if (datePicker.value) {
    viewDate = datePicker.value;
    render();
  }
};
datePicker.addEventListener('click', () => {
  if (typeof datePicker.showPicker === 'function') datePicker.showPicker();
});

// 자정 기준 날짜 자동 전환 (오늘을 보고 있던 경우에만 화면도 함께 넘어감)
setInterval(() => {
  const nowKey = todayKey();
  if (nowKey !== today) {
    const wasViewingToday = viewDate === today;
    const prev = today;
    today = nowKey;
    if (wasViewingToday) viewDate = today;
    checkRollover(prev);
    setLastActiveDate(today);
    render();
  }
}, 30000);

// 이월 확인 모달
document.getElementById('rolloverNo').onclick = () => {
  rolloverModalLayer.classList.remove('show');
};
document.getElementById('rolloverYes').onclick = () => {
  const from = rolloverModalLayer.dataset.fromDate;
  carryOverTo(from, today);
  rolloverModalLayer.classList.remove('show');
  render();
};

// 설정
settingsBtn.onclick = async () => {
  const settings = await window.api.getSettings();
  autoLaunchCheckbox.checked = settings.autoLaunch;
  settingsModalLayer.classList.add('show');
};
settingsCloseBtn.onclick = () => settingsModalLayer.classList.remove('show');
autoLaunchCheckbox.onchange = async () => {
  const actual = await window.api.setAutoLaunch(autoLaunchCheckbox.checked);
  autoLaunchCheckbox.checked = actual;
};

const UPDATE_STATUS_TEXT = {
  checking: '확인 중...',
  available: (d) => `새 버전(${d.version})을 찾았어요`,
  'not-available': '최신 버전이에요',
  error: (d) => `확인 실패: ${d.message}`,
  'dev-mode': '개발 모드에서는 확인할 수 없어요',
  downloading: (d) => `다운로드 중... ${d.percent}%`,
  downloaded: '설치 준비 완료, 곧 재시작돼요',
};
checkUpdateBtn.onclick = async () => {
  checkUpdateBtn.disabled = true;
  updateStatus.textContent = '확인 중...';
  await window.api.checkForUpdates();
};
updateLaterBtn.onclick = () => updateModalLayer.classList.remove('show');
updateInstallBtn.onclick = () => {
  updateInstallBtn.disabled = true;
  updateModalSub.textContent = '다운로드 중... 0%';
  window.api.downloadUpdate();
};
window.api.onUpdateStatus((data) => {
  const text = UPDATE_STATUS_TEXT[data.status];
  updateStatus.textContent = typeof text === 'function' ? text(data) : text || '';
  if (data.status !== 'checking') checkUpdateBtn.disabled = false;

  if (data.status === 'available') {
    updateModalTitle.textContent = `새 버전 ${data.version}이 있어요`;
    updateModalNotes.innerHTML = data.releaseNotes || '변경 내역이 없어요.';
    updateModalSub.textContent = '지금 업데이트할까요?';
    updateInstallBtn.disabled = false;
    updateModalLayer.classList.add('show');
  } else if (data.status === 'downloading' && updateModalLayer.classList.contains('show')) {
    updateModalSub.textContent = `다운로드 중... ${data.percent}%`;
  } else if (data.status === 'downloaded' && updateModalLayer.classList.contains('show')) {
    updateModalSub.textContent = '설치 준비 완료, 곧 재시작돼요';
  } else if (data.status === 'error' && updateModalLayer.classList.contains('show')) {
    updateModalSub.textContent = `업데이트 실패: ${data.message}`;
    updateInstallBtn.disabled = false;
  }
});

async function init() {
  data = await window.api.loadData();
  const last = getLastActiveDate();
  if (last && last < today) checkRollover(last);
  setLastActiveDate(today);
  render();
  document.getElementById('appVersion').textContent = 'v' + await window.api.getAppVersion();
}
init();
