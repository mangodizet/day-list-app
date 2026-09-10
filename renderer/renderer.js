let data = {};
let today = todayKey();
let viewDate = today;

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + n));
}

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
      <button class="del" title="삭제">×</button>
    `;
    li.querySelector('.check').onclick = () => { t.done = !t.done; persist(); render(); };
    li.querySelector('.item-text').onclick = () => { t.done = !t.done; persist(); render(); };
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
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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

async function init() {
  data = await window.api.loadData();
  const last = getLastActiveDate();
  if (last && last < today) checkRollover(last);
  setLastActiveDate(today);
  render();
}
init();
