"use strict";

const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const helper = require("./helper");
const address = require("address");

// 托盘
async function initTray() {
  let trayPath = path.join(app.getAppPath(), "/assets/icons/tray.png");
  APP_TRAY = new Tray(trayPath);
  APP_TRAY.setToolTip("hiprint"); // 托盘标题
  // 托盘菜单
  let trayMenuTemplate = [
    {
      label: "退出",
      click: () => {
        MAIN_WINDOW.destroy();
        APP_TRAY.destroy();
        helper.appQuit();
      },
    },
  ];
  const contextMenu = Menu.buildFromTemplate(trayMenuTemplate);
  APP_TRAY.setContextMenu(contextMenu);
  // 监听点击事件
  APP_TRAY.on("click", function() {
    if (MAIN_WINDOW.isMinimized()) {
      MAIN_WINDOW.restore();
    }
    if (!MAIN_WINDOW.isVisible()) {
      MAIN_WINDOW.show();
      MAIN_WINDOW.setSkipTaskbar(true);
    }
  });
  return APP_TRAY;
}

// 初始化socket.io
async function initSocketIo() {
  io.on("connection", (client) => {
    // 暂存客户端
    socketStore[client.id] = client;
    // data:{printer:option.printer,html:htmlstr}
    client.emit("printerList", MAIN_WINDOW.webContents.getPrinters());
    client.on("news", (data) => {
      if (data && data.html) {
        data.printer = data.printer;
        data.socketId = client.id;
        PRINT_WINDOW.webContents.send("print-new", data);
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
          address.mac(function (err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
        case "dns":
          address.dns(function (err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
        case "interface":
          client.emit("address", type, address.interface(...args));
          break;
        case "all":
          address(function (err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
        case "vboxnet":
          address('vboxnet', function (err, addr) {
            client.emit("address", type, addr, err);
          });
        default:
          address('all', function (err, addr) {
            client.emit("address", type, addr, err);
          });
          break;
      }
    });
  });
  try {
    server.listen(17521);
  } catch (error) {
    alert("服务已开启/端口被占用");
    console.log(error);
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
    printers.forEach((element) => {
      if (element.name === data.printer) {
        if (element.status != 0) {
          if (socket) {
            socket.emit("error", {
              msg: data.printer + "打印机异常",
              templateId: data.templateId,
            });
          }
          return;
        }
        havePrinter = true;
      }
      if (element.isDefault) {
        defaultPrinter = element.name;
      }
    });
    let deviceName = havePrinter ? data.printer : defaultPrinter;
    // 打印 详见https://www.electronjs.org/zh/docs/latest/api/web-contents
    PRINT_WINDOW.webContents.print(
      {
        silent: data.silent || true, // 静默打印
        printBackground: data.printBackground || true, // 是否打印背景
        deviceName: deviceName, // 打印机名称
        color: data.color || true, // 是否打印颜色
        margins: data.margins || {
          marginType: "none",
        }, // 边距
        landscape: data.landscape || false, // 是否横向打印
        scaleFactor: data.scaleFactor || 100, // 打印缩放比例
        pagesPerSheet: data.pagesPerSheet || 1, // 每张纸的页数
        collate: data.collate || true, // 是否排序
        copies: data.copies || 1, // 打印份数
        pageRanges: data.pageRanges || {}, // 打印页数
        duplexMode: data.duplexMode, // 打印模式 simplex,shortEdge,longEdge
        dpi: data.dpi,  // 打印机DPI
        header: data.header, // 打印头
        footer: data.footer, // 打印尾
        pageSize: data.pageSize, // 打印纸张
      },
      (printResult,info) => {
        console.log(printResult);
        console.log(info);
        if (socket) {
          socket.emit("successs", {
            msg: "打印机成功",
            templateId: data.templateId,
          });
        }
      }
    );
  });
}

module.exports = async () => {
  // 初始化托盘
  await initTray();
  // 初始化socket.io
  await initSocketIo();
  // 创建打印窗口
  await createPrintWindow();
};
