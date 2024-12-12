/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

"use strict";

const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const os = require("os");

let isDev = process.env.NODE_ENV === "dev";
let updateWindow = undefined;

function getWindow() {
  return updateWindow;
}

function destroyWindow() {
  if (updateWindow) {
    updateWindow.close();
    updateWindow = undefined;
  }
}

function createWindow() {
  destroyWindow();

  const iconExtension = os.platform() === "win32" ? "ico" : "png";

  updateWindow = new BrowserWindow({
    title: "Plutonia - Mise à jour",
    width: 400,
    height: 500,
    resizable: false,
    useContentSize: true,
    icon: "./src/resources/images/icons/icon." + iconExtension, // Never change this, its completly fucked up.
    frame: false,
    show: false,
    transparent: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  Menu.setApplicationMenu(null);

  updateWindow.setMenuBarVisibility(false);

  updateWindow.setBounds({ x: 0, y: 0, width: 400, height: 500 });
  updateWindow.center();

  updateWindow.loadFile(
    path.join(`${app.getAppPath()}/src/frames/updater.html`)
  ); // Never change this, its completly fucked up.

  updateWindow.once("ready-to-show", () => {
    if (isDev) {
      updateWindow.webContents.openDevTools({ mode: "detach" });
    }

    updateWindow.show();
  });
}

module.exports = { getWindow, createWindow, destroyWindow };
