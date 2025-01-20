const fs = require("fs-extra");
const builder = require("electron-builder");

const JavaScriptObfuscator = require("javascript-obfuscator");

const { preductname } = require("./package.json");

class Index {
  async init() {
    this.obf = false;
    this.Fileslist = [];

    process.argv.forEach(async (val) => {
      if (val.startsWith("--obf")) {
        this.obf = JSON.parse(val.split("=")[1]);
        this.Fileslist = this.getFiles("src");
      }

      if (val.startsWith("--build")) {
        let buildType = val.split("=")[1];

        if (buildType == "platform") {
          return await this.buildPlatform();
        }
      }
    });
  }

  async Obfuscate() {
    if (fs.existsSync("./app")) {
      fs.rmSync("./app", { recursive: true });
    }

    for (let path of this.Fileslist) {
      let fileName = path.split("/").pop();
      let extFile = fileName.split(".").pop();
      let folder = path.replace(`/${fileName}`, "").replace("src", "app");

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }

      if (extFile == "js") {
        let code = fs.readFileSync(path, "utf8");
        code = code.replace(/src\//g, "app/");

        if (this.obf) {
          await new Promise((resolve) => {
            console.log(`Obfuscate ${path}`);

            let obf = JavaScriptObfuscator.obfuscate(code, {
              optionsPreset: "medium-obfuscation",
              disableConsoleOutput: false,
            });

            resolve(
              fs.writeFileSync(
                `${folder}/${fileName}`,
                obf.getObfuscatedCode(),
                { encoding: "utf-8" }
              )
            );
          });
        } else {
          console.log(`Copying ${path}...`);

          fs.writeFileSync(`${folder}/${fileName}`, code, {
            encoding: "utf-8",
          });
        }
      } else {
        fs.copyFileSync(path, `${folder}/${fileName}`);
      }
    }
  }

  async buildPlatform() {
    await this.Obfuscate();

    builder
      .build({
        config: {
          generateUpdatesFilesForAllChannels: false,
          appId: preductname,
          productName: preductname,
          copyright: "Copyright © 2014-2025 Plutonia",
          artifactName: "${productName}-${os}-${arch}.${ext}",
          extraMetadata: { main: "app/app.js" },
          files: ["app/**/*", "package.json", "LICENSE.md"],
          directories: { output: "dist" },
          compression: "maximum",
          asar: true,
          publish: [
            {
              provider: "github",
              releaseType: "release",
            },
          ],
          win: {
            icon: "./app/resources/images/icons/icon.ico",
            target: [
              {
                target: "nsis",
                arch: "x64",
              },
            ],
          },
          nsis: {
            oneClick: true,
            allowToChangeInstallationDirectory: false,
            createDesktopShortcut: true,
            runAfterFinish: true,
          },
          mac: {
            icon: "./app/resources/images/icons/icon.icns",
            category: "public.app-category.games",
            identity: null,
            target: [
              {
                target: "dmg",
                arch: "universal",
              },
              {
                target: "zip",
                arch: "universal",
              },
            ],
          },
          linux: {
            icon: "./app/resources/images/icons/icon.png",
            target: [
              {
                target: "AppImage",
                arch: "x64",
              },
            ],
          },
        },
      })
      .then(() => {
        console.log("Build finished with success!");
      })
      .catch((err) => {
        console.error("Error during build: ", err);
      });
  }

  getFiles(path, file = []) {
    if (fs.existsSync(path)) {
      let files = fs.readdirSync(path);

      if (files.length == 0) {
        file.push(path);
      }

      for (let i in files) {
        let name = `${path}/${files[i]}`;

        if (fs.statSync(name).isDirectory()) {
          this.getFiles(name, file);
        } else {
          file.push(name);
        }
      }
    }

    return file;
  }
}

new Index().init();
