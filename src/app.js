const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const os = require('os');

const path = require('path');
const fs = require('fs-extra');

const UpdateWindow = require('./assets/js/windows/updateWindow.js');
const MainWindow = require('./assets/js/windows/launcherWindow.js');

const OptionWindow = require('./assets/js/windows/childs/optionWindow.js');
const TfaWindow = require('./assets/js/windows/childs/tfaWindow.js');

let isDev = process.env.NODE_ENV === 'dev';

if (isDev) {
  let appPath = path.resolve('./data/userdata').replace(/\\/g, '/');
  let appdata = path.resolve('./data/appdata').replace(/\\/g, '/');

  if (!fs.existsSync(appPath)) {
    fs.mkdirSync(appPath, { recursive: true });
  }

  if (!fs.existsSync(appdata)) {
    fs.mkdirSync(appdata, { recursive: true });
  }

  app.setPath('userData', appPath);
  app.setPath('appData', appdata);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (isDev) {
      return openMainWindow();
    }

    UpdateWindow.createWindow();
  });
}

/* Listeners */
ipcMain.on('main-window-dev-tools', () =>
  MainWindow.getWindow().webContents.openDevTools({ mode: 'detach' })
);

ipcMain.on('main-window-dev-tools-close', () =>
  MainWindow.getWindow().webContents.closeDevTools()
);

ipcMain.on('main-window-open', () => {
  openMainWindow();
});

ipcMain.on('main-window-close', () => {
  OptionWindow.destroyWindow();
  TfaWindow.destroyWindow();

  MainWindow.destroyWindow();
});

ipcMain.on('update-window-close', () => UpdateWindow.destroyWindow());

ipcMain.handle('require-tfa', async (event, credentials) => {
  const tfaWindow = TfaWindow.showWindow();

  const code = await new Promise((resolve) => {
    tfaWindow.on('closed', () => closeWindow());
    tfaWindow.on('hide', () => closeWindow());

    function closeWindow() {
      ipcMain.removeListener('tfa-confirm', tfaConfirmListener);
      resolve(null);
    }

    const tfaConfirmListener = (event, receivedCode) => {
      resolve(receivedCode);
      TfaWindow.hideWindow();
    };

    ipcMain.once('tfa-confirm', tfaConfirmListener);
  });

  if (!code || code.trim() === '') {
    return { error: true, message: "Le code n'a pas été fourni." };
  }

  return { error: false, code: code };
});

ipcMain.on('show-options', () => {
  OptionWindow.showWindow();
});

ipcMain.on('hide-options', () => OptionWindow.hideWindow());
/* Listeners */

/* Open the main window */
function openMainWindow() {
  OptionWindow.createWindow();
  TfaWindow.createWindow();

  MainWindow.createWindow();
}
/* Open the main window */

/* Datas loading and saving */
ipcMain.handle('get-from-file', (event, file) => {
  try {
    const data = fs.readFileSync(
      path.join(app.getPath('userData'), file),
      'utf-8'
    );

    console.log('File data loaded.');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading file :', error);
  }
});

ipcMain.on('save-to-file', async (event, file, datas) => {
  try {
    fs.writeFileSync(
      path.join(app.getPath('userData'), file),
      JSON.stringify(datas, null, 2),
      'utf8'
    );

    console.log(`File saved successfully. (${file})`);
  } catch (error) {
    console.error('An error occurred while saving the file :', error);
  }
});
/* Datas loading and saving */

/* Directories */
ipcMain.handle('userData', () => app.getPath('userData'));

ipcMain.handle('appData', () => {
  return getLauncherPath();
});

function getLauncherPath() {
  const appData = app.getPath('appData');

  return path.join(
    appData,
    (os.platform() !== 'darwin' ? '.' : '') + 'plutonia'
  );
}

/* Directories */

/* Updater listeners */
autoUpdater.autoDownload = false;

ipcMain.on('start-update', () => autoUpdater.downloadUpdate());

ipcMain.handle('update-app', async () => {
  return await new Promise(async (resolve, reject) => {
    autoUpdater
      .checkForUpdates()
      .then((res) => {
        resolve(res);
      })
      .catch((error) => {
        reject({
          error: true,
          message: error,
        });
      });
  });
});
/* Updater listeners */

/* Updater messaging */
autoUpdater.on('update-available', () => {
  const updateWindow = UpdateWindow.getWindow();

  if (updateWindow) {
    updateWindow.webContents.send('updateAvailable');
  }
});

autoUpdater.on('update-not-available', () => {
  const updateWindow = UpdateWindow.getWindow();

  if (updateWindow) {
    updateWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall());

autoUpdater.on('download-progress', (progress) => {
  const updateWindow = UpdateWindow.getWindow();

  if (updateWindow) {
    updateWindow.webContents.send('download-progress', progress);
  }
});

autoUpdater.on('error', (err) => {
  const updateWindow = UpdateWindow.getWindow();

  if (updateWindow) {
    updateWindow.webContents.send('error', err);
  }
});
/* Updater messaging */

/* App clean close */
app.on('window-all-closed', () => app.quit());