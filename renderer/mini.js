let today = todayKey();

const dateLabel = document.getElementById('miniDateLabel');
const listEl = document.getElementById('miniList');
const progressEl = document.getElementById('miniProgress');
const closeBtn = document.getElementById('miniCloseBtn');
const pinBtn = document.getElementById('miniPinBtn');
const opacityRange = document.getElementById('miniOpacityRange');
const opacityValue = document.getElementById('miniOpacityValue');

function renderDateLabel() {
  const [, m, d] = today.split('-').map(Number);
  dateLabel.textContent = `${m}월 ${d}일 할 일`;
}
renderDateLabel();

// 미니 창을 켜둔 채 자정이 지나면 오늘 날짜로 넘어간다
setInterval(() => {
  const nowKey = todayKey();
  if (nowKey === today) return;
  today = nowKey;
  renderDateLabel();
  render();
}, 30000);

async function toggleDone(taskId) {
  const fresh = await window.api.loadData();
  const list = fresh[today] || [];
  const target = list.find((t) => t.id === taskId);
  if (!target) return;
  target.done = !target.done;
  await window.api.saveData(fresh);
  render();
}

async function toggleLongTerm(ltId) {
  const fresh = await window.api.loadData();
  const target = (fresh.longTerm || []).find((lt) => lt.id === ltId);
  if (!target) return;
  target.done = !target.done;
  target.doneDate = target.done ? today : null;
  await window.api.saveData(fresh);
  render();
}

function miniItem(text, done, onClick, extraClass = '', sub = '') {
  const li = document.createElement('li');
  li.className = 'mini-item' + (done ? ' done' : '') + extraClass;
  li.innerHTML = `
    <span class="mini-check">${done ? '✓' : ''}</span>
    <span class="mini-item-body">
      <span class="mini-item-text">${escapeHtml(text)}</span>
      ${sub ? `<span class="mini-item-sub">${sub}</span>` : ''}
    </span>
  `;
  if (onClick) li.onclick = onClick;
  return li;
}

function longTermSub(lt, dateKey) {
  const over = daysBetween(lt.end, dateKey);
  return over > 0 ? `마감 ${over}일 지남` : `~ ${formatShort(lt.end)}`;
}

async function render() {
  const data = await window.api.loadData();
  const tasks = data[today] || [];
  const lts = longTermsOn(data, today, today);

  listEl.innerHTML = '';
  // 오늘 걸친 장기 일정이 있을 때만 카테고리를 나눠서 표시
  if (lts.length) listEl.insertAdjacentHTML('beforeend', '<li class="mini-cat">하루 할 일</li>');
  if (tasks.length === 0) {
    listEl.insertAdjacentHTML('beforeend', `<div class="mini-empty${lts.length ? ' compact' : ''}">오늘 할 일이 없어요</div>`);
  }
  tasks.forEach((t) => listEl.appendChild(miniItem(t.text, t.done, () => toggleDone(t.id))));
  if (lts.length) {
    listEl.insertAdjacentHTML('beforeend', '<li class="mini-cat">장기 일정</li>');
    lts.forEach((lt) => listEl.appendChild(miniItem(
      lt.text, lt.done, () => toggleLongTerm(lt.id),
      ' lt' + (daysBetween(lt.end, today) > 0 ? ' over' : ''), longTermSub(lt, today),
    )));
  }

  const done = tasks.filter((t) => t.done).length;
  progressEl.textContent = tasks.length ? `${done}/${tasks.length} 완료` : '';
  if (!calEl.hidden) renderCal(data);
}

// --- 미니 달력 ---
const calEl = document.getElementById('miniCal');
const calBtn = document.getElementById('miniCalBtn');
const calGrid = document.getElementById('miniCalGrid');
const calTitle = document.getElementById('miniCalTitle');
const calDayTitle = document.getElementById('miniCalDayTitle');
const calDayList = document.getElementById('miniCalDayList');
let calMonth = today.slice(0, 7);
let calSelected = today;

async function renderCal(data) {
  if (!data) data = await window.api.loadData();
  const [y, m] = calMonth.split('-').map(Number);
  calTitle.textContent = `${y}년 ${m}월`;
  const firstDow = new Date(y, m - 1, 1).getDay();
  const cellCount = Math.ceil((firstDow + new Date(y, m, 0).getDate()) / 7) * 7;
  const startKey = todayKey(new Date(y, m - 1, 1 - firstDow));

  calGrid.innerHTML = '';
  for (let i = 0; i < cellCount; i++) {
    const key = addDays(startKey, i);
    const lts = longTermsOn(data, key, today);
    const tasks = data[key] || [];
    const cell = document.createElement('button');
    cell.className = 'mini-cal-cell'
      + (Number(key.slice(5, 7)) !== m ? ' other' : '')
      + (key === today ? ' is-today' : '')
      + (key === calSelected ? ' is-sel' : '')
      + (i % 7 === 0 ? ' sun' : '');
    const dots = [
      lts.some((lt) => key <= lt.end) ? '<i class="dot lt"></i>' : '',
      lts.some((lt) => key > lt.end) ? '<i class="dot over"></i>' : '',
      tasks.length ? '<i class="dot task"></i>' : '',
    ].join('');
    cell.innerHTML = `<span>${Number(key.slice(8))}</span><span class="dots">${dots}</span>`;
    cell.onclick = () => { calSelected = key; renderCal(data); };
    calGrid.appendChild(cell);
  }

  const [, sm, sd] = calSelected.split('-').map(Number);
  calDayTitle.textContent = `${sm}월 ${sd}일`;
  const selTasks = data[calSelected] || [];
  const selLts = longTermsOn(data, calSelected, today);
  calDayList.innerHTML = '';
  if (!selTasks.length && !selLts.length) {
    calDayList.innerHTML = '<li class="mini-empty compact">일정이 없어요</li>';
  }
  selLts.forEach((lt) => calDayList.appendChild(miniItem(
    lt.text, lt.done, null, ' lt' + (daysBetween(lt.end, calSelected) > 0 ? ' over' : ''), longTermSub(lt, calSelected),
  )));
  selTasks.forEach((t) => calDayList.appendChild(miniItem(t.text, t.done, null)));
}

function shiftCalMonth(n) {
  const [y, m] = calMonth.split('-').map(Number);
  calMonth = todayKey(new Date(y, m - 1 + n, 1)).slice(0, 7);
  renderCal();
}

calBtn.onclick = () => {
  const open = calEl.hidden;
  calEl.hidden = !open;
  listEl.hidden = open;
  calBtn.classList.toggle('active', open);
  if (open) {
    calMonth = today.slice(0, 7);
    calSelected = today;
    renderCal();
  }
};
document.getElementById('miniCalPrev').onclick = () => shiftCalMonth(-1);
document.getElementById('miniCalNext').onclick = () => shiftCalMonth(1);

function applyOpacity(percent) {
  document.documentElement.style.setProperty('--mini-alpha', percent / 100);
  opacityValue.textContent = `${percent}%`;
}

closeBtn.onclick = () => window.api.exitMiniMode();
opacityRange.oninput = () => {
  const percent = Number(opacityRange.value);
  applyOpacity(percent);
  window.api.setMiniOpacity(percent / 100);
};
pinBtn.onclick = async () => {
  const next = !pinBtn.classList.contains('active');
  await window.api.setMiniPinned(next);
  pinBtn.classList.toggle('active', next);
};
window.api.onDataChanged(render);

(async () => {
  const opacity = await window.api.getMiniOpacity();
  const percent = Math.round(opacity * 100);
  opacityRange.value = percent;
  applyOpacity(percent);
  const pinned = await window.api.getMiniPinned();
  pinBtn.classList.toggle('active', pinned);
  render();
})();
