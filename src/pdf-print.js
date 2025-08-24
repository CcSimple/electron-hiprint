/*
 * @Description: pdf打印
 * @Author: CcSimple
 * @Github: https://github.com/CcSimple
 * @Date: 2023-04-21 16:35:07
 * @LastEditors: CcSimple
 * @LastEditTime: 2023-07-14 14:09:19
 */
const pdfPrint1 = require("pdf-to-printer");
const pdfPrint2 = require("unix-print");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { store } = require("../tools/utils");
const dayjs = require("dayjs");
const { v7: uuidv7 } = require("uuid");

const printPdfFunction =
  process.platform === "win32" ? pdfPrint1.print : pdfPrint2.print;

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
    console.log("print pdf:" + pdfPath + JSON.stringify(data));
    // 参数见 node_modules/pdf-to-printer/dist/print/print.d.ts
    // pdf打印文档：https://www.sumatrapdfreader.org/docs/Command-line-arguments
    // pdf-to-printer 源码: https://github.com/artiebits/pdf-to-printer
    let pdfOptions = Object.assign(data, { paperSize: data.paperName });
    printPdfFunction(pdfPath, pdfOptions)
      .then(() => {
        resolve();
      })
      .catch(() => {
        reject();
      });
  } else {
    // 参数见 lp 命令 使用方法
    let options = [];
    printPdfFunction(pdfPath, printer, options)
      .then(() => {
        resolve();
      })
      .catch(() => {
        reject();
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
        const client = pdfPath.startsWith("https")
          ? require("https")
          : require("http");
        client
          .get(pdfPath, (res) => {
            const toSavePath = path.join(
              store.get("pdfPath") || os.tmpdir(),
              "url_pdf",
              dayjs().format(`YYYY_MM_DD HH_mm_ss_`) + `${uuidv7()}.pdf`,
            );
            // 确保目录存在
            fs.mkdirSync(path.dirname(toSavePath), { recursive: true });
            const file = fs.createWriteStream(toSavePath);
            res.pipe(file);
            file.on("finish", () => {
              file.close();
              console.log("file downloaded:" + toSavePath);
              realPrint(toSavePath, printer, data, resolve, reject);
            });
          })
          .on("error", (err) => {
            console.log("download pdf error:" + err?.message);
            reject(err);
          });
        return;
      }
      realPrint(pdfPath, printer, data, resolve, reject);
    } catch (error) {
      console.log("print error:" + error?.message);
      reject(error);
    }
  });
};

/**
 * @description: 打印Blob类型的PDF数据
 * @param {Blob|Uint8Array|Buffer} pdfBlob PDF的二进制数据
 * @param {string} printer 打印机名称
 * @param {object} data 打印参数
 * @return {Promise}
 */
const printPdfBlob = (pdfBlob, printer, data) => {
  return new Promise((resolve, reject) => {
    try {
      // 验证blob数据 实际是 Uint8Array
      if (
        !pdfBlob ||
        !(
          pdfBlob instanceof Uint8Array || Buffer.isBuffer(pdfBlob))
      ) {
        reject(new Error("pdfBlob must be a Uint8Array, Buffer"));
        return;
      }

      // 生成临时文件路径
      const toSavePath = path.join(
        store.get("pdfPath") || os.tmpdir(),
        "blob_pdf",
        dayjs().format(`YYYY_MM_DD HH_mm_ss_`) + `${uuidv7()}.pdf`,
      );

      // 确保目录存在
      fs.mkdirSync(path.dirname(toSavePath), { recursive: true });

      // Uint8Array 2 Buffer
      const buffer = Buffer.isBuffer(pdfBlob) ? pdfBlob : Buffer.from(pdfBlob);

      // 写入文件
      fs.writeFile(toSavePath, buffer, (err) => {
        if (err) {
          console.log("save blob pdf error:" + err?.message);
          reject(err);
          return;
        }

        console.log("blob pdf saved:" + toSavePath);

        // 调用打印函数
        realPrint(toSavePath, printer, data, resolve, reject);
      });
    } catch (error) {
      console.log("print blob error:" + error?.message);
      reject(error);
    }
  });
};

module.exports = {
  printPdf,
  printPdfBlob,
};
