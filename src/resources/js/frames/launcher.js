"use strict";

/* Fix undici */
const { setTimeout, clearTimeout } = require("timers");

global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
/* Fix undici */

/* Imports */
const { ipcRenderer } = require("electron");

const path = require("path");
const fs = require("fs");

const AuthWorker = require("../resources/js/workers/auth-worker.js");
const authWorker = new AuthWorker();

const {
  JavaDownloadTask,
  JavaExtractTask,
} = require("../resources/js/workers/java-worker.js");

const {
  installLibrariesTask,
  installAssetsTask,
  installVersionTask,
} = require("@xmcl/installer");
const { launch, Version } = require("@xmcl/core");

const axios = require("axios");
/* Imports */

/* HTML Fields */
const closeButton = document.querySelector(".close");

const username = document.querySelector(".username input");
const password = document.querySelector(".password input");

const playButton = document.querySelector(".play");
const settingsButton = document.querySelector(".settings");

const registerField = document.querySelector(".register");

const progressBar = document.querySelector(".progress");
const progressBarText = document.querySelector(".progress-text");
/* HTML Fields */

/* Registering listeners */
window.addEventListener("load", async () => {
  await convertCredentials();
  await loadCredentials();
});

closeButton.addEventListener("click", async (_) =>
  ipcRenderer.send("main-window-close")
);

settingsButton.addEventListener("click", async (_) => {
  ipcRenderer.send("show-options");
});

registerField.addEventListener("click", async (_) => {
  window.open(
    "https://plutonia-mc.fr/user/register",
    "RegisterWindow",
    "width=700,height=600"
  );
});

/* Open devTool console */
let devTool = false;

document.addEventListener("keydown", (e) => {
  if (e.keyCode == 123) {
    ipcRenderer.send(
      devTool ? "main-window-dev-tools-close" : "main-window-dev-tools"
    );
    devTool = !devTool;
  }
});
/* Open devTool console */

password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    playButton.click();
  }
});

const OPTIONS_FILE_NAME = "options.json";

playButton.addEventListener("click", async (_) => {
  disableFields(true);

  if (username.value === "" || password.value === "") {
    setErrorMessage("Identifiants incorrects.");
    return disableFields(false);
  }

  let authResult = undefined;

  try {
    setMessage("Authentification en cours...");
    authResult = await authWorker.auth(username.value, password.value);

    if (authResult.error) {
      setErrorMessage("Veuillez entrer votre code 2FA.");

      const tfaResult = await ipcRenderer.invoke("require-tfa", {
        username: username.value,
        password: password.value,
      });

      if (tfaResult.message) {
        setErrorMessage(tfaResult.message);
        return disableFields(false);
      }

      try {
        authResult = await authWorker.auth(
          username.value,
          password.value,
          tfaResult.code
        );
      } catch (error) {
        setErrorMessage(error.message);
        return disableFields(false);
      }
    }

    setMessage("Authentification réussie.");
  } catch (error) {
    setErrorMessage(error.message);
    return disableFields(false);
  }

  saveCredentials();

  let gamePath = undefined;

  try {
    gamePath = await ipcRenderer.invoke("appData");
  } catch (error) {
    console.error("Impossible de récupérer le chemin :", error);
    setErrorMessage("Impossible de récupérer le chemin.");
    return disableFields(false);
  }

  let javaPath = undefined;

  try {
    javaPath = await downloadJava(gamePath);
  } catch (error) {
    console.log("Impossible de vérifier Java :", error);
    setErrorMessage("Impossible de vérifier Java.");
    return disableFields(false);
  }

  let latestVersion = undefined;
  const options = await ipcRenderer.invoke("get-from-file", OPTIONS_FILE_NAME);

  try {
    const prerelease = options?.prerelease ?? false;

    latestVersion = await downloadJar(gamePath, prerelease);
  } catch (error) {
    console.error("Impossible de récupérer la version :", error.message);
    setErrorMessage("Impossible de récupérer la version...");
    return disableFields(false);
  }

  const resolvedVersion = await Version.parse(gamePath, latestVersion.id);

  try {
    await downloadLibrairies(resolvedVersion);
  } catch (error) {
    console.error(
      "Erreur lors du téléchargement des librairies :",
      error.message
    );
    setErrorMessage("Une erreur s'est produite lors du téléchargement...");
    return disableFields(false);
  }

  try {
    await downloadAssets(resolvedVersion);
  } catch (error) {
    console.error("Erreur lors de l'installation des assets :", error.message);
    setErrorMessage(
      "Une erreur s'est produite lors de l'installation des assets."
    );
    return disableFields(false);
  }

  await launchGame(
    {
      gamePath: gamePath,
      version: latestVersion.id,
      javaPath: javaPath,
      authResult: authResult,
    },
    options
  );
});
/* Registering listeners */

/* Workers */
const VERSION_MANIFEST_URL = "https://versions.plutonia.download/manifest.json";

async function getVersionList(options = {}) {
  const response = await axios.get(VERSION_MANIFEST_URL, {
    ...options,
  });

  if (response.status !== 200) {
    throw new Error(
      `Failed to fetch Minecraft versions. HTTP status code: ${response.status}`
    );
  }

  return response.data;
}

async function downloadJava(gamePath) {
  console.log("Vérification de java...");
  setMessage("Vérification de java...");

  setProgress(0);

  // Retrieve the JRE path. If not found, download it.
  const installTask = await new JavaDownloadTask({
    gamePath: gamePath,
    java: { type: "jdk", version: 8 },
  }).startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round((task.progress / task.total) * 100);

        console.log(`Téléchargement de java... (${percent}%)`);
        setMessage(`Téléchargement de java en cours... (${percent}%)`);
        setProgress(percent);
      }
    },
  });

  console.log("Vérification de java terminé.");
  setMessage("Vérification de java terminé.");

  setProgress(100);

  // If it successfully finds the JRE, return the JRE path.
  if (installTask.success) {
    return installTask.path;
  }

  console.log("Décompression de java en cours...");
  setMessage("Décompression de java en cours...");

  setProgress(0);

  // Extract the JRE zip file based on the download task's response.
  const extractTask = await new JavaExtractTask({
    source: installTask.source,
    destination: installTask.destination,
  }).startAndWait({
    // The update progress will only be shown for zip files.
    onUpdate(task, progress) {
      console.log(`Décompression de java en cours... (${progress}%)`);
      setMessage(`Décompression de java en cours... (${progress}%)`);

      setProgress(progress);
    },
  });

  console.log("Décompression de java terminée.");
  setMessage("Décompression de java terminée.");

  setProgress(100);

  return extractTask;
}

async function downloadJar(gamePath, prerelease) {
  const version = await getVersionList();

  const latestVersion = version.versions.find((v) => {
    const targetId = prerelease
      ? version.latest.prerelease
      : version.latest.release;
    return v.id === targetId;
  });

  if (!latestVersion) {
    throw new Error("Impossible de récupérer la dernière version.");
  }

  const installTask = installVersionTask(latestVersion, gamePath, {});

  console.log("Vérification de la version...");
  setMessage("Vérification de la version...");

  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round(
          (installTask.progress / installTask.total) * 100
        );

        console.log(`Récupération de la version... (${percent}%)`);
        setMessage(`Récupération de la version en cours... (${percent}%)`);

        setProgress(percent);
      }
    },
  });

  console.log("Vérification de la version terminé.");
  setMessage("Vérification de la version terminé.");

  setProgress(100);

  return latestVersion;
}

async function downloadLibrairies(resolvedVersion) {
  const installTask = installLibrariesTask(resolvedVersion);

  console.log("Vérification des librairies...");
  setMessage("Vérification des librairies...");

  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round(
          (installTask.progress / installTask.total) * 100
        );

        console.log(`Téléchargement des librairies... (${percent}%)`);
        setMessage(`Téléchargement des librairies en cours... (${percent}%)`);

        setProgress(percent);
      }
    },
  });

  console.log("Vérification des librairies terminé.");
  setMessage("Vérification des librairies terminé.");

  setProgress(100);
}

async function downloadAssets(resolvedVersion) {
  const installTask = installAssetsTask(resolvedVersion, {
    assetsHost: "https://versions.plutonia.download/assets/objects",
  });

  console.log("Vérification des assets...");
  setMessage("Vérification des assets...");

  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round(
          (installTask.progress / installTask.total) * 100
        );

        console.log(`Téléchargement des assets en cours... (${percent}%)`);
        setMessage(`Téléchargement des assets en cours... (${percent}%)`);

        setProgress(percent);
      }
    },
  });

  console.log("Vérification des assets terminé.");
  setMessage("Vérification des assets terminé.");

  setProgress(100);
}

async function launchGame(args, options) {
  console.log("Lancement du jeu...");
  setMessage("Lancement du jeu...");

  setProgress(0);

  const start = await launch({
    gamePath: args.gamePath,
    javaPath: args.javaPath,
    version: args.version,
    accessToken: args.authResult.token,
    gameProfile: {
      name: args.authResult.name,
      id: args.authResult.uuid,
    },
    userType: "legacy",
    extraExecOption: {
      detached: true,
    },
    extraJVMArgs: [
      "-Xms128M",
      `-Xmx${options && options.ram ? options.ram : "2048M"}`,
      "-Dfml.ignoreInvalidMinecraftCertificates=true",
      "-Dfml.ignorePatchDiscrepancies=true",
    ],
    extraMCArgs: [
      options &&
      options.modules &&
      Object.values(options.modules).includes(true)
        ? `-mods=${Object.entries(options.modules)
            .filter(([module, isActive]) => isActive)
            .map(([module]) => module)
            .join(",")}`
        : "",
    ],
  });

  // console.log('Le jeu est en cours de lancement...');
  // setMessage('Le jeu est en cours de lancement...');

  setProgress(100);

  // console.info('Ligne de commande: ', start.spawnargs.join(' '));

  disableFields(false);
  ipcRenderer.send("main-window-close");
}
/* Workers */

const CREDENTIALS_FILE_NAME = "credentials.json";

/* Load Credentials from File */
async function loadCredentials() {
  const credentials = await ipcRenderer.invoke(
    "get-from-file",
    CREDENTIALS_FILE_NAME
  );

  if (credentials.username) {
    username.value = credentials.username;
  }

  if (credentials.password) {
    password.value = Buffer.from(credentials.password, "base64").toString(
      "utf-8"
    );
  }
}

/* Save Credentials to File */
function saveCredentials() {
  const datas = {
    username: username.value,
    password: Buffer.from(password.value).toString("base64"),
  };

  ipcRenderer.send("save-to-file", CREDENTIALS_FILE_NAME, datas);
}
/* Other functions */

/* Convert old credentials */
async function convertCredentials() {
  const credentialsFile = path.join(
    await ipcRenderer.invoke("appData"),
    "credentials.yml"
  );

  if (!fs.existsSync(credentialsFile)) {
    return;
  }

  fs.readFile(credentialsFile, "utf8", (error, fileContent) => {
    if (error) {
      console.error("Erreur lors de la lecture du fichier: ", error);
    }

    console.log(fileContent);

    const lines = fileContent.split("\n");

    let user, pass;

    for (const line of lines) {
      if (line.startsWith("username=")) {
        user = line.split("=")[1].trim();
      } else if (line.startsWith("password=")) {
        pass = line.split("=")[1].trim();
      }
    }

    if (user && pass) {
      username.value = user;
      password.value = pass;

      saveCredentials();

      fs.unlink(credentialsFile, (unlinkErr) => {
        if (unlinkErr) {
          console.error(
            "Erreur lors de la suppression du fichier: ",
            unlinkErr
          );
          return;
        }

        console.log("Fichier credentials.yml supprimé avec succès.");
      });
    }
  });
}
/* Convert old credentials */

/* Utils */
function setProgress(percentage) {
  const maxWidth = 447;
  const progressBarWidth = (percentage / 100) * maxWidth;

  progressBar.style.width = progressBarWidth + "px";
}

function disableFields(state) {
  const elements = [
    username,
    password,
    playButton,
    settingsButton,
    registerField,
  ];

  elements.forEach((element) => {
    if (state) {
      element.classList.add("disabled");
    } else {
      element.classList.remove("disabled");
    }
  });
}

function setMessage(text) {
  progressBarText.innerHTML = text;
}

function setErrorMessage(text) {
  setMessage("<span style='color: red;'>" + text + "</span>");
}
/* Utils */
