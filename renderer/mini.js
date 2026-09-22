function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const today = todayKey();
const [, todayM, todayD] = today.split('-').map(Number);

const dateLabel = document.getElementById('miniDateLabel');
const listEl = document.getElementById('miniList');
const progressEl = document.getElementById('miniProgress');
const closeBtn = document.getElementById('miniCloseBtn');
const pinBtn = document.getElementById('miniPinBtn');
const opacityRange = document.getElementById('miniOpacityRange');
const opacityValue = document.getElementById('miniOpacityValue');

dateLabel.textContent = `${todayM}월 ${todayD}일 할 일`;

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function toggleDone(taskId) {
  const fresh = await window.api.loadData();
  const list = fresh[today] || [];
  const target = list.find((t) => t.id === taskId);
  if (!target) return;
  target.done = !target.done;
  await window.api.saveData(fresh);
  render();
}

async function render() {
  const data = await window.api.loadData();
  const tasks = data[today] || [];

  listEl.innerHTML = '';
  if (tasks.length === 0) {
    listEl.innerHTML = '<div class="mini-empty">오늘 할 일이 없어요</div>';
  }
  tasks.forEach((t) => {
    const li = document.createElement('li');
    li.className = 'mini-item' + (t.done ? ' done' : '');
    li.innerHTML = `
      <span class="mini-check">${t.done ? '✓' : ''}</span>
      <span class="mini-item-text">${escapeHtml(t.text)}</span>
    `;
    li.onclick = () => toggleDone(t.id);
    listEl.appendChild(li);
  });

  const done = tasks.filter((t) => t.done).length;
  progressEl.textContent = tasks.length ? `${done}/${tasks.length} 완료` : '';
}

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
