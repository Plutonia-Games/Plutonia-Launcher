"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const crypto = require("crypto");
const decompress = require("decompress");
const nodeFetch = require("node-fetch");

const EventEmitter = require("events");
const Downloader = require("./downloader.js");

class JavaDownloader extends EventEmitter {
  /**
   * Télécharge et configure Java en fonction de la plateforme et de l'architecture de l'utilisateur.
   * @param {Object} options - Options de téléchargement et de configuration.
   * @param {number} versionDownload - Version Java à télécharger (par défaut : 8).
   * @returns {Object} - Contient le chemin vers Java ou une erreur.
   */
  async getJava(options, versionDownload = 8) {
    this.emit("started");

    const javaVersionURL = `https://api.adoptium.net/v3/assets/latest/${versionDownload}/hotspot`;
    const javaVersions = await fetchJavaVersions(javaVersionURL);

    const { platform, arch } = getPlatformArch();
    const java = findJavaVersion(javaVersions, options, platform, arch);

    if (!java) {
      throw new Error("No Java found");
    }

    const { checksum, link: url, name: fileName } = java.binary.package;

    const pathFolder = path.resolve(
      options.path,
      `runtime/${options.java.type}-${versionDownload}`
    );
    const filePath = path.join(pathFolder, fileName);
    const javaPath = getJavaExecutablePath(platform, pathFolder);

    if (!fs.existsSync(javaPath)) {
      if (fs.existsSync(pathFolder)) {
        fs.rmSync(pathFolder, { recursive: true, force: true }); // Ensure if Java is missing, to delete everything, then install a fresh copy of it.
      }

      await this.downloadAndSetupJava({
        filePath,
        pathFolder,
        fileName,
        url,
        checksum,
      });
      await reorganizeExtractedFiles(pathFolder);

      if (platform !== "windows") {
        fs.chmodSync(javaPath, 0o755);
      }
    }

    this.emit("finished");
    return { files: [], path: javaPath };
  }

  /**
   * Télécharge, vérifie et extrait Java dans le dossier spécifié.
   */
  async downloadAndSetupJava({
    filePath,
    pathFolder,
    fileName,
    url,
    checksum,
  }) {
    await this.verifyAndDownloadFile({
      filePath,
      pathFolder,
      fileName,
      url,
      checksum,
    });

    await this.extract(filePath, pathFolder);

    fs.unlinkSync(filePath);
  }

  /**
   * Vérifie et télécharge un fichier si nécessaire.
   */
  async verifyAndDownloadFile({
    filePath,
    pathFolder,
    fileName,
    url,
    checksum,
  }) {
    if (fs.existsSync(filePath)) {
      const existingChecksum = await getFileHash(filePath);
      if (existingChecksum !== checksum) {
        fs.unlinkSync(filePath);
        fs.rmSync(pathFolder, { recursive: true, force: true });
      }
    }

    if (!fs.existsSync(filePath)) {
      this.emit("start-download", url);

      fs.mkdirSync(pathFolder, { recursive: true });
      const download = new Downloader();

      download.on("progress", (downloaded, size) => {
        this.emit("progress", downloaded, size, fileName);
      });

      await download.downloadFile(url, pathFolder, fileName);
      this.emit("finished-download");
    }

    const downloadedChecksum = await getFileHash(filePath);

    if (downloadedChecksum !== checksum) {
      throw new Error("Java checksum verification failed");
    }
  }

  /**
   * Extrait un fichier compressé dans un dossier spécifié.
   */
  async extract(filePath, destPath) {
    try {
      this.emit("start-decompress");

      await decompress(filePath, destPath);

      this.emit("finished-decompress");
    } catch (err) {
      console.error("Error during extraction:", err);
      throw err;
    }
  }
}

/**
 * Récupère les versions de Java depuis une URL donnée.
 */
async function fetchJavaVersions(url) {
  const response = await nodeFetch(url);
  return response.json();
}

/**
 * Détermine la version de Java compatible avec la plateforme et l'architecture.
 */
function findJavaVersion(javaVersions, options, platform, arch) {
  return javaVersions.find(
    ({ binary }) =>
      binary.image_type === options.java.type &&
      binary.architecture === arch &&
      binary.os === platform
  );
}

/**
 * Retourne le chemin vers l'exécutable Java en fonction de la plateforme.
 */
function getJavaExecutablePath(platform, pathFolder) {
  if (platform === "mac") {
    return path.join(pathFolder, "Contents", "Home", "bin", "java");
  } else if (platform === "windows") {
    return path.join(pathFolder, "bin", "java.exe");
  } else {
    return path.join(pathFolder, "bin", "java");
  }
}

/**
 * Réorganise les fichiers extraits si un seul dossier est présent.
 */
function reorganizeExtractedFiles(pathFolder) {
  const extractedItems = fs.readdirSync(pathFolder);

  if (extractedItems.length === 1) {
    const extractedFolder = path.join(pathFolder, extractedItems[0]);

    if (fs.statSync(extractedFolder).isDirectory()) {
      fs.readdirSync(extractedFolder).forEach((item) => {
        try {
          fs.renameSync(
            path.join(extractedFolder, item),
            path.join(pathFolder, item)
          );
        } catch (error) {
          console.error(`Failed to rename ${item}:`, error);
        }
      });

      fs.rmdirSync(extractedFolder);
    }
  }
}

/**
 * Récupère la plateforme et l'architecture courante.
 */
function getPlatformArch() {
  const platformMap = { win32: "windows", darwin: "mac", linux: "linux" };
  const archMap = { x64: "x64", ia32: "x32", arm64: "aarch64", arm: "arm" };

  const platform = platformMap[os.platform()] || os.platform();
  let arch = archMap[os.arch()] || os.arch();

  if (os.platform() === "darwin" && os.arch() === "arm64") {
    arch = "x64";
  }

  return { platform, arch };
}

/**
 * Calcule le hash d'un fichier.
 */
async function getFileHash(filePath, algorithm = "sha256") {
  const shasum = crypto.createHash(algorithm);
  const file = fs.createReadStream(filePath);

  return new Promise((resolve) => {
    file.on("data", (data) => shasum.update(data));
    file.on("end", () => resolve(shasum.digest("hex")));
  });
}

module.exports = { JavaDownloader };
