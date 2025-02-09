"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");

let tfaWindow = undefined;

let forceClose = false;
let isDev = process.env.NODE_ENV === "dev";

function destroyWindow() {
  if (tfaWindow) {
    forceClose = true;

    tfaWindow.close();
    tfaWindow = undefined;
  }
}

function createWindow() {
  destroyWindow();

  const iconExtension = os.platform() === "win32" ? "ico" : "png";

  tfaWindow = new BrowserWindow({
    title: "Double authentification",
    width: 275,
    height: 160,
    icon: "./src/resources/images/icons/icon." + iconExtension, // Never change this, its completly fucked up.
    show: false,
    resizable: false,
    modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  tfaWindow.loadFile(path.join(`${app.getAppPath()}/src/frames/tfa.html`)); // Never change this, its completly fucked up.

  tfaWindow.on("close", (event) => {
    if (!forceClose) {
      event.preventDefault();
    }

    hideWindow();
  });

  tfaWindow.once("ready-to-show", () => {
    /* if (isDev) {
      tfaWindow.webContents.openDevTools({ mode: 'detach' });
    } */
  });

  return tfaWindow;
}

function showWindow() {
  if (tfaWindow) {
    tfaWindow.show();
  }

  return tfaWindow;
}

function hideWindow() {
  if (tfaWindow) {
    tfaWindow.hide();
  }

  return tfaWindow;
}

module.exports = { createWindow, showWindow, hideWindow, destroyWindow };
