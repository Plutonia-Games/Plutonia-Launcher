const { ipcRenderer } = require('electron');

const codeInput = document.querySelector('#code-input');
const confirmButton = document.querySelector('.confirm-button');

/* Listeners */
confirmButton.addEventListener('click', () => {
  ipcRenderer.send('tfa-confirm', codeInput.value);
  codeInput.value = '';
});
/* Listeners */
