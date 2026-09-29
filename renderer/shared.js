// 메인/미니 창 공용 헬퍼
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

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatShort(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}월 ${d}일` : `${y}. ${m}. ${d}.`;
}

// 장기 일정: 기간(start~end) 동안만 표시하고 이월하지 않는다. end가 지나도 미완료면
// 완료 체크할 때까지 오늘까지 하루씩 이어서 표시(이월)된다.
function longTermsOn(data, dateKey, today) {
  const list = Array.isArray(data.longTerm) ? data.longTerm : [];
  return list.filter(lt => {
    const last = lt.done ? (lt.doneDate || lt.end) : today;
    const visibleEnd = last > lt.end ? last : lt.end;
    return lt.start <= dateKey && dateKey <= visibleEnd;
  });
}
