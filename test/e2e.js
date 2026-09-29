const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const testDataPath = path.join(__dirname, 'test-data.json');
const target = path.join(__dirname, '..', 'renderer', 'index.html');

function loadData() {
  try { return JSON.parse(fs.readFileSync(testDataPath, 'utf-8')); } catch { return {}; }
}
function saveData(data) { fs.writeFileSync(testDataPath, JSON.stringify(data, null, 2)); }
function writeData(obj) { saveData(obj); }
function cleanup() { if (fs.existsSync(testDataPath)) fs.unlinkSync(testDataPath); }
function todayKeyForTest() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (_e, data) => { saveData(data); return true; });

ipcMain.handle('get-mini-opacity', () => 0.92);
ipcMain.handle('get-mini-pinned', () => false);
ipcMain.handle('get-settings', () => ({ autoLaunch: app.getLoginItemSettings().openAtLogin }));
ipcMain.handle('set-auto-launch', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});

const results = [];
function check(name, cond) { results.push({ name, pass: !!cond }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  cleanup();
  app.setLoginItemSettings({ openAtLogin: false }); // 이전 실행에서 남은 상태 초기화

  // 화면 밖 좌표 + 포커스 불가 창 하나만 생성해서 재사용 (사용자 마우스/포커스 방해 없음)
  const win = new BrowserWindow({
    x: -3000,
    y: -3000,
    width: 420,
    height: 680,
    show: true,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const wc = win.webContents;
  await win.loadFile(target);

  // --- 시나리오 1: 할 일 추가 / 완료 체크 / 종료 확인 흐름 ---
  let listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('초기 상태: 빈 목록 안내 문구 표시', listText.includes('입력해보세요'));

  await wc.executeJavaScript(`
    document.getElementById('taskInput').value = '테스트 작업 A';
    window.addTask();
    document.getElementById('taskInput').value = '테스트 작업 B';
    window.addTask();
  `);
  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('할 일 2개 추가됨', listText.includes('테스트 작업 A') && listText.includes('테스트 작업 B'));

  await wc.executeJavaScript(`document.querySelectorAll('.item')[0].querySelector('.check').click()`);
  let progress = await wc.executeJavaScript(`document.getElementById('progressLabel').textContent`);
  check('체크 시 완료 카운트 1/2로 반영', progress.trim() === '1/2 완료');

  // --- 시나리오 2: 수동 이월 버튼 ---
  cleanup();
  await win.loadFile(target);
  await wc.executeJavaScript(`
    document.getElementById('taskInput').value = '수동이월 테스트';
    window.addTask();
  `);
  let carryDisabled = await wc.executeJavaScript(`document.getElementById('carryBtn').disabled`);
  check('미완료 항목 있으면 이월 버튼 활성화', carryDisabled === false);
  await wc.executeJavaScript(`document.getElementById('carryBtn').click()`);
  await sleep(50);
  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('수동 이월 클릭 시 오늘 목록에서 항목 사라짐', !listText.includes('수동이월 테스트'));
  carryDisabled = await wc.executeJavaScript(`document.getElementById('carryBtn').disabled`);
  check('미완료 항목 없으면 이월 버튼 비활성화', carryDisabled === true);

  // --- 시나리오 2.5: 날짜가 바뀌었을 때 이전 활성 날짜의 미완료 항목 이월 확인 ---
  cleanup();
  writeData({
    '2020-01-01': [
      { id: 'r1', text: '이월 확인용 할 일', done: false, carriedFrom: null },
      { id: 'r2', text: '완료된 일', done: true, carriedFrom: null },
    ],
  });
  await wc.executeJavaScript(`localStorage.setItem('lastActiveDate', '2020-01-01')`);
  await win.loadFile(target);
  await sleep(200);

  let rolloverShown = await wc.executeJavaScript(`document.getElementById('rolloverModalLayer').classList.contains('show')`);
  check('이전 활성 날짜에 미완료 항목 있으면 시작 시 이월 확인 모달 표시', rolloverShown);

  let rolloverText = await wc.executeJavaScript(`document.getElementById('rolloverList').textContent`);
  check('이월 확인 모달에 미완료 항목만 표시(완료된 일 제외)', rolloverText.includes('이월 확인용 할 일') && !rolloverText.includes('완료된 일'));

  await wc.executeJavaScript(`document.getElementById('rolloverYes').click()`);
  await sleep(50);
  rolloverShown = await wc.executeJavaScript(`document.getElementById('rolloverModalLayer').classList.contains('show')`);
  check('예 클릭 시 모달 닫힘', !rolloverShown);

  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('예 클릭 시 이월 항목이 오늘 목록에 표시됨', listText.includes('이월 확인용 할 일'));

  const todayStr = todayKeyForTest();
  const rolledData = loadData();
  const carried = (rolledData[todayStr] || []).find(t => t.text === '이월 확인용 할 일');
  check('이월된 항목에 원본 날짜(carriedFrom) 기록됨', !!carried && carried.carriedFrom === '2020-01-01');
  check('완료된 항목은 이월되지 않고 과거 날짜에 남음', rolledData['2020-01-01'].some(t => t.text === '완료된 일'));

  cleanup();
  writeData({ '2020-02-02': [{ id: 'n1', text: '이월 거부 테스트', done: false, carriedFrom: null }] });
  await wc.executeJavaScript(`localStorage.setItem('lastActiveDate', '2020-02-02')`);
  await win.loadFile(target);
  await sleep(200);
  await wc.executeJavaScript(`document.getElementById('rolloverNo').click()`);
  await sleep(50);
  rolloverShown = await wc.executeJavaScript(`document.getElementById('rolloverModalLayer').classList.contains('show')`);
  check('아니요 클릭 시 모달만 닫히고 이월 안 됨', !rolloverShown);
  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('아니요 클릭 시 오늘 목록에 항목 추가 안 됨', !listText.includes('이월 거부 테스트'));
  const afterNoData = loadData();
  check('아니요 클릭 시 과거 날짜에 항목 그대로 남음', afterNoData['2020-02-02'].some(t => t.text === '이월 거부 테스트' && !t.done));

  // --- 시나리오 3: 날짜 화살표 이동 / 날짜 직접 선택 ---
  cleanup();
  writeData({
    '2020-01-01': [{ id: 'x1', text: '과거 할 일', done: false, carriedFrom: null }],
    '2020-01-03': [{ id: 'x2', text: '미래 할 일', done: false, carriedFrom: null }],
  });
  await win.loadFile(target);

  await wc.executeJavaScript(`
    document.getElementById('datePicker').value = '2020-01-01';
    document.getElementById('datePicker').dispatchEvent(new Event('change'));
  `);
  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('날짜 선택으로 특정 날짜 목록 조회', listText.includes('과거 할 일'));
  let dateLabel = await wc.executeJavaScript(`document.getElementById('todayLabel').textContent`);
  check('날짜 선택 후 헤더 라벨도 해당 날짜로 갱신', dateLabel.includes('1월 1일'));
  let jumpVisible = await wc.executeJavaScript(`getComputedStyle(document.getElementById('todayJumpBtn')).display !== 'none'`);
  check('오늘이 아닌 날짜를 보면 오늘로 이동 버튼 노출', jumpVisible);

  await wc.executeJavaScript(`document.getElementById('nextDayBtn').click()`);
  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('다음 날 화살표 클릭 시 하루 뒤 목록으로 이동', listText.includes('입력해보세요'));
  dateLabel = await wc.executeJavaScript(`document.getElementById('todayLabel').textContent`);
  check('다음 날 화살표가 정확히 하루만 이동', dateLabel.includes('1월 2일'));

  await wc.executeJavaScript(`document.getElementById('nextDayBtn').click()`);
  listText = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('한번 더 다음 날 이동 시 미래 할 일 표시', listText.includes('미래 할 일'));

  await wc.executeJavaScript(`document.getElementById('prevDayBtn').click()`);
  await wc.executeJavaScript(`document.getElementById('prevDayBtn').click()`);
  dateLabel = await wc.executeJavaScript(`document.getElementById('todayLabel').textContent`);
  check('이전 날 화살표로 되돌아가기', dateLabel.includes('1월 1일'));

  await wc.executeJavaScript(`document.getElementById('todayJumpBtn').click()`);
  jumpVisible = await wc.executeJavaScript(`getComputedStyle(document.getElementById('todayJumpBtn')).display !== 'none'`);
  check('오늘로 이동 클릭 시 오늘 날짜로 복귀(버튼 다시 숨김)', !jumpVisible);


  // --- 시나리오 3.5: 드래그로 순서 변경 + 순위 번호 ---
  cleanup();
  await win.loadFile(target);
  await wc.executeJavaScript(`
    document.getElementById('taskInput').value = '순서 A';
    window.addTask();
    document.getElementById('taskInput').value = '순서 B';
    window.addTask();
    document.getElementById('taskInput').value = '순서 C';
    window.addTask();
  `);
  let order = await wc.executeJavaScript(`Array.from(document.querySelectorAll('.item-text')).map(e => e.textContent).join(',')`);
  check('추가한 순서대로 목록 표시', order === '순서 A,순서 B,순서 C');
  let ranks = await wc.executeJavaScript(`Array.from(document.querySelectorAll('.rank')).map(e => e.textContent).join(',')`);
  check('위에서부터 1,2,3 순위 번호 표시', ranks === '1,2,3');

  await wc.executeJavaScript(`
    const items = document.querySelectorAll('.item');
    const startRect = items[0].getBoundingClientRect();
    const targetRect = items[2].getBoundingClientRect();
    const startX = startRect.left + 10;
    const startY = startRect.top + startRect.height / 2;
    const belowMidY = targetRect.top + targetRect.height * 0.9;
    items[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: startX, clientY: startY, button: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX, clientY: startY + 20 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: startX, clientY: belowMidY }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: startX, clientY: belowMidY }));
  `);
  order = await wc.executeJavaScript(`Array.from(document.querySelectorAll('.item-text')).map(e => e.textContent).join(',')`);
  check('드래그로 맨 위 항목을 마지막 항목 아래에 놓으면 맨 뒤로 이동', order === '순서 B,순서 C,순서 A');
  ranks = await wc.executeJavaScript(`Array.from(document.querySelectorAll('.rank')).map(e => e.textContent).join(',')`);
  check('순서 변경 후 순위 번호도 다시 1,2,3으로 갱신', ranks === '1,2,3');

  const savedData = loadData();
  const savedOrder = savedData[Object.keys(savedData)[0]].map(t => t.text).join(',');
  check('변경된 순서가 저장 데이터에도 반영됨', savedOrder === '순서 B,순서 C,순서 A');

  // --- 시나리오 3.7: 장기 일정 + 달력 ---
  cleanup();
  writeData({
    longTerm: [
      { id: 'l1', text: '마감지난 미완료', start: '2020-01-01', end: '2020-01-05', done: false, doneDate: null },
      { id: 'l2', text: '마감지난 완료', start: '2020-01-01', end: '2020-01-05', done: true, doneDate: '2020-01-04' },
      { id: 'l3', text: '먼 미래 일정', start: '2099-01-01', end: '2099-01-10', done: false, doneDate: null },
    ],
  });
  await win.loadFile(target);
  await sleep(100);
  let ltText = await wc.executeJavaScript(`document.getElementById('ltList').textContent`);
  check('기간 지난 미완료 장기 일정은 오늘로 이월되어 표시', ltText.includes('마감지난 미완료') && ltText.includes('일 지남'));
  check('기간 지난 완료 장기 일정은 오늘 표시 안 됨', !ltText.includes('마감지난 완료'));
  check('기간 전 장기 일정은 오늘 표시 안 됨', !ltText.includes('먼 미래 일정'));
  let listTextLt = await wc.executeJavaScript(`document.getElementById('list').textContent`);
  check('장기 일정은 하루 할 일 목록과 분리', !listTextLt.includes('마감지난'));

  await wc.executeJavaScript(`
    document.getElementById('datePicker').value = '2020-01-03';
    document.getElementById('datePicker').dispatchEvent(new Event('change'));
  `);
  ltText = await wc.executeJavaScript(`document.getElementById('ltList').textContent`);
  check('기간 중인 날짜에는 이월 표시 없이 둘 다 표시', ltText.includes('마감지난 미완료') && ltText.includes('마감지난 완료') && !ltText.includes('일 지남'));

  await wc.executeJavaScript(`document.getElementById('todayJumpBtn').click()`);
  await wc.executeJavaScript(`document.querySelector('#ltList .lt-item .check').click()`);
  ltText = await wc.executeJavaScript(`document.getElementById('ltList').textContent`);
  check('이월 중인 장기 일정 완료 체크 시 오늘까지만 남음(완료 표시)', ltText.includes('마감지난 미완료'));
  check('완료 체크 시 doneDate 오늘로 저장', loadData().longTerm.find(l => l.id === 'l1').doneDate === todayKeyForTest());
  await wc.executeJavaScript(`
    document.getElementById('datePicker').value = '2099-12-31';
    document.getElementById('datePicker').dispatchEvent(new Event('change'));
  `);
  ltText = await wc.executeJavaScript(`document.getElementById('ltList').textContent`);
  check('완료한 뒤로는 더 이상 이월 안 됨', !ltText.includes('마감지난 미완료'));

  await wc.executeJavaScript(`document.getElementById('todayJumpBtn').click()`);
  await wc.executeJavaScript(`
    document.getElementById('ltAddBtn').click();
    document.getElementById('ltText').value = '새 장기 일정';
    document.getElementById('ltStart').value = '2020-03-10';
    document.getElementById('ltEnd').value = '2020-03-01';
    document.getElementById('ltSaveBtn').click();
  `);
  let ltErr = await wc.executeJavaScript(`document.getElementById('ltError').textContent`);
  check('종료일이 시작일보다 빠르면 에러 표시, 저장 안 됨', ltErr.length > 0 && loadData().longTerm.length === 3);
  const todayT = todayKeyForTest();
  await wc.executeJavaScript(`
    document.getElementById('ltStart').value = '${todayT}';
    document.getElementById('ltEnd').value = '2099-01-01';
    document.getElementById('ltSaveBtn').click();
  `);
  const addedLt = loadData().longTerm.find(l => l.text === '새 장기 일정');
  check('장기 일정 추가 시 시작/종료일 저장', !!addedLt && addedLt.start === todayT && addedLt.end === '2099-01-01');
  let ltModalShown = await wc.executeJavaScript(`document.getElementById('ltModalLayer').classList.contains('show')`);
  check('추가 후 모달 닫힘', !ltModalShown);

  await wc.executeJavaScript(`document.getElementById('calendarBtn').click()`);
  let calInfo = await wc.executeJavaScript(`({
    shown: document.getElementById('calModalLayer').classList.contains('show'),
    cells: document.querySelectorAll('.cal-cell').length,
    todayChip: document.querySelector('.cal-cell.is-today').textContent,
  })`);
  check('달력 아이콘 클릭 시 달력 표시', calInfo.shown && calInfo.cells % 7 === 0 && calInfo.cells >= 28);
  check('달력 오늘 칸에 장기 일정 표시', calInfo.todayChip.includes('새 장기 일정'));
  await wc.executeJavaScript(`document.getElementById('calPrevBtn').click(); document.querySelectorAll('.cal-cell:not(.other)')[0].click();`);
  let afterCal = await wc.executeJavaScript(`({ shown: document.getElementById('calModalLayer').classList.contains('show'), label: document.getElementById('todayLabel').textContent })`);
  const prevMonth = new Date(); prevMonth.setDate(1); prevMonth.setMonth(prevMonth.getMonth() - 1);
  check('달력 날짜 클릭 시 해당 날짜로 이동 후 닫힘', !afterCal.shown && afterCal.label === `${prevMonth.getMonth() + 1}월 1일`);

  // --- 시나리오 3.8: 미니 모드 장기 일정 카테고리 + 달력 ---
  const miniTarget = path.join(__dirname, '..', 'renderer', 'mini.html');
  cleanup();
  writeData({ [todayKeyForTest()]: [{ id: 'm1', text: '미니 할 일', done: false }] });
  await win.loadFile(miniTarget);
  await sleep(150);
  let miniCats = await wc.executeJavaScript(`document.querySelectorAll('.mini-cat').length`);
  check('미니: 오늘 장기 일정 없으면 카테고리 구분 안 함', miniCats === 0);

  writeData({
    [todayKeyForTest()]: [{ id: 'm1', text: '미니 할 일', done: false }],
    longTerm: [{ id: 'ml', text: '미니 장기', start: '2020-01-01', end: '2020-01-02', done: false, doneDate: null }],
  });
  await win.loadFile(miniTarget);
  await sleep(150);
  let miniInfo = await wc.executeJavaScript(`({
    cats: Array.from(document.querySelectorAll('.mini-cat')).map(e => e.textContent).join(','),
    lt: document.querySelector('.mini-item.lt') && document.querySelector('.mini-item.lt').textContent,
  })`);
  check('미니: 장기 일정 있으면 하루 할 일/장기 일정 카테고리로 분리', miniInfo.cats === '하루 할 일,장기 일정');
  check('미니: 기간 지난 장기 일정은 이월 표시', !!miniInfo.lt && miniInfo.lt.includes('미니 장기') && miniInfo.lt.includes('일 지남'));
  await wc.executeJavaScript(`document.querySelector('.mini-item.lt').click()`);
  await sleep(100);
  check('미니: 장기 일정 클릭 시 완료 저장', loadData().longTerm[0].done === true);

  await wc.executeJavaScript(`document.getElementById('miniCalBtn').click()`);
  await sleep(100);
  let miniCal = await wc.executeJavaScript(`({
    calShown: getComputedStyle(document.getElementById('miniCal')).display !== 'none',
    listHidden: getComputedStyle(document.getElementById('miniList')).display === 'none',
    cells: document.querySelectorAll('.mini-cal-cell').length,
    day: document.getElementById('miniCalDayList').textContent,
  })`);
  check('미니: 달력 아이콘 클릭 시 달력 표시, 목록 숨김', miniCal.calShown && miniCal.listHidden && miniCal.cells >= 28);
  check('미니: 달력에 선택 날짜(오늘) 일정 표시', miniCal.day.includes('미니 할 일') && miniCal.day.includes('미니 장기'));
  await wc.executeJavaScript(`document.getElementById('miniCalBtn').click()`);
  let listBack = await wc.executeJavaScript(`getComputedStyle(document.getElementById('miniList')).display !== 'none'`);
  check('미니: 달력 아이콘 다시 누르면 목록으로 복귀', listBack);

  cleanup();
  await win.loadFile(target);
  let mainCats = await wc.executeJavaScript(`Array.from(document.querySelectorAll('.cat-title')).map(e => e.textContent).join(',')`);
  check('메인: 하루 할 일/장기 일정 카테고리 표시', mainCats === '하루 할 일,장기 일정');

  // --- 시나리오 4: 설정 - Windows 자동 실행 체크박스 ---
  await wc.executeJavaScript(`document.getElementById('settingsBtn').click()`);
  await sleep(100);
  let settingsShown = await wc.executeJavaScript(`document.getElementById('settingsModalLayer').classList.contains('show')`);
  check('설정 버튼 클릭 시 설정창 표시', settingsShown);

  let checked = await wc.executeJavaScript(`document.getElementById('autoLaunchCheckbox').checked`);
  check('초기 자동 실행 체크 해제 상태', checked === false);

  await wc.executeJavaScript(`
    document.getElementById('autoLaunchCheckbox').checked = true;
    document.getElementById('autoLaunchCheckbox').dispatchEvent(new Event('change'));
  `);
  await sleep(150);
  check('체크박스 켜면 실제 로그인 항목 설정에 반영됨', app.getLoginItemSettings().openAtLogin === true);

  await wc.executeJavaScript(`
    document.getElementById('autoLaunchCheckbox').checked = false;
    document.getElementById('autoLaunchCheckbox').dispatchEvent(new Event('change'));
  `);
  await sleep(150);
  check('체크박스 끄면 로그인 항목 설정도 해제됨', app.getLoginItemSettings().openAtLogin === false);

  win.destroy();
  cleanup();

  const failed = results.filter(r => !r.pass);
  console.log('');
  results.forEach(r => console.log(`${r.pass ? '[PASS]' : '[FAIL]'} ${r.name}`));
  console.log('');
  console.log(`${results.length}개 중 ${results.length - failed.length}개 통과, ${failed.length}개 실패`);
  app.exit(failed.length ? 1 : 0);
}

app.whenReady().then(run);
