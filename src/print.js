"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const helper = require("./helper");
const printPdf = require("./pdf-print");
const address = require("address");
const ipp = require("ipp");
const TaskRunner = require("concurrent-tasks");

// 新建并发任务，并发数1
const runner = new TaskRunner({
  concurrency: 1,
});

// task map
const taskMap = {};

// 初始化socket.io
let socketList = [];
async function initSocketIo() {
  io.on("connection", (client) => {
    socketList = [];
    // 暂存客户端
    socketStore[client.id] = client;
    // data:{printer:option.printer,html:htmlstr}
    client.emit("printerList", MAIN_WINDOW.webContents.getPrinters());
    client.on("news", (data) => {
      if (data && data.html) {
        // 向并发中添加任务
        runner.add((done) => {
          data.printer = data.printer;
          data.socketId = client.id;
          // 使用时间戳作为并发任务id
          let taskId = new Date().getTime();
          // 在taskMap中添加任务done事件
          taskMap[taskId] = done;
          data.taskId = taskId;
          PRINT_WINDOW.webContents.send("print-new", data);
        });
        MAIN_WINDOW.webContents.send("printTask", Object.keys(taskMap).length);
      }
    });
    // 刷新打印机列表
    client.on("refreshPrinterList", (data) => {
      client.emit("printerList", MAIN_WINDOW.webContents.getPrinters());
    });
    // 获取IP、IPV6、MAC地址、DNS
    client.on("address", (type, ...args) => {
      switch (type) {
        case "ip":
          client.emit("address", type, address.ip());
          break;
        case "ipv6":
          client.emit("address", type, address.ipv6());
          break;
        case "mac":
          address.mac(function(err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
        case "dns":
          address.dns(function(err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
        case "interface":
          client.emit("address", type, address.interface(...args));
          break;
        case "all":
          address(function(err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
        case "vboxnet":
          address("vboxnet", function(err, addr) {
            client.emit("address", type, addr, err);
          });
        default:
          address("all", function(err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
      }
    });
    // ipp打印 详见：https://www.npmjs.com/package/ipp
    client.on("ippPrint", (options) => {
      try {
        const { url, opt, action, message } = options;
        let printer = ipp.Printer(url, opt);
        client.emit("ippPrinterConnected", printer);
        let msg = Object.assign(
          {
            "operation-attributes-tag": {
              "requesting-user-name": "hiPrint",
            },
          },
          message
        );
        // data 必须是 Buffer
        if (msg.data && !Buffer.isBuffer(msg.data)) {
          if ("string" == typeof msg.data) {
            msg.data = Buffer.from(msg.data, msg.encoding || "utf-8");
          } else {
            msg.data = Buffer.from(msg.data);
          }
        }
        /**
         * action: Get-Printer-Attributes 获取打印机支持参数
         * action: Print-Job 新建打印任务
         * action: Cancel-Job 取消打印任务
         */
        printer.execute(action, msg, (err, res) => {
          client.emit("ippPrinterCallback", err ? { type: err.name, msg: err.message } : null, res);
        });
      } catch (err) {
        client.emit("ippPrinterCallback", {
          type: err.name,
          msg: err.message,
        });
      }
    });
    // ipp request
    client.on("ippRequest", (options) => {
      try {
        const { url, data } = options;
        let _data = ipp.serialize(data);
        ipp.request(url, _data, function(err, res) {
          client.emit("ippRequestCallback", err ? { type: err.name, msg: err.message } : null, res);
        });
      } catch (err) {
        client.emit("ippRequestCallback", {
          type: err.name,
          msg: err.message,
        });
      }
    });
    // 断开连接
    client.on("disconnect", () => {
      // 删除断开连接的客户端
      delete socketStore[client.id];
      socketList = [];
      Object.keys(socketStore).forEach((key) => {
        socketStore[key].connected && socketList.push(key);
      });
      MAIN_WINDOW.webContents.send("connection", socketList);
    });
    Object.keys(socketStore).forEach((key) => {
      socketStore[key].connected && socketList.push(key);
    });
    // 向主页面发送 connection 事件
    MAIN_WINDOW.webContents.send("connection", socketList);
  });
  try {
    server.listen(17521);
  } catch (error) {
    alert("服务已开启/端口被占用");
  }
}

async function createPrintWindow() {
  const windowOptions = {
    width: 100,
    height: 100,
    show: false,
    webPreferences: {
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用electron api
      nodeIntegration: true,
    },
  };
  PRINT_WINDOW = new BrowserWindow(windowOptions);
  let printHtml = path.join("file://", app.getAppPath(), "/assets/print.html");
  PRINT_WINDOW.webContents.loadURL(printHtml);
  // PRINT_WINDOW.webContents.openDevTools();
  initPrintEvent();
}

function initPrintEvent() {
  ipcMain.on("do", (event, data) => {
    // socket.emit('news', { id: 1 })
    let socket = socketStore[data.socketId];
    const printers = PRINT_WINDOW.webContents.getPrinters();
    let havePrinter = false;
    let defaultPrinter = "";
    let printerError = false;
    printers.forEach((element) => {
      if (element.name === data.printer) {
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
      if (element.isDefault) {
        defaultPrinter = element.name;
      }
    });
    if (printerError) {
      socket &&
        socket.emit("error", {
          msg: data.printer + "打印机异常",
          templateId: data.templateId,
        });
      // 通过taskMap 调用 task done 回调
      taskMap[data.taskId]();
      return;
    }
    let deviceName = havePrinter ? data.printer : defaultPrinter;
    let isPdf = data.type && `${data.type}`.toLowerCase() === "pdf";
    if (isPdf) {
      const pdfPath = path.join(os.tmpdir(), "hiprint", "temp.pdf");
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
      console.log(`PDF to ${pdfPath}`);
      PRINT_WINDOW.webContents.printToPDF({}).then((pdfData) => {
        fs.writeFileSync(pdfPath, pdfData);
        console.log(`Wrote PDF successfully to ${pdfPath}`);
        printPdf(pdfPath, deviceName, data)
          .then(() => {
            console.log(`print PDF success ??`);
            socket &&
              socket.emit("successs", {
                msg: "打印机成功",
                templateId: data.templateId,
              });
          })
          .catch((err) => {
            socket &&
              socket.emit("error", {
                msg: "打印失败: " + err.message,
                templateId: data.templateId,
              });
          })
          .finally(() => {
            // 通过taskMap 调用 task done 回调
            taskMap[data.taskId]();
            // 删除 task
            delete taskMap[data.taskId];
            MAIN_WINDOW.webContents.send("printTask", Object.keys(taskMap).length);
          });
      });
    } else {
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
          dpi: data.dpi, // 打印机DPI
          header: data.header, // 打印头
          footer: data.footer, // 打印尾
          pageSize: data.pageSize, // 打印纸张
        },
        (success, failureReason) => {
          if (socket) {
            success
              ? socket.emit("successs", {
                  msg: "打印机成功",
                  templateId: data.templateId,
                })
              : socket.emit("error", {
                  msg: failureReason,
                  templateId: data.templateId,
                });
          }
          // 通过taskMap 调用 task done 回调
          taskMap[data.taskId]();
          // 删除 task
          delete taskMap[data.taskId];
          MAIN_WINDOW.webContents.send("printTask", Object.keys(taskMap).length);
        }
      );
    }
  });
}

module.exports = async () => {
  // 初始化socket.io
  await initSocketIo();
  // 创建打印窗口
  await createPrintWindow();
};
