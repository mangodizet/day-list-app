const { app, BrowserWindow, ipcMain, Tray, Menu, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

const dataPath = path.join(app.getPath('userData'), 'data.json');
const backupPath = path.join(app.getPath('userData'), 'data.bak.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// 저장 도중 전원이 꺼져도 파일이 반쯤 쓰인 채로 남지 않도록 임시 파일에 쓴 뒤 교체한다.
function writeJsonAtomic(file, obj) {
  const json = JSON.stringify(obj, null, 2);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, json, 'utf-8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    // 백신 등이 파일을 잡고 있어 교체가 막히면 직접 쓴다
    fs.writeFileSync(file, json, 'utf-8');
    fs.rmSync(tmp, { force: true });
  }
}

function loadData() {
  if (!fs.existsSync(dataPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (err) {
    // 깨진 파일은 덮어쓰기 전에 따로 보관하고, 마지막 정상 백업으로 복구한다
    console.error('data.json 읽기 실패, 백업으로 복구합니다:', err);
    fs.copyFileSync(dataPath, path.join(app.getPath('userData'), `data.corrupt-${Date.now()}.json`));
    let recovered = {};
    try { recovered = JSON.parse(fs.readFileSync(backupPath, 'utf-8')); } catch {}
    writeJsonAtomic(dataPath, recovered);
    return recovered;
  }
}

function saveData(data) {
  // 날짜만 열어봐서 생긴 빈 목록은 저장하지 않는다 (파일이 계속 불어나는 것 방지)
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length === 0 && key !== 'longTerm') continue;
    clean[key] = value;
  }
  if (fs.existsSync(dataPath)) fs.copyFileSync(dataPath, backupPath);
  writeJsonAtomic(dataPath, clean);
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  writeJsonAtomic(settingsPath, settings);
}

// 저장된 창 위치가 지금 연결된 모니터 밖이면(보조 모니터 분리 등) 버리고 기본 위치를 쓴다.
function visibleBounds(bounds) {
  if (!bounds) return null;
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
    bounds.x < a.x + a.width - 40 && bounds.x + bounds.width > a.x + 40
    && bounds.y >= a.y - 10 && bounds.y < a.y + a.height - 40);
  return onScreen ? bounds : null;
}

// 업데이트 안내문 링크 등을 눌러도 앱 창이 외부 페이지로 바뀌지 않게 막고 기본 브라우저로 연다.
function lockNavigation(win) {
  const openExternal = (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); openExternal(url); });
}

let mainWindow;
let miniWindow;
let tray;
let isQuitting = false;

function createWindow() {
  const settings = loadSettings();
  const bounds = visibleBounds(settings.bounds);

  mainWindow = new BrowserWindow({
    width: bounds ? bounds.width : 420,
    height: bounds ? bounds.height : 680,
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    center: !bounds,
    minWidth: 360,
    minHeight: 480,
    autoHideMenuBar: true,
    backgroundColor: '#F6F4EF',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#EFEBE2',
      symbolColor: '#1E2124',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  lockNavigation(mainWindow);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  let saveBoundsTimer;
  function scheduleSaveBounds() {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      const s = loadSettings();
      s.bounds = mainWindow.getBounds();
      saveSettings(s);
    }, 400);
  }
  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);

  mainWindow.on('close', (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createMiniWindow() {
  if (miniWindow) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }
  const settings = loadSettings();
  const bounds = visibleBounds(settings.miniBounds);
  const pinned = !!settings.miniPinned;

  miniWindow = new BrowserWindow({
    width: bounds ? bounds.width : 260,
    height: bounds ? bounds.height : 340,
    x: bounds ? bounds.x : undefined,
    y: bounds ? bounds.y : undefined,
    minWidth: 200,
    minHeight: 220,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: pinned,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  lockNavigation(miniWindow);
  miniWindow.loadFile(path.join(__dirname, 'renderer', 'mini.html'));

  let saveMiniBoundsTimer;
  function scheduleSaveMiniBounds() {
    clearTimeout(saveMiniBoundsTimer);
    saveMiniBoundsTimer = setTimeout(() => {
      const s = loadSettings();
      s.miniBounds = miniWindow.getBounds();
      saveSettings(s);
    }, 400);
  }
  miniWindow.on('resize', scheduleSaveMiniBounds);
  miniWindow.on('move', scheduleSaveMiniBounds);
  miniWindow.on('closed', () => {
    miniWindow = null;
    if (mainWindow && !isQuitting) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function enterMiniMode() {
  createMiniWindow();
  if (mainWindow) mainWindow.hide();
}

function exitMiniMode() {
  if (miniWindow) {
    miniWindow.close();
  } else if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'build', 'icon.ico'));
  } catch (err) {
    console.error('트레이 아이콘 생성 실패, 트레이 최소화를 비활성화합니다:', err);
    tray = null;
    return;
  }
  tray.setToolTip('오늘할일');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '메인 창 열기', click: () => exitMiniMode() },
    { label: '미니 모드', click: () => enterMiniMode() },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => {
    if (miniWindow) { exitMiniMode(); return; }
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (e, data) => {
  saveData(data);
  BrowserWindow.getAllWindows().forEach((w) => {
    if (w.webContents.id !== e.sender.id) w.webContents.send('data-changed');
  });
  return true;
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-settings', () => ({
  autoLaunch: app.getLoginItemSettings().openAtLogin,
}));
ipcMain.handle('set-auto-launch', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('enter-mini-mode', () => { enterMiniMode(); return true; });
ipcMain.handle('exit-mini-mode', () => { exitMiniMode(); return true; });
ipcMain.handle('get-mini-opacity', () => {
  const s = loadSettings();
  return typeof s.miniOpacity === 'number' ? s.miniOpacity : 0.92;
});
ipcMain.handle('set-mini-opacity', (_e, value) => {
  const v = Math.min(1, Math.max(0.3, Number(value) || 1));
  const s = loadSettings();
  s.miniOpacity = v;
  saveSettings(s);
  return v;
});
ipcMain.handle('get-mini-pinned', () => !!loadSettings().miniPinned);
ipcMain.handle('set-mini-pinned', (_e, pinned) => {
  const v = !!pinned;
  if (miniWindow) miniWindow.setAlwaysOnTop(v);
  const s = loadSettings();
  s.miniPinned = v;
  saveSettings(s);
  return v;
});

autoUpdater.autoDownload = false;

function sendUpdateStatus(status, extra) {
  if (mainWindow) mainWindow.webContents.send('update-status', { status, ...extra });
}
autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', {
  version: info.version,
  releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
}));
autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: err.message }));
autoUpdater.on('download-progress', (p) => sendUpdateStatus('downloading', { percent: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', () => {
  sendUpdateStatus('downloaded');
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', () => {
  if (!app.isPackaged) {
    sendUpdateStatus('dev-mode');
    return;
  }
  autoUpdater.checkForUpdates().catch(() => {}); // 실패는 'error' 이벤트로 화면에 표시됨
});
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate().catch(() => {}));

app.on('second-instance', () => {
  if (miniWindow) exitMiniMode();
  else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

// 1.1.x에서 앱 이름을 하루정리 → 오늘할일로 바꾸면서 exe 파일명이 달라졌으므로,
// 옛 exe로 등록된 Windows 자동 실행 항목이 있으면 새 exe로 옮긴다.
function migrateAutoLaunchFromOldName() {
  const oldName = 'electron.app.하루정리';
  const regExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  try {
    execFileSync(regExe, ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', oldName], { stdio: 'ignore' });
  } catch {
    return; // 옛 항목 없음
  }
  app.setLoginItemSettings({ openAtLogin: false, name: oldName });
  app.setLoginItemSettings({ openAtLogin: true });
}

app.whenReady().then(() => {
  if (app.isPackaged) migrateAutoLaunchFromOldName();
  createWindow();
  createTray();
  if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); // 실패는 'error' 이벤트로 화면에 표시됨
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
