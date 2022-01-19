const { app, BrowserWindow, BrowserView, ipcMain, Menu } = require("electron");
const path = require("path");
const server = require("http").createServer();
const helper = require("./src/helper");
const printSetup = require("./src/print");

// 主进程
global.MAIN_WINDOW = null;
global.APP_TRAY = null;
global.CAN_QUIT = false;

// 打印窗口
global.PRINT_WINDOW = null;

// socket.io
// 跨域问题
server.on("request", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  // 允许私人网络请求  // 请求端 header 添加 "Access-Control-Request-Private-Network": true,
  // ... 然并卵
  res.setHeader("Access-Control-Allow-Private-Network", true);
});
global.server = server;
const io = require("socket.io")(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 10000000000,
  // 跨域问题
  cors: {
    origin: "*",
    methods: "GET, POST, PUT, DELETE, OPTIONS",
    allowedHeaders: "*",
    // 详情参数见 https://www.npmjs.com/package/cors
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 204,
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
    width: 400,
    height: 200,
    minWidth: 380,
    minHeight: 100,
    titleBarStyle: "hidden", // 标题栏样式
    // show: false, // 不显示窗口
    transparent: true, // 透明标题栏
    center: true, // 居中
    // resizable: true, // 可缩放
    frame: true, // 显示边框
    webPreferences: {
      // webSecurity: false,
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用electron api
      nodeIntegration: true,
    },
  };
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
  // MAIN_WINDOW.webContents.openDevTools();
  // 退出
  MAIN_WINDOW.on("closed", () => {
    MAIN_WINDOW = null;
    server.close();
  });
  // 点击关闭，最小化到托盘
  MAIN_WINDOW.on("close", (event) => {
    if (!CAN_QUIT) {
      MAIN_WINDOW.hide();
      MAIN_WINDOW.setSkipTaskbar(true); // 隐藏任务栏
      event.preventDefault();
    }
  });
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

initialize();
