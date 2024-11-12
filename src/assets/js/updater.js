"use strict";

const { ipcRenderer } = require("electron");
const os = require("os");

class Splash {
  constructor() {
    this.initElements();
    this.registerListeners();
  }

  initElements() {
    this.splash = document.querySelector(".splash-logo");
    this.message = document.querySelector(".message");
    this.progress = document.querySelector(".progress");
  }

  registerListeners() {
    document.addEventListener("DOMContentLoaded", async () => {
      this.applySplashAnimation();
    });
  }

  async applySplashAnimation() {
    const animations = [
      () => this.splash.classList.add("opacity"),
      () => this.splash.classList.add("translate"),
      () => this.message.classList.add("opacity"),
    ];

    document.querySelector("#splash").style.display = "block";

    for (const animate of animations) {
      await sleep(500);
      animate();
    }

    this.startUpdate();
  }

  async startUpdate() {
    this.setMessage("Recherche de mise à jour...");

    ipcRenderer
      .invoke("update-app")
      .then()
      .catch((error) => {
        console.log("Error happened during update: " + error.message);

        return this.setMessageAndClose(
          "<span style='color: red;'>Une erreur est survenue lors de la mise à jour.</span>"
        );
      });

    ipcRenderer.on("updateAvailable", async () => {
      // Need code signing for it to works.
      if (os.platform() == "darwin") {
        this.setMessage(
          "<span style='color: red;'>Une mise à jour est disponible, veuillez re-télécharger notre lanceur !</span>"
        );

        await sleep(5000);
        this.startLauncher();
      } else {
        this.setMessage("Téléchargement de la mise à jour...");
        ipcRenderer.send("start-update");
      }

      return;
    });

    ipcRenderer.on("error", (event, error) => {
      if (error) {
        console.log("Error happened during update: " + error.message);
        return this.setMessageAndClose(
          "<span style='color: red;'>Une erreur est survenue lors de la mise à jour.</span>"
        );
      }
    });

    ipcRenderer.on("download-progress", (event, progress) => {
      let percents = Math.round((progress.transferred / progress.total) * 100);

      console.log("Downloading update... (total: " + percents + "%)");
      return this.setMessage("Téléchargement en cours... (" + percents + "%)");
    });

    ipcRenderer.on("update-not-available", () => {
      console.log("The launcher is currently up to date.");
      this.setMessage("Votre lanceur est à jour !");
      return this.startLauncher();
    });
  }

  startLauncher() {
    ipcRenderer.send("main-window-open");
    ipcRenderer.send("update-window-close");
  }

  setMessage(message) {
    this.message.innerHTML = message;
  }

  setMessageAndClose(message) {
    let countdown = 10;

    const intervalId = setInterval(() => {
      this.setMessage(
        message +
          "<br>Fermeture dans " +
          countdown +
          " seconde" +
          (countdown > 1 ? "s" : "") +
          "...</br>"
      );
      countdown--;

      if (countdown < 0) {
        clearInterval(intervalId);
        ipcRenderer.send("update-window-close");
      }
    }, 1000);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

new Splash();
