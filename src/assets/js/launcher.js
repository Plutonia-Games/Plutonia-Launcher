/* Imports */
const { ipcRenderer } = require('electron');

const AuthWorker = require('./assets/js/workers/auth-worker.js');
const authWorker = new AuthWorker();

const { JavaDownloader } = require('./assets/js/workers/java-downloader.js');
const javaDownloader = new JavaDownloader();

const { CustomAssets } = require('./assets/js/workers/custom-assets.js');
const customAssets = new CustomAssets();

const {
  installLibrariesTask,
  installAssetsTask,
  installVersionTask,
} = require('@xmcl/installer');

const { launch, Version } = require('@xmcl/core');
const { request } = require('undici');
/* Imports */

/* HTML Fields */
const closeButton = document.querySelector('.close');

const username = document.querySelector('.username input');
const password = document.querySelector('.password input');

const playButton = document.querySelector('.play');
const settingsButton = document.querySelector('.settings');

const registerField = document.querySelector('.register');

const progressBar = document.querySelector('.progress');
const progressBarText = document.querySelector('.progress-text');
/* HTML Fields */

/* Registering listeners */
window.addEventListener('load', async () => await loadCredentials());

closeButton.addEventListener('click', async (_) => ipcRenderer.send('main-window-close'));

settingsButton.addEventListener('click', async (_) => {
  ipcRenderer.send('show-options');
});

registerField.addEventListener('click', async (_) => {
  window.open(
    'https://plutonia-mc.fr/user/register',
    'RegisterWindow',
    'width=700,height=600'
  );
});

/* Open devTool console */
let devTool = false;

document.addEventListener('keydown', (e) => {
  if (e.keyCode == 123) {
    ipcRenderer.send(
      devTool ? 'main-window-dev-tools-close' : 'main-window-dev-tools'
    );
    devTool = !devTool;
  }
});
/* Open devTool console */

password.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    playButton.click();
  }
});

playButton.addEventListener('click', async (_) => {
  disableFields(true);

  if (username.value === '' || password.value === '') {
    setErrorMessage('Identifiants incorrects.');
    return disableFields(false);
  }

  let authResult = undefined;

  try {
    setMessage('Authentification en cours...');
    authResult = await authWorker.auth(username.value, password.value);

    if (authResult.error) {
      setErrorMessage('Veuillez entrer votre code 2FA.');

      const tfaResult = await ipcRenderer.invoke('require-tfa', {
        username: username.value,
        password: password.value,
      });

      console.log(tfaResult);

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

    setMessage('Authentification réussie.');
  } catch (error) {
    setErrorMessage(error.message);
    return disableFields(false);
  }

  saveCredentials();

  let gamePath = undefined;

  try {
    gamePath = await ipcRenderer.invoke('appData');
  } catch (error) {
    console.error('Impossible de récupérer le chemin :', error);
    setErrorMessage('Impossible de récupérer le chemin.');
    return disableFields(false);
  }

  let javaPath = undefined;

  try {
    javaPath = await downloadJava(gamePath);
  } catch (error) {
    console.log('Impossible de vérifier Java :', error);
    setErrorMessage('Impossible de vérifier Java.');
    return disableFields(false);
  }

  let latestVersion = undefined;

  try {
    latestVersion = await downloadJar(gamePath);
  } catch (error) {
    console.error('Impossible de récupérer la version :', error);
    setErrorMessage('Impossible de récupérer la version...');
    return disableFields(false);
  }

  const resolvedVersion = await Version.parse(gamePath, latestVersion.id);

  try {
    await downloadLibrairies(resolvedVersion);
  } catch (error) {
    console.error(
      'Erreur lors du téléchargement des librairies :',
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

  try {
    await downloadCustomAssets(gamePath);
  } catch (error) {
    console.error("Erreur lors de l'installation des assets (custom) :", error);
    setErrorMessage(
      "Une erreur s'est produite lors de l'installation des assets."
    );
    return disableFields(false);
  }

  await launchGame({
    gamePath: gamePath,
    javaPath: javaPath.path,
    authResult: authResult,
  });
});
/* Registering listeners */

/* Workers */
const VERSION_MANIFEST_URL = 'https://versions.plutonia.download/manifest.json';

async function getVersionList(options = {}) {
  const response = await request(VERSION_MANIFEST_URL, {
    dispatcher: options.dispatcher,
    throwOnError: true,
  });

  return await response.body.json();
}

async function downloadJava(gamePath) {
  console.log('Vérification de Java...');
  setMessage('Vérification de Java...');

  setProgress(0);

  javaDownloader.on('progress', (downloaded, size, fileName) => {
    const percent = Math.round((downloaded / size) * 100);

    console.log(`Téléchargement de Java en cours... (${percent}%)`);
    setMessage(`Téléchargement de Java en cours... (${percent}%)`);

    setProgress(percent);
  });

  javaDownloader.on('finished-download', () => {
    console.log(`Téléchargement de Java terminé.`);
    setMessage('Téléchargement de Java terminé.');

    setProgress(100);
  });

  javaDownloader.on('start-decompress', () => {
    console.log(`Décompression de Java en cours...`);
    setMessage('Décompression de Java en cours...');

    setProgress(0);
  });

  javaDownloader.on('finished-decompress', () => {
    console.log(`Décompression de Java terminé.`);
    setMessage('Décompression de Java terminé.');

    setProgress(100);
  });

  const javaPath = await javaDownloader.getJava(
    { path: gamePath, java: { type: 'jdk' } },
    11
  );

  console.log(`Vérification de Java terminé.`);
  setMessage('Vérification de Java terminé.');

  setProgress(100);

  return javaPath;
}

async function downloadJar(gamePath) {
  const version = await getVersionList();
  const latestVersion = version.versions.find(
    (v) => v.id === version.latest.release
  );

  if (!latestVersion) {
    throw new Error('Impossible de récupérer la dernière version.');
  }

  const installTask = installVersionTask(latestVersion, gamePath, {});

  console.log('Vérification de la version...');
  setMessage('Vérification de la version...');

  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      const percent = Math.round(
        (installTask.progress / installTask.total) * 100
      );

      console.log(`Récupération de la version... (${percent}%)`);
      setMessage(`Récupération de la version en cours... (${percent}%)`);

      setProgress(percent);
    },
  });

  console.log('Vérification de la version terminé.');
  setMessage('Vérification de la version terminé.');

  setProgress(100);

  return latestVersion;
}

async function downloadCustomAssets(gamePath) {
  console.log('Vérification des assets...');
  setMessage('Vérification des assets...');

  setProgress(0);

  customAssets.on('progress', ({ current, total }) => {
    const percent = Math.round((current / total) * 100);

    console.log(`Téléchargement des assets en cours... (${percent}%)`);
    setMessage(`Téléchargement des assets en cours... (${percent}%)`);

    setProgress(percent);
  });

  await customAssets.update(gamePath);

  console.log('Vérification des assets terminé.');
  setMessage('Vérification des assets terminé.');

  setProgress(100);
}

async function downloadLibrairies(resolvedVersion) {
  const installTask = installLibrariesTask(resolvedVersion);

  console.log('Vérification des librairies...');
  setMessage('Vérification des librairies...');

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      const percent = Math.round(
        (installTask.progress / installTask.total) * 100
      );

      console.log(`Téléchargement des librairies... (${percent}%)`);
      setMessage(`Téléchargement des librairies en cours... (${percent}%)`);

      setProgress(percent);
    },
  });

  console.log('Vérification des librairies terminé.');
  setMessage('Vérification des librairies terminé.');
}

async function downloadAssets(resolvedVersion) {
  const installTask = installAssetsTask(resolvedVersion, {
    assetsHost: 'https://assets.plutonia.download/',
  });

  console.log('Vérification des assets...');
  setMessage('Vérification des assets...');

  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      const percent = Math.round(
        (installTask.progress / installTask.total) * 100
      );

      console.log(`Téléchargement des assets en cours... (${percent}%)`);
      setMessage(`Téléchargement des assets en cours... (${percent}%)`);

      setProgress(percent);
    },
  });

  console.log('Vérification des assets terminé.');
  setMessage('Vérification des assets terminé.');

  setProgress(100);
}

const OPTIONS_FILE_NAME = 'options.json';

async function launchGame(args) {
  console.log('Lancement du jeu...');
  setMessage('Lancement du jeu...');

  setProgress(0);

  const options = await ipcRenderer.invoke('get-from-file', OPTIONS_FILE_NAME);

  const start = await launch({
    gamePath: args.gamePath,
    javaPath: args.javaPath,
    version: '1.8.9',
    accessToken: args.authResult.token,
    gameProfile: {
      name: args.authResult.name,
      id: args.authResult.uuid,
    },
    userType: 'legacy',
    extraExecOption: {
      detached: true,
    },
    extraJVMArgs: [
      '-Xms128M',
      `-Xmx${options && options.ram ? options.ram : '2048M'}`,
      '-Dfml.ignoreInvalidMinecraftCertificates=true',
      '-Dfml.ignorePatchDiscrepancies=true',
    ],
    extraMCArgs: [
      options &&
      options.modules &&
      Object.values(options.modules).includes(true)
        ? `-mods=${Object.entries(options.modules)
            .filter(([module, isActive]) => isActive)
            .map(([module]) => module)
            .join(',')}`
        : '',
    ],
  });

  // console.log('Le jeu est en cours de lancement...');
  // setMessage('Le jeu est en cours de lancement...');

  setProgress(100);

  // console.info('Ligne de commande: ', start.spawnargs.join(' '));

  disableFields(false);
  ipcRenderer.send('main-window-close');
}
/* Workers */

const CREDENTIALS_FILE_NAME = 'credentials.json';

/* Load Credentials from File */
async function loadCredentials() {
  const credentials = await ipcRenderer.invoke(
    'get-from-file',
    CREDENTIALS_FILE_NAME
  );

  if (credentials.username) {
    username.value = credentials.username;
  }

  if (credentials.password) {
    password.value = Buffer.from(credentials.password, 'base64').toString(
      'utf-8'
    );
  }
}

/* Save Credentials to File */
function saveCredentials() {
  const datas = {
    username: username.value,
    password: Buffer.from(password.value).toString('base64'),
  };

  ipcRenderer.send('save-to-file', CREDENTIALS_FILE_NAME, datas);
}
/* Other functions */

/* Utils */
function setProgress(percentage) {
  const maxWidth = 447;
  const progressBarWidth = (percentage / 100) * maxWidth;

  progressBar.style.width = progressBarWidth + 'px';
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
      element.classList.add('disabled');
    } else {
      element.classList.remove('disabled');
    }
  });
}

function setMessage(text) {
  progressBarText.innerHTML = text;
}

function setErrorMessage(text) {
  setMessage("<span style='color: red;'>" + text + '</span>');
}
/* Utils */
