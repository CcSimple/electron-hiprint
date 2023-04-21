/*
 * @Description: pdf打印
 * @Author: CcSimple
 * @Github: https://github.com/CcSimple
 * @Date: 2023-04-21 16:35:07
 * @LastEditors: CcSimple
 * @LastEditTime: 2023-04-21 17:46:53
 */
const pdfPrint1 = require("pdf-to-printer");
const pdfPrint2 = require("unix-print");

const printPdfFunction = process.platform === "win32" ? pdfPrint1.print : pdfPrint2.print;

const printPdf = (pdfPath, printer, data) => {
  return new Promise((resolve, reject) => {
    try {
      if (process.platform === "win32") {
        printPdfFunction(pdfPath, data).then(console.log);
      } else {
        // 参数见 lp 命令 使用方法
        let options = [];
        printPdfFunction(pdfPath, printer, options).then(console.log);
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = printPdf;
