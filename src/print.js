"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { printPdf, printPdfBlob } = require("./pdf-print");
const log = require("../tools/log");
const { store, getCurrentPrintStatusByName } = require("../tools/utils");
const db = require("../tools/database");
const dayjs = require("dayjs");
const { v7: uuidv7 } = require("uuid");

/**
 * @description: 创建打印窗口
 * @return {BrowserWindow} PRINT_WINDOW 打印窗口
 */
async function createPrintWindow() {
  const windowOptions = {
    width: 100, // 窗口宽度
    height: 100, // 窗口高度
    show: false, // 不显示
    webPreferences: {
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用electron api
      nodeIntegration: true,
    },
    // 为窗口设置背景色可能优化字体模糊问题
    // https://www.electronjs.org/zh/docs/latest/faq#文字看起来很模糊这是什么原因造成的怎么解决这个问题呢
    backgroundColor: "#fff",
  };

  // 创建打印窗口
  PRINT_WINDOW = new BrowserWindow(windowOptions);

  // 加载打印渲染进程页面
  let printHtml = path.join("file://", app.getAppPath(), "/assets/print.html");
  PRINT_WINDOW.webContents.loadURL(printHtml);

  // 未打包时打开开发者工具
  // if (!app.isPackaged) {
  //   PRINT_WINDOW.webContents.openDevTools();
  // }

  // 绑定窗口事件
  initPrintEvent();

  return PRINT_WINDOW;
}

/**
 * @description: 绑定打印窗口事件
 * @return {Void}
 */
function initPrintEvent() {
  ipcMain.on("do", async (event, data) => {
    let socket = null;
    if (data.clientType === "local") {
      socket = SOCKET_SERVER.sockets.sockets.get(data.socketId);
    } else {
      socket = SOCKET_CLIENT;
    }
    const printers = await PRINT_WINDOW.webContents.getPrintersAsync();
    let havePrinter = false;
    let defaultPrinter = data.printer || store.get("defaultPrinter", "");
    let printerError = false;
    printers.forEach((element) => {
      // 获取默认打印机
      if (
        element.isDefault &&
        (defaultPrinter == "" || defaultPrinter == void 0)
      ) {
        defaultPrinter = element.name;
      }
      // 判断打印机是否存在
      if (element.name === defaultPrinter) {
        // todo: 打印机状态对照表
        // win32: https://learn.microsoft.com/en-us/windows/win32/printdocs/printer-info-2
        // cups: https://www.cups.org/doc/cupspm.html#ipp_status_e
        if (process.platform === "win32") {
          if (element.status != 0) {
            printerError = true;
          }
        } else {
          if (element.status != 3) {
            printerError = true;
          }
        }
        havePrinter = true;
      }
    });
    if (printerError) {
      const { StatusMsg } = getCurrentPrintStatusByName(defaultPrinter);
      log(
        `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
          data.templateId
        }】 打印失败，打印机异常，打印机：${defaultPrinter}, 打印机状态：${StatusMsg}`,
      );
      socket &&
        socket.emit("error", {
          msg: data.printer + "打印机异常",
          templateId: data.templateId,
          replyId: data.replyId,
        });
      if (data.taskId) {
        // 通过 taskMap 调用 task done 回调
        PRINT_RUNNER_DONE[data.taskId]();
        delete PRINT_RUNNER_DONE[data.taskId];
      }
      MAIN_WINDOW.webContents.send("printTask", PRINT_RUNNER.isBusy());
      return;
    }
    let deviceName = defaultPrinter;

    const logPrintResult = (status, errorMessage = "") => {
      db.run(
        `INSERT INTO print_logs (socketId, clientType, printer, templateId, data, pageNum, status, rePrintAble, errorMessage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          socket?.id,
          data.clientType,
          deviceName,
          data.templateId,
          JSON.stringify(data),
          data.pageNum,
          status,
          data.rePrintAble ?? 1,
          errorMessage,
        ],
        (err) => {
          if (err) {
            console.error("Failed to log print result", err);
          }
        },
      );
    };

    // pdf 打印
    let isPdf = data.type && `${data.type}`.toLowerCase() === "pdf";
    if (isPdf) {
      const pdfPath = path.join(
        store.get("pdfPath") || os.tmpdir(),
        "hiprint",
        dayjs().format(`YYYY_MM_DD HH_mm_ss_`) + `${uuidv7()}.pdf`,
      );
      fs.mkdirSync(path.dirname(pdfPath), {
        recursive: true,
      });
      PRINT_WINDOW.webContents
        .printToPDF({
          landscape: data.landscape ?? false, // 横向打印
          displayHeaderFooter: data.displayHeaderFooter ?? false, // 显示页眉页脚
          printBackground: data.printBackground ?? true, // 打印背景色
          scale: data.scale ?? 1, // 渲染比例 默认 1
          pageSize: data.pageSize,
          margins: data.margins ?? {
            marginType: "none",
          }, // 边距
          pageRanges: data.pageRanges, // 打印页数范围
          headerTemplate: data.headerTemplate, // 页头模板 (html)
          footerTemplate: data.footerTemplate, // 页脚模板 (html)
          preferCSSPageSize: data.preferCSSPageSize ?? false,
        })
        .then((pdfData) => {
          fs.writeFileSync(pdfPath, pdfData);
          printPdf(pdfPath, deviceName, data)
            .then(() => {
              log(
                `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
                  data.templateId
                }】 打印成功，打印类型：PDF，打印机：${deviceName}，页数：${
                  data.pageNum
                }`,
              );
              if (socket) {
                const result = {
                  msg: "打印成功",
                  templateId: data.templateId,
                  replyId: data.replyId,
                };
                socket.emit("successs", result); // 兼容 vue-plugin-hiprint 0.0.56 之前包
                socket.emit("success", result);
              }
              logPrintResult("success");
            })
            .catch((err) => {
              log(
                `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
                  data.templateId
                }】 打印失败，打印类型：PDF，打印机：${deviceName}，原因：${
                  err.message
                }`,
              );
              socket &&
                socket.emit("error", {
                  msg: "打印失败: " + err.message,
                  templateId: data.templateId,
                  replyId: data.replyId,
                });
              logPrintResult("failed", err.message);
            })
            .finally(() => {
              if (data.taskId) {
                // 通过taskMap 调用 task done 回调
                PRINT_RUNNER_DONE[data.taskId]();
                // 删除 task
                delete PRINT_RUNNER_DONE[data.taskId];
              }
              MAIN_WINDOW.webContents.send("printTask", PRINT_RUNNER.isBusy());
            });
        });
      return;
    }
    // url_pdf 打印
    const isUrlPdf = data.type && `${data.type}`.toLowerCase() === "url_pdf";
    if (isUrlPdf) {
      printPdf(data.pdf_path, deviceName, data)
        .then(() => {
          log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
              data.templateId
            }】 打印成功，打印类型：URL_PDF，打印机：${deviceName}，页数：${
              data.pageNum
            }`,
          );
          if (socket) {
            checkPrinterStatus(deviceName, () => {
              const result = {
                msg: "打印成功",
                templateId: data.templateId,
                replyId: data.replyId,
              };
              socket.emit("successs", result); // 兼容 vue-plugin-hiprint 0.0.56 之前包
              socket.emit("success", result);
            });
          }
          logPrintResult("success");
        })
        .catch((err) => {
          log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
              data.templateId
            }】 打印失败，打印类型：URL_PDF，打印机：${deviceName}，原因：${
              err.message
            }`,
          );
          socket &&
            socket.emit("error", {
              msg: "打印失败: " + err.message,
              templateId: data.templateId,
              replyId: data.replyId,
            });
          logPrintResult("failed", err.message);
        })
        .finally(() => {
          if (data.taskId) {
            // 通过 taskMap 调用 task done 回调
            PRINT_RUNNER_DONE[data.taskId]();
            // 删除 task
            delete PRINT_RUNNER_DONE[data.taskId];
          }
          MAIN_WINDOW.webContents.send("printTask", PRINT_RUNNER.isBusy());
        });
      return;
    }
    // blob_pdf 打印 - 直接接收二进制PDF数据
    const isBlobPdf = data.type && `${data.type}`.toLowerCase() === "blob_pdf";
    if (isBlobPdf) {
      // 参数校验
      if (!data.pdf_blob) {
        const errorMsg = "blob_pdf类型打印缺少pdf_blob参数";
        log(
          `${data.replyId ? "中转服务" : "插件端"} ${socket?.id} 模板 【${
            data.templateId
          }】 打印失败，原因：${errorMsg}`,
        );
        socket &&
        socket.emit("error", {
          msg: errorMsg,
          templateId: data.templateId,
          replyId: data.replyId,
        });
        logPrintResult("failed", errorMsg);
        if (data.taskId) {
          PRINT_RUNNER_DONE[data.taskId]();
          delete PRINT_RUNNER_DONE[data.taskId];
        }
        MAIN_WINDOW.webContents.send("printTask", PRINT_RUNNER.isBusy());
        return;
      }
      
      printPdfBlob(data.pdf_blob, deviceName, data)
        .then(() => {
          log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
              data.templateId
            }】 打印成功，打印类型：BLOB_PDF，打印机：${deviceName}，页数：${
              data.pageNum
            }`,
          );
          if (socket) {
            checkPrinterStatus(deviceName, () => {
              const result = {
                msg: "打印成功",
                templateId: data.templateId,
                replyId: data.replyId,
              };
              socket.emit("successs", result); // 兼容 vue-plugin-hiprint 0.0.56 之前包
              socket.emit("success", result);
            });
          }
          logPrintResult("success");
        })
        .catch((err) => {
          log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
              data.templateId
            }】 打印失败，打印类型：BLOB_PDF，打印机：${deviceName}，原因：${
              err.message
            }`,
          );
          socket &&
          socket.emit("error", {
            msg: "打印失败: " + err.message,
            templateId: data.templateId,
            replyId: data.replyId,
          });
          logPrintResult("failed", err.message);
        })
        .finally(() => {
          if (data.taskId) {
            // 通过 taskMap 调用 task done 回调
            PRINT_RUNNER_DONE[data.taskId]();
            // 删除 task
            delete PRINT_RUNNER_DONE[data.taskId];
          }
          MAIN_WINDOW.webContents.send("printTask", PRINT_RUNNER.isBusy());
        });
    }

    // 打印 详见https://www.electronjs.org/zh/docs/latest/api/web-contents
    PRINT_WINDOW.webContents.print(
      {
        silent: data.silent ?? true, // 静默打印
        printBackground: data.printBackground ?? true, // 是否打印背景
        deviceName: deviceName, // 打印机名称
        color: data.color ?? true, // 是否打印颜色
        margins: data.margins ?? {
          marginType: "none",
        }, // 边距
        landscape: data.landscape ?? false, // 是否横向打印
        scaleFactor: data.scaleFactor ?? 100, // 打印缩放比例
        pagesPerSheet: data.pagesPerSheet ?? 1, // 每张纸的页数
        collate: data.collate ?? true, // 是否排序
        copies: data.copies ?? 1, // 打印份数
        pageRanges: data.pageRanges ?? {}, // 打印页数
        duplexMode: data.duplexMode, // 打印模式 simplex,shortEdge,longEdge
        dpi: data.dpi ?? 300, // 打印机DPI
        header: data.header, // 打印头
        footer: data.footer, // 打印尾
        pageSize: data.pageSize, // 打印纸张
      },
      (success, failureReason) => {
        if (success) {
          log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket?.id} 模板 【${
              data.templateId
            }】 打印成功，打印类型 HTML，打印机：${deviceName}，页数：${
              data.pageNum
            }`,
          );
          logPrintResult("success");
        } else {
          log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket?.id} 模板 【${
              data.templateId
            }】 打印失败，打印类型 HTML，打印机：${deviceName}，原因：${failureReason}`,
          );
          logPrintResult("failed", failureReason);
        }
        if (socket) {
          if (success) {
            const result = {
              msg: "打印成功",
              templateId: data.templateId,
              replyId: data.replyId,
            };
            socket.emit("successs", result); // 兼容 vue-plugin-hiprint 0.0.56 之前包
            socket.emit("success", result);
          } else {
            socket.emit("error", {
              msg: failureReason,
              templateId: data.templateId,
              replyId: data.replyId,
            });
          }
        }
        // 通过 taskMap 调用 task done 回调
        if (data.taskId) {
          PRINT_RUNNER_DONE[data.taskId]();
          // 删除 task
          delete PRINT_RUNNER_DONE[data.taskId];
        }
        MAIN_WINDOW.webContents.send("printTask", PRINT_RUNNER.isBusy());
      },
    );
  });
}

function checkPrinterStatus(deviceName, callback) {
  const intervalId = setInterval(() => {
    PRINT_WINDOW.webContents
      .getPrintersAsync()
      .then((printers) => {
        const printer = printers.find((printer) => printer.name === deviceName);
        log(`current printer: ${JSON.stringify(printer)}`);
        const ISCAN_STATUS = process.platform === "win32" ? 0 : 3;
        if (printer && printer.status === ISCAN_STATUS) {
          callback && callback();
          clearInterval(intervalId); // Stop polling when status is 0
          log(`Printer ${deviceName} is now ready (status: ${ISCAN_STATUS})`);
          // You can add any additional logic here for when the printer is ready
        }
      })
      .catch((error) => {
        clearInterval(intervalId); // Also clear interval on error
        log(`Error checking printer status: ${error}`);
      });
  }, 1000); // Check every 1 second (adjust interval as needed)

  return intervalId; // Return the interval ID in case you need to cancel it externally
}

module.exports = async () => {
  // 创建打印窗口
  await createPrintWindow();
};
