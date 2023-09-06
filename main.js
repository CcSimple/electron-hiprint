const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Tray,
  Menu,
} = require("electron");
const path = require("path");
const server = require("http").createServer();
const helper = require("./src/helper");
const printSetup = require("./src/print");
const setSetup = require("./src/set");
const { readConfig } = require("./tools/file");
const { machineIdSync } = require("node-machine-id");
const address = require("address");

// 主进程
global.MAIN_WINDOW = null;
global.APP_TRAY = null;

// 打印窗口
global.PRINT_WINDOW = null;
global.SET_WINDOW = null;

global.server = server;

const io = new require("socket.io")(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 10000000000,
  allowEIO3: true, // 兼容 Socket.IO 2.x
  // 跨域问题(Socket.IO 3.x 使用这种方式)
  cors: {
    // origin: "*",
    // 兼容 Socket.IO 2.x
    origin: (requestOrigin, callback) => {
      // 允许所有域名连接
      callback(null, requestOrigin);
    },
    methods: "GET, POST, PUT, DELETE, OPTIONS",
    allowedHeaders: "*",
    // 详情参数见 https://www.npmjs.com/package/cors
    credentials: false,
  },
});

global.io = io;

global.socketStore = {};

// 初始化
async function initialize() {
  // 限制一个窗口
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    helper.appQuit();
  }
  app.on("second-instance", (event) => {
    if (MAIN_WINDOW) {
      if (MAIN_WINDOW.isMinimized()) {
        MAIN_WINDOW.restore();
      }
      MAIN_WINDOW.focus();
    }
  });
  // 获取设备唯一id
  ipcMain.on("getMachineId", function(event) {
    event.sender.send("machineId", machineIdSync({ original: true }));
  });

  // 获取设备ip、mac等信息
  ipcMain.on("getAddress", function(event) {
    address(function(err, arg) {
      event.sender.send("address", {
        ...arg,
        port: global.PLUGIN_CONFIG?.port,
      });
    });
  });
  // 当electron完成初始化
  app.whenReady().then(() => {
    // 创建浏览器窗口
    createWindow();
    app.on("activate", function() {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
  // 关闭了所有窗口
  app.on("window-all-closed", function() {
    if (process.platform !== "darwin") {
      helper.appQuit();
    }
  });
}

// 主窗口
async function createWindow() {
  const windowOptions = {
    width: 500,
    height: 300,
    minWidth: 500,
    minHeight: 300,
    maxWidth: 500,
    maxHeight: 300,
    // titleBarStyle: "customButtonsOnHover", // 标题栏样式
    // show: false, // 不显示窗口
    // transparent: true, // 透明标题栏
    center: true, // 居中
    // alwaysOnTop: true, // 永远置顶
    // resizable: true, // 可缩放
    frame: true, // 显示边框
    webPreferences: {
      // webSecurity: false,
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用electron api
      nodeIntegration: true,
    },
  };
  // win 左上角图标(暂处理：打包后这样设置无法显示...)
  // 若package.json 中设置 .ico 开发可显示，打包后不显示
  if (process.platform === "win32" && process.env.NODE_ENV !== "production") {
    windowOptions.icon = path.join(__dirname, "build/icons/256x256.png");
  }

  MAIN_WINDOW = new BrowserWindow(windowOptions);
  // 白屏的问题
  await loadingView(windowOptions);
  // MAIN_WINDOW.once("ready-to-show", () => {
  //   MAIN_WINDOW.show();
  // });

  // 系统相关
  await systemSetup();
  // 加载主页面
  let indexHtml = path.join("file://", __dirname, "/assets/index.html");
  MAIN_WINDOW.webContents.loadURL(indexHtml);
  if (!app.isPackaged) {
    MAIN_WINDOW.webContents.openDevTools();
  }
  // 退出
  MAIN_WINDOW.on("closed", () => {
    MAIN_WINDOW = null;
    server.close();
  });
  // 点击关闭，最小化到托盘
  MAIN_WINDOW.on("close", (event) => {
    if (PLUGIN_CONFIG.closeType === "tray") {
      MAIN_WINDOW.hide();
      MAIN_WINDOW.setSkipTaskbar(true); // 隐藏任务栏
      event.preventDefault();
    } else {
      SET_WINDOW && SET_WINDOW.destroy();
      MAIN_WINDOW && MAIN_WINDOW.destroy();
      APP_TRAY && APP_TRAY.destroy();
      helper.appQuit();
    }
  });
  // 托盘
  await initTray();
  // 打印相关
  await printSetup();

  return MAIN_WINDOW;
}

// 加载等待页面
async function loadingView(windowOptions) {
  const loadingBrowserView = new BrowserView();
  MAIN_WINDOW.setBrowserView(loadingBrowserView);
  loadingBrowserView.setBounds({
    x: 0,
    y: 0,
    width: windowOptions.width,
    height: windowOptions.height,
  });

  const loadingHtml = path.join("file://", __dirname, "/assets/loading.html");
  loadingBrowserView.webContents.loadURL(loadingHtml);

  MAIN_WINDOW.webContents.on("dom-ready", async (event) => {
    MAIN_WINDOW.removeBrowserView(loadingBrowserView);
  });
}

// 系统相关
async function systemSetup() {
  // 显示标题栏菜单
  // MAIN_WINDOW.setWindowButtonVisibility(false);
  Menu.setApplicationMenu(null);
}

// 托盘
async function initTray() {
  let trayPath = path.join(app.getAppPath(), "/assets/icons/tray.png");
  APP_TRAY = new Tray(trayPath);
  APP_TRAY.setToolTip("hiprint"); // 托盘标题
  // 托盘菜单
  let trayMenuTemplate = [
    {
      label: "设置",
      click: () => {
        if (!SET_WINDOW) {
          setSetup();
          SET_WINDOW.on("close", () => {
            SET_WINDOW = null;
          });
        } else {
          SET_WINDOW.show();
        }
      },
    },
    {
      label: "退出",
      click: () => {
        SET_WINDOW && SET_WINDOW.destroy();
        MAIN_WINDOW && MAIN_WINDOW.destroy();
        APP_TRAY && APP_TRAY.destroy();
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

readConfig()
  .then((PLUGIN_CONFIG) => {
    global.PLUGIN_CONFIG = PLUGIN_CONFIG;
    io.use((socket, next) => {
      if (
        PLUGIN_CONFIG.token &&
        socket.handshake.auth.token != PLUGIN_CONFIG.token
      ) {
        const err = new Error("Authentication error");
        err.data = {
          content: "Token 错误，请检查客户端与服务器 Token 是否一致",
        };
        next(err);
      } else {
        next();
      }
    });
  })
  .finally(() => {
    initialize();
  });
