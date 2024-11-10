/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const os = require('os');

let isDev = process.env.NODE_ENV === 'dev';
let mainWindow = undefined;

function getWindow() {
  return mainWindow;
}

function destroyWindow() {
  if (mainWindow) {
    app.quit();
    mainWindow = undefined;
  }
}

function createWindow() {
  destroyWindow();

  const iconExtension = os.platform() === 'win32' ? 'ico' : 'png';

  mainWindow = new BrowserWindow({
    title: 'Plutonia - Launcher',
    width: 761,
    height: 824,
    resizable: false,
    useContentSize: true,
    icon: './src/assets/images/icon.' + iconExtension,
    frame: false,
    show: false,
    transparent: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(`${app.getAppPath()}/src/launcher.html`));

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }

      mainWindow.show();
    }
  });
}

module.exports = { getWindow, createWindow, destroyWindow };
