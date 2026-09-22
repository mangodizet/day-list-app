const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

const dataPath = path.join(app.getPath('userData'), 'data.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

let mainWindow;
let miniWindow;
let tray;
let isQuitting = false;

function createWindow() {
  const settings = loadSettings();
  const bounds = settings.bounds;

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
  const bounds = settings.miniBounds;
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
  tray.setToolTip('하루정리');
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
  autoUpdater.checkForUpdates();
});
ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());

app.on('second-instance', () => {
  if (miniWindow) exitMiniMode();
  else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  if (app.isPackaged) autoUpdater.checkForUpdates();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
