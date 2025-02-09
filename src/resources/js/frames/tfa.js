"use strict";

const { ipcRenderer } = require("electron");

const codeInput = document.querySelector("#code-input");
const confirmButton = document.querySelector(".confirm-button");

/* Listeners */
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    confirmButton.click();
  }
});

confirmButton.addEventListener("click", () => {
  ipcRenderer.send("tfa-confirm", codeInput.value);
  codeInput.value = "";
});
/* Listeners */
