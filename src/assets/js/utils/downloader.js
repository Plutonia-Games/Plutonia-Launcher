/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0/
 */

const fs = require('fs');
const nodeFetch = require('node-fetch');
const { EventEmitter } = require('events');

class Downloader extends EventEmitter {
  async downloadFile(url, path, fileName) {
    this.ensureDirectoryExists(path);
    const writer = fs.createWriteStream(`${path}/${fileName}`);
    const response = await nodeFetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const size = response.headers.get('content-length');
    let downloaded = 0;

    return new Promise((resolve, reject) => {
      response.body.on('data', (chunk) => {
        downloaded += chunk.length;
        this.emit('progress', downloaded, size);
        writer.write(chunk);
      });

      response.body.on('end', () => {
        writer.end();
        resolve();
      });

      response.body.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });
    });
  }

  async downloadFileMultiple(files, totalSize, limit = 1, timeout = 10000) {
    limit = Math.min(limit, files.length);
    let completed = 0;
    let downloaded = 0;
    let queued = 0;

    const speeds = [];
    const start = Date.now();
    let before = 0;

    // Update estimated speed and time at regular intervals
    const estimatedInterval = setInterval(() => {
      const duration = (Date.now() - start) / 1000;
      const loaded = (downloaded - before) * 8; // Convert to bits
      const speed =
        speeds.length >= 5
          ? speeds.slice(1).reduce((a, b) => a + b, 0) / speeds.length
          : 0;

      speeds.push(loaded / duration / 8); // Convert back to bytes per second
      const estimatedTime = (totalSize - downloaded) / speed;

      this.emit('speed', speed);
      this.emit('estimated', estimatedTime);
      before = downloaded;
    }, 500);

    const downloadNext = async () => {
      if (queued < files.length) {
        const file = files[queued++];
        this.ensureDirectoryExists(file.folder);
        const writer = fs.createWriteStream(file.path, {
          flags: 'w',
          mode: 0o777,
        });

        try {
          const response = await nodeFetch(file.url, { timeout });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          response.body.on('data', (chunk) => {
            downloaded += chunk.length;
            this.emit('progress', downloaded, totalSize, file.type);
            writer.write(chunk);
          });

          response.body.on('end', () => {
            writer.end();
            completed++;
            downloadNext();
          });
        } catch (error) {
          writer.end();
          completed++;
          this.emit('error', error);
          downloadNext();
        }
      }
    };

    // Start downloading files in parallel
    while (queued < limit) downloadNext();

    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        if (completed === files.length) {
          clearInterval(estimatedInterval);
          clearInterval(checkCompletion);
          resolve();
        }
      }, 100);
    });
  }

  async checkURL(url, timeout = 10000) {
    try {
      const response = await nodeFetch(url, { method: 'HEAD', timeout });
      if (response.status === 200) {
        return {
          size: parseInt(response.headers.get('content-length')),
          status: response.status,
        };
      }
    } catch (error) {
      this.emit('error', error);
      reject();
    }

    return false;
  }

  async checkMirror(baseURL, mirrors) {
    for (const mirror of mirrors) {
      const url = `${mirror}/${baseURL}`;
      const result = await this.checkURL(url).catch(() => false);

      if (result?.status === 200) {
        return {
          url,
          size: result.size,
          status: result.status,
        };
      }
    }

    return false;
  }

  // Helper function to ensure a directory exists
  ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
    }
  }
}

module.exports = Downloader; // Export the class
