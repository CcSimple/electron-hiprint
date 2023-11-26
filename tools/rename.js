"use strict";

const path = require("path");
const fs = require("fs");

class ReName {
  constructor() {
    this.basePath = path.normalize(__dirname + "/..");
    this.dirs = path.join(this.basePath, "/out/");
  }
  /**
   * 格式化参数
   */
  formatArgvs() {
    let argv = {};
    for (let i = 0; i < process.argv.length; i++) {
      const tmpArgv = process.argv[i];
      if (tmpArgv.indexOf("--") !== -1) {
        let key = tmpArgv.substring(2);
        let val = process.argv[i + 1];
        argv[key] = val;
      }
    }
    return argv;
  }

  rename(args) {
    let that = this;
    const pkgPath = path.join(that.basePath, "/package.json");
    let pkg = JSON.parse(fs.readFileSync(pkgPath));
    let version = pkg.version;
    let productName = pkg.build.productName;
    let fileName = `${productName}-${version}`;
    let extList = [".exe", ".dmg", ".tar.xz"];
    extList.forEach((e) => {
      let file = path.join(that.dirs, `${fileName}${e}`);
      let nFile = path.join(
        that.dirs,
        `${productName}_${args["tag"]}-${version}${e}`
      );
      if (fs.existsSync(file)) {
        console.log("exist ", file);
        console.log("rename ", nFile);
        fs.renameSync(file, nFile);
      }
    });
  }
}

const r = new ReName();
let argvs = r.formatArgvs();
console.log("[electron] [rename] argvs:", argvs);
r.rename(argvs);

module.exports = ReName;
