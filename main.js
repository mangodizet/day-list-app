const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

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
}

ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (_e, data) => {
  saveData(data);
  return true;
});
ipcMain.handle('get-settings', () => ({
  autoLaunch: app.getLoginItemSettings().openAtLogin,
}));
ipcMain.handle('set-auto-launch', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});

function sendUpdateStatus(status, extra) {
  if (mainWindow) mainWindow.webContents.send('update-status', { status, ...extra });
}
autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info.version }));
autoUpdater.on('update-not-available', () => sendUpdateStatus('not-available'));
autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: err.message }));

ipcMain.handle('check-for-updates', () => {
  if (!app.isPackaged) {
    sendUpdateStatus('dev-mode');
    return;
  }
  autoUpdater.checkForUpdatesAndNotify();
});

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
