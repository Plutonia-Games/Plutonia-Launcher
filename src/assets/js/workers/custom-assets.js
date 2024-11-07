const EventEmitter = require('events');

const fs = require('fs-extra');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const serverUrl = 'https://custom-assets.plutonia.download/';

const ignoredFiles = [];

class CustomAssets extends EventEmitter {
  async update(appDataPath) {
    this.emit('started');

    console.log('Tentative de récupération des fichiers depuis : ' + serverUrl);

    const response = await axios.get(serverUrl);
    const serverFiles = response.data;

    // 1. Vérifier et supprimer les fichiers obsolètes
    for (const file of serverFiles) {
      if (!file.path) {
        console.error(
          'Le chemin du fichier est manquant dans la réponse du serveur :',
          file
        );
        throw new Error('Fichiers manquants sur le serveur.');
        return;
      }

      // Vérifier si le fichier à vérifier est dans la liste des fichiers ignorés
      if (ignoredFiles.includes(file.path)) {
        this.emit('ignored', file.path);
        continue;
      }

      const localFilePath = path.join(appDataPath, file.path);

      if (await fs.pathExists(localFilePath)) {
        const localHash = await this.calculateHash(localFilePath);

        if (localHash !== file.hash) {
          this.emit('remove', file.path);
          await fs.remove(localFilePath);
        }
      }
    }

    // 2. Lister les fichiers manquants
    let toDownload = [];

    for (const file of serverFiles) {
      if (!file.path) {
        console.error(
          'Le chemin du fichier est manquant dans la réponse du serveur :',
          file
        );
        throw new Error('Fichiers manquants sur le serveur.');
        return;
      }

      const localFilePath = path.join(appDataPath, file.path);

      if (!(await fs.pathExists(localFilePath))) {
        toDownload.push({ url: file.url, localFilePath });
        this.emit('missing', file.path);
      }
    }

    // 2. Télécharger les fichiers manquants
    let current = 0;

    for (const file of toDownload) {
      current += 1;
      this.emit('progress', { current, total: toDownload.length });
      await this.downloadFile(file.url, file.localFilePath);
    }

    this.emit('finished');
  }

  async calculateHash(filePath) {
    const hash = crypto.createHash('sha256');
    const fileBuffer = await fs.readFile(filePath);
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  async downloadFile(fileUrl, localFilePath) {
    const dir = path.dirname(localFilePath);
    await fs.ensureDir(dir);

    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data);
    await fs.writeFile(localFilePath, buffer);
  }
}

module.exports = { CustomAssets };
