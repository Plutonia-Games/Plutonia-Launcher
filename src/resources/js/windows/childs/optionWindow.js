"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");

let optionsWindow = undefined;

let forceClose = false;
let isDev = process.env.NODE_ENV === "dev";

function destroyWindow() {
  if (optionsWindow) {
    forceClose = true;

    optionsWindow.close();
    optionsWindow = undefined;
  }
}

function createWindow() {
  destroyWindow();

  const iconExtension = os.platform() === "win32" ? "ico" : "png";

  optionsWindow = new BrowserWindow({
    title: "Options",
    width: 275,
    height: 225,
    icon: "./src/resources/images/icons/icon." + iconExtension, // Never change this, its completly fucked up.
    show: false,
    resizable: false,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  optionsWindow.loadFile(
    path.join(app.getAppPath() + "/src/frames/options.html")
  ); // Never change this, its completly fucked up.

  optionsWindow.on("close", (event) => {
    if (!forceClose) {
      event.preventDefault();
    }

    hideWindow();
  });

  optionsWindow.once("ready-to-show", () => {
    /* if (isDev) {
      optionsWindow.webContents.openDevTools({ mode: 'detach' });
    } */
  });
}

function showWindow() {
  if (optionsWindow) {
    optionsWindow.show();
  }

  return optionsWindow;
}

function hideWindow() {
  if (optionsWindow) {
    optionsWindow.hide();
  }

  return optionsWindow;
}

module.exports = { createWindow, showWindow, hideWindow, destroyWindow };
