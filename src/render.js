"use strict";

const fs = require("fs");
const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const path = require("path");
const { Jimp } = require("jimp");
const dayjs = require("dayjs");

const { store } = require("../tools/utils");
const db = require("../tools/database");

// 这是 1920 * 1080 屏幕常规工作区域尺寸
let windowWorkArea = {
  width: 1920,
  height: 1032,
};

/**
 * @typedef {Object} CapturePageData 截图数据
 * @property {string} clientType socket 客户端类型  'local' | 'transit'
 * @property {string} socketId socket id
 * @property {string} replyId 中转回复 id
 * @property {string} templateId 模版 id
 * @property {string} taskId 任务 id
 * @property {number} x x坐标
 * @property {number} y y坐标
 * @property {number} width 宽度
 * @property {number} height 高度
 */

/**
 * @typedef {object} PageSize PDF 尺寸
 * @property {number} width 宽度
 * @property {number} height 高度
 */

/**
 * @typedef {object} Margins 边距
 * @property {number} top 上边距
 * @property {number} bottom 下边距
 * @property {number} left 左边距
 * @property {number} right 右边距
 */

/**
 * @typedef {Object} PrintToPDFData
 * @property {string} clientType socket 客户端类型  'local' | 'transit'
 * @property {string} socketId socket id
 * @property {string} replyId 中转回复 id
 * @property {string} templateId 模版 id
 * @property {string} taskId 任务 id
 * @property {boolean} landscape 网页是否应以横向模式打印 默认 true
 * @property {boolean} displayHeaderFooter 是否显示页眉和页脚 默认 false
 * @property {boolean} printBackground 是否打印背景图形 默认 false
 * @property {number} scale  网页渲染的比例 默认 1
 * @property {string | PageSize} pageSize 指定生成的 PDF 的页面大小 默认 Letter
 * @property {string | Margins} margins 边距
 * @property {string} pageRanges 要打印的页面范围 例如 '1-5, 8, 11-13'
 * @property {string} headerTemplate 打印标题的 HTML 模板
 * @property {string} footerTemplate 打印页脚的 HTML 模板
 * @property {number} preferCSSPageSize 是否优先使用 css 定义的页面大小
 */

/**
 * @description: 创建打印窗口
 * @return {BrowserWindow} RENDER_WINDOW 打印窗口
 */
async function createRenderWindow() {
  const windowOptions = {
    width: 300, // 窗口宽度
    height: 500, // 窗口高度
    show: false, // 不显示
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用electron api
      nodeIntegration: true,
    },
    // 为窗口设置背景色可能优化字体模糊问题
    // https://www.electronjs.org/zh/docs/latest/faq#文字看起来很模糊这是什么原因造成的怎么解决这个问题呢
    backgroundColor: "#fff",
  };

  // 创建打印窗口
  RENDER_WINDOW = new BrowserWindow(windowOptions);

  // 加载打印渲染进程页面
  let printHtml = path.join("file://", app.getAppPath(), "/assets/render.html");
  RENDER_WINDOW.webContents.loadURL(printHtml);

  RENDER_WINDOW.on("ready-to-show", () => {
    const windowBounds = RENDER_WINDOW.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: windowBounds.x,
      y: windowBounds.y,
    });

    windowWorkArea = display.workAreaSize;

    // 未打包时打开开发者工具
    if (!app.isPackaged) {
      // !打开开发者模式时，窗口尺寸变化将在右上角显示窗口尺寸，对 capturePage 功能会造成一定的误解
      RENDER_WINDOW.webContents.openDevTools();
    }
  });

  // 绑定窗口事件
  initEvent();

  RENDER_WINDOW.on("closed", removeEvent);

  return RENDER_WINDOW;
}

/**
 * @description: 截图
 * @param {IpcMainEvent} event 事件
 * @param {CapturePageData} data 截图数据
 */
async function capturePage(event, data) {
  let socket = null;
  if (data.clientType === "local") {
    socket = SOCKET_SERVER.sockets.sockets.get(data.socketId);
  } else {
    socket = SOCKET_CLIENT;
  }
  // !在 win 上窗口可以超出屏幕尺寸，直接使用 webContents.capturePage api 截图没有问题
  // !在 mac 上窗口不能超出屏幕尺寸，需要一点儿点儿截图最后拼接
  try {
    let images = [];

    // 打印元素宽度
    const printWidth = Math.ceil(data.width);
    // 打印元素高度
    const printHeight = Math.ceil(data.height);

    // 窗口内容区域宽度
    let innerWidth = await RENDER_WINDOW.webContents.executeJavaScript(
      "window.innerWidth",
    );
    innerWidth = Math.ceil(innerWidth);

    // 窗口内容区域高度
    let innerHeight = await RENDER_WINDOW.webContents.executeJavaScript(
      "window.innerHeight",
    );
    innerHeight = Math.ceil(innerHeight);

    // 元素高度与窗口高度获取最小值，如果窗口比元素小
    const height = Math.min(printHeight, innerHeight);

    // 将窗口移至屏幕左上角
    RENDER_WINDOW.setBounds({
      x: 0,
      y: 0,
    });
    // 设置内容区大小
    RENDER_WINDOW.setContentSize(printWidth, height, false);

    const captureOptions = {
      x: 0,
      y: 0,
      width: printWidth,
      height,
    };

    // 截取首图
    const nativeImage = await RENDER_WINDOW.webContents.capturePage(
      captureOptions,
    );
    // 有说法 toJPEG 性能比 toPNG 更高
    images.push(nativeImage.resize({ width: printWidth }).toJPEG(100));

    // 截取剩余图
    for (let offset = height; offset < data.height; offset += height) {
      await RENDER_WINDOW.webContents.executeJavaScript(
        `window.scrollTo(0, ${offset})`,
        false,
      );

      // 等待滚动完成
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 计算最后一页需要截取的高度
      captureOptions.height = offset > height ? offset - height : height;

      const image = await RENDER_WINDOW.webContents.capturePage(captureOptions);
      // 有说法 toJPEG 性能比 toPNG 更高
      images.push(image.resize({ width: printWidth }).toJPEG(100));
    }

    // 使用 jimp 拼接图片
    const result = new Jimp({ width: printWidth, height: printHeight });

    for (let idx = 0; idx < images.length; idx++) {
      const jimpImg = await Jimp.fromBuffer(images[idx]);
      result.composite(jimpImg, 0, idx * height);
    }

    result
      .getBuffer("image/jpeg", {
        quality: 100,
      })
      .then((buffer) => {
        // 未打包调试模式下将图片保存到桌面
        if (!app.isPackaged) {
          fs.writeFile(
            path.join(
              app.getPath("desktop"),
              `capture_${dayjs().format("YYYY-MM-DD HH_mm_ss")}.png`,
            ),
            buffer,
            () => {},
          );
        }
        console.log(
          `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模版 【${
            data.templateId
          }】 获取 png 成功`,
        );
        socket.emit("render-jpeg-success", {
          msg: `获取 jpeg 成功`,
          templateId: data.templateId,
          buffer,
          replyId: data.replyId,
        });
      });
  } catch (error) {
    console.log(
      `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模版 【${
        data.templateId
      }】 获取 png 失败`,
    );
    socket &&
      socket.emit("render-jpeg-error", {
        msg: `获取 png 失败`,
        templateId: data.templateId,
        replyId: data.replyId,
      });
  } finally {
    RENDER_RUNNER_DONE[data.taskId]();
    delete RENDER_RUNNER_DONE[data.taskId];
  }
}

/**
 * @description: 打印到PDF
 * @param {IpcMainEvent} event 事件
 * @param {PrintToPDFData} data 打印数据
 */
function printToPDF(event, data) {
  let socket = null;
  if (data.clientType === "local") {
    socket = SOCKET_SERVER.sockets.sockets.get(data.socketId);
  } else {
    socket = SOCKET_CLIENT;
  }
  RENDER_WINDOW.webContents
    .printToPDF({
      landscape: data.landscape ?? false, // 横向打印
      displayHeaderFooter: data.displayHeaderFooter ?? false, // 显示页眉页脚
      printBackground: data.printBackground ?? true, // 打印背景色
      scale: data.scale ?? 1, // 渲染比例 默认 1
      pageSize: data.pageSize,
      margins: data.margins, // 边距
      pageRanges: data.pageRanges, // 打印页数范围
      headerTemplate: data.headerTemplate, // 页头模板 (html)
      footerTemplate: data.footerTemplate, // 页脚模板 (html)
      preferCSSPageSize: data.preferCSSPageSize ?? false,
    })
    .then((buffer) => {
      // 未打包调试模式下将pdf保存到桌面
      if (!app.isPackaged) {
        fs.writeFile(
          path.join(
            app.getPath("desktop"),
            `pdf_${dayjs().format("YYYY-MM-DD HH_mm_ss")}.pdf`,
          ),
          buffer,
          () => {},
        );
      }
      socket.emit("render-pdf-success", {
        templateId: data.templateId,
        buffer,
        replyId: data.replyId,
      });
    })
    .catch((error) => {
      console.log(
        `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模版 【${
          data.templateId
        }】 获取 pdf 失败`,
      );
      socket &&
        socket.emit("render-pdf-error", {
          msg: `获取 pdf 失败`,
          templateId: data.templateId,
          replyId: data.replyId,
        });
    })
    .finally(() => {
      RENDER_RUNNER_DONE[data.taskId]();
      delete RENDER_RUNNER_DONE[data.taskId];
    });
}

/**
 * @description: 打印
 * @param {IpcMainEvent} event 事件
 * @param {object} data 打印数据
 *
 * */
async function printFun(event, data) {
  let socket = null;
  if (data.clientType === "local") {
    socket = SOCKET_SERVER.sockets.sockets.get(data.socketId);
  } else {
    socket = SOCKET_CLIENT;
  }
  const printers = await RENDER_WINDOW.webContents.getPrintersAsync();
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
    console.log(
      `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
        data.templateId
      }】 打印失败，打印机异常，打印机：${data.printer}`,
    );
    socket &&
      socket.emit("render-print-error", {
        msg: data.printer + "打印机异常",
        templateId: data.templateId,
        replyId: data.replyId,
      });
    // 通过 taskMap 调用 task done 回调
    PRINT_RUNNER_DONE[data.taskId]();
    delete PRINT_RUNNER_DONE[data.taskId];
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

  // 打印 详见https://www.electronjs.org/zh/docs/latest/api/web-contents
  RENDER_WINDOW.webContents.print(
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
      if (socket) {
        if (success) {
          console.log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
              data.templateId
            }】 打印成功，打印类型 JSON，打印机：${deviceName}，页数：${
              data.pageNum
            }`,
          );
          const result = {
            msg: "打印成功",
            templateId: data.templateId,
            replyId: data.replyId,
          };
          logPrintResult("success");
          socket.emit("render-print-success", result);
        } else {
          console.log(
            `${data.replyId ? "中转服务" : "插件端"} ${socket.id} 模板 【${
              data.templateId
            }】 打印失败，打印类型 JSON，打印机：${deviceName}，原因：${failureReason}`,
          );
          logPrintResult("failed", failureReason);
          socket.emit("render-print-error", {
            msg: failureReason,
            templateId: data.templateId,
            replyId: data.replyId,
          });
        }
      }
      // 通过 taskMap 调用 task done 回调
      RENDER_RUNNER_DONE[data.taskId]();
      // 删除 task
      delete RENDER_RUNNER_DONE[data.taskId];
    },
  );
}

/**
 * @description: 渲染进程触发弹出消息框
 * @param {IpcMainEvent} event
 * @param {Object} data https://www.electronjs.org/zh/docs/latest/api/dialog#dialogshowmessageboxbrowserwindow-options
 * @return {void}
 */
function showMessageBox(event, data) {
  dialog.showMessageBox(SET_WINDOW, { noLink: true, ...data });
}

/**
 * @description: 初始化事件
 */
function initEvent() {
  ipcMain.on("capturePage", capturePage);
  ipcMain.on("printToPDF", printToPDF);
  ipcMain.on("print", printFun);
  ipcMain.on("showMessageBox", showMessageBox);
}

/**
 * @description: 移除事件
 * @return {void}
 */
function removeEvent() {
  ipcMain.removeListener("capturePage", capturePage);
  ipcMain.removeListener("printToPDF", printToPDF);
  ipcMain.removeListener("print", printFun);
  ipcMain.removeListener("showMessageBox", showMessageBox);
  RENDER_WINDOW = null;
}

module.exports = async () => {
  // 创建渲染窗口
  await createRenderWindow();
};
