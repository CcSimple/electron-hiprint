/*
 * @Description: pdf打印
 * @Author: CcSimple
 * @Github: https://github.com/CcSimple
 * @Date: 2023-04-21 16:35:07
 * @LastEditors: CcSimple
 * @LastEditTime: 2023-06-07 17:46:29
 */
const pdfPrint1 = require("pdf-to-printer");
const pdfPrint2 = require("unix-print");

const printPdfFunction = process.platform === "win32" ? pdfPrint1.print : pdfPrint2.print;

const printPdf = (pdfPath, printer, data) => {
  return new Promise((resolve, reject) => {
    try {
      if (process.platform === "win32") {
        // 参数见 node_modules/pdf-to-printer/dist/print/print.d.ts
        // pdf打印文档：https://www.sumatrapdfreader.org/docs/Command-line-arguments
        // pdf-to-printer 源码: https://github.com/artiebits/pdf-to-printer
        let pdfOptions = Object.assign(data, { pageSize: data.paperName });
        printPdfFunction(pdfPath, pdfOptions).then(console.log);
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
