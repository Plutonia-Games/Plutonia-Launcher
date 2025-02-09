"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs");

const axios = require("axios");

const { download } = require("@xmcl/file-transfer");
const { BaseTask } = require("@xmcl/task");

const AdmZip = require("adm-zip");
const decompress = require("decompress");

const JAVA_DOWNLOAD_URL = `https://api.adoptium.net/v3/assets/latest/{version}/hotspot`;

class JavaDownloadTask extends BaseTask {
  constructor(args) {
    super();

    this.gamePath = args.gamePath;

    this.javaType = args.java.type;
    this.javaVersion = args.java.version;
  }

  async runTask() {
    const systemArch = getSystemArch();

    const pathFolder = path.resolve(
      this.gamePath,
      `runtime/${this.javaType}-${this.javaVersion}`
    );

    const javaExecutable = getExecutablePath(pathFolder, systemArch.platform);

    if (fs.existsSync(javaExecutable)) {
      return { success: true, path: javaExecutable };
    }

    const javaRuntime = getCompatibleJava(
      await fetchJava(JAVA_DOWNLOAD_URL.replace("{version}", this.javaVersion)),
      this.javaType,
      systemArch
    );

    if (!javaRuntime) {
      throw new Error("No compatible Java found.");
    }

    if (fs.existsSync(pathFolder)) {
      fs.rmSync(pathFolder, { recursive: true, force: true }); // Ensure if Java is missing, to delete everything, then install a fresh copy of it.
    }

    const javaBinary = javaRuntime.binary.package;
    const binaryFile = pathFolder + path.extname(javaBinary.name);

    await this.startJavaDownload(javaBinary.link, binaryFile, {
      algorithm: "sha256",
      hash: javaBinary.checksum,
    });

    return { success: false, source: binaryFile, destination: pathFolder };
  }

  async startJavaDownload(url, destinationPath, options) {
    this.controller = new AbortController();

    await download({
      url: url,
      destination: destinationPath,
      abortSignal: new AbortController().signal,
      progressController: (url, chunkSize, progress, total) => {
        this._progress = progress;
        this._total = total;
        this._from = url.toString();
        this.update(chunkSize);
      },
      validator: {
        algorithm: options.algorithm,
        hash: options.hash,
      },
    });
  }
}

class JavaExtractTask extends BaseTask {
  constructor(args) {
    super();

    this.source = args.source;
    this.destination = args.destination;
  }

  async runTask() {
    const extname = path.extname(this.source).toLowerCase();

    if (extname === ".zip") {
      await this.unzip(this.source, this.destination);
    } else {
      await decompress(this.source, this.destination);
    }

    fs.rmSync(this.source);

    reorganizeExtractedFiles(this.destination);

    return getExecutablePath(this.destination, getSystemArch().platform);
  }

  async unzip(source, destination) {
    const zip = new AdmZip(source);
    const zipEntries = zip.getEntries();

    const totalFiles = zipEntries.length;
    let filesExtracted = 0;

    for (const entry of zipEntries) {
      await new Promise((resolve) => {
        setTimeout(() => {
          zip.extractEntryTo(entry, destination, true, true);
          filesExtracted++;

          this._progress = filesExtracted;
          this._total = totalFiles;
          this.update(Math.round((this._progress / this._total) * 100));

          resolve();
        });
      });
    }
  }
}

async function fetchJava(url) {
  const response = await axios.get(url);

  if (response.status !== 200) {
    throw new Error(
      `Failed to fetch Java versions. HTTP status code: ${response.status}`
    );
  }

  return response.data;
}

function reorganizeExtractedFiles(folderPath) {
  const [firstItem] = fs.readdirSync(folderPath);

  if (!firstItem) {
    return;
  }

  const extractedFolder = path.join(folderPath, firstItem);

  if (fs.statSync(extractedFolder).isDirectory()) {
    fs.readdirSync(extractedFolder).forEach((item) =>
      fs.renameSync(
        path.join(extractedFolder, item),
        path.join(folderPath, item)
      )
    );

    fs.rmdirSync(extractedFolder);
  }
}

function getExecutablePath(runtimePath, platform) {
  const javaPaths = {
    mac: path.join(runtimePath, "Contents", "Home", "bin", "java"),
    windows: path.join(runtimePath, "bin", "javaw.exe"),
  };

  return javaPaths[platform] || path.join(runtimePath, "bin", "java");
}

function getCompatibleJava(fetchedJava, javaType, systemArch) {
  return fetchedJava.find(
    ({ binary }) =>
      binary.image_type === javaType &&
      binary.architecture === systemArch.arch &&
      binary.os === systemArch.platform
  );
}

function getSystemArch() {
  const platform =
    { win32: "windows", darwin: "mac", linux: "linux" }[os.platform()] ||
    os.platform();
  let arch =
    { x64: "x64", ia32: "x32", arm64: "aarch64", arm: "arm" }[os.arch()] ||
    os.arch();

  if (platform === "mac" && os.arch() === "arm64") {
    arch = "x64";
  }

  return { platform, arch };
}

module.exports = { JavaDownloadTask, JavaExtractTask };
