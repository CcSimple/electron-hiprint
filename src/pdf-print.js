/*
 * @Description: pdf打印
 * @Author: CcSimple
 * @Github: https://github.com/CcSimple
 * @Date: 2023-04-21 16:35:07
 * @LastEditors: CcSimple
 * @LastEditTime: 2023-07-14 14:09:19
 */
const { print: winPrint } = require("win32-pdf-printer");
const unixPrint = require("unix-print");
const path = require("path");
const fs = require("fs");
const os = require("os");

const randomStr = () => {
  return Math.random()
    .toString(36)
    .substring(2);
};

const realPrint = (pdfPath, printer, data, resolve, reject) => {
  if (!fs.existsSync(pdfPath)) {
    reject({ path: pdfPath, msg: "file not found" });
    return;
  }

  if (process.platform === "win32") {
    data = Object.assign({}, data);
    data.printer = printer;
    console.log("print pdf:", pdfPath, JSON.stringify(data));
    // 参数及源码：https://github.com/mlmdflr/win32-pdf-printer/blob/main/src/print/print.ts
    // pdf打印文档：https://www.sumatrapdfreader.org/docs/Command-line-arguments
    let pdfOptions = Object.assign(data, { pageSize: data.paperName });
    winPrint.print(pdfPath, pdfOptions).then(()=>{
        resolve();
    }).catch((err)=>{
        reject(err);
    });
  } else {
    // 参数见 lp 命令 使用方法
    let options = [];
    unixPrint.print(pdfPath, printer, options).then(()=>{
        resolve();
    }).catch((err)=>{
        reject(err);
    });
  }
};

const printPdf = (pdfPath, printer, data) => {
  return new Promise((resolve, reject) => {
    try {
      if (typeof pdfPath !== "string") {
        reject("pdfPath must be a string");
      }
      if (/^https?:\/\/.+/.test(pdfPath)) {
        const client = pdfPath.startsWith("https") ? require("https") : require("http");
        client
          .get(pdfPath, (res) => {
            const toSaveFilename = randomStr() + "_hiprint.pdf";
            const toSavePath = path.join(os.tmpdir(), toSaveFilename);

            const file = fs.createWriteStream(toSavePath);
            res.pipe(file);
            file.on("finish", () => {
              file.close();
              console.log("file downloaded:" + toSavePath);
              realPrint(toSavePath, printer, data, resolve, reject);
            });
          })
          .on("error", (err) => {
            console.log("download pdf error:" + err.message);
          });
        return;
      }
      realPrint(pdfPath, printer, data, resolve, reject);
    } catch (error) {
      console.log("print error:" + error);
      reject(error);
    }
  });
};

module.exports = printPdf;
