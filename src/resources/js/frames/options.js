"use strict";

const { ipcRenderer } = require("electron");

const ramSelector = document.querySelector("#memory-select");

const tabbyChat = document.querySelector("#enable-tabbychat");
const preRelease = document.querySelector("#enable-prerelease");

const confirmButton = document.querySelector(".confirm-button");

/* Listeners */
confirmButton.addEventListener("click", () => saveOptions());

window.addEventListener("load", async () => loadOptions());
/* Listeners */

const OPTIONS_FILE_NAME = "options.json";

/* Load Options from File */
async function loadOptions() {
  const options = await ipcRenderer.invoke("get-from-file", OPTIONS_FILE_NAME);

  if (options) {
    ramSelector.value = options.ram;
    preRelease.checked = options.prerelease;

    if (options.modules) {
      tabbyChat.checked = options.modules.tabbychat;
    }
  }
}

/* Save Options to File */
function saveOptions() {
  const datas = {
    ram: ramSelector.value,
    prerelease: preRelease.checked,

    modules: {
      tabbychat: tabbyChat.checked,
    },
  };

  ipcRenderer.send("save-to-file", OPTIONS_FILE_NAME, datas);
  ipcRenderer.send("hide-options");
}
