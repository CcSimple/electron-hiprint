/*
 * @Date: 2024-01-25 15:52:14
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-04-05 09:41:20
 * @FilePath: \electron-hiprint\main.js
 */
const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  Notification,
  Tray,
  Menu,
  shell
} = require("electron");
const path = require("path");
const server = require("http").createServer();
const helper = require("./src/helper");
const printSetup = require("./src/print");
const setSetup = require("./src/set");
const log = require("./tools/log");
const {
  store,
  address,
  initServeEvent,
  initClientEvent,
} = require("./tools/utils");
const { machineIdSync } = require("node-machine-id");
const TaskRunner = require("concurrent-tasks");

// 主进程
global.MAIN_WINDOW = null;
// 托盘
global.APP_TRAY = null;
// 打印窗口
global.PRINT_WINDOW = null;
// 设置窗口
global.SET_WINDOW = null;
// socket.io 服务端
global.SOCKET_SERVER = null;
// socket.io-client 客户端
global.SOCKET_CLIENT = null;
// 打印队列，解决打印并发崩溃问题
global.PRINT_RUNNER = new TaskRunner({ concurrency: 1 });
// 打印队列 done 集合
global.PRINT_RUNNER_DONE = {};
// 分批打印任务的打印任务信息
global.PRINT_FRAGMENTS_MAPPING = {
  // [id: string]: { // 当前打印任务id，当此任务完成或超过指定时间会删除该对象
  //   {
  //      total: number, // html片段总数
  //      count: number, // 已经保存完成的片段数量，当count与total相同时，所有片段传输完成
  //      fragments: Array<string | undefined>, // 按照顺序摆放的html文本片段
  //      updateTime: number, // 最后更新此任务信息的时间戳，用于超时时移除此对象
  //   }
  // }
};

// socket.io 服务端，用于创建本地服务
const ioServer = (global.SOCKET_SERVER = new require("socket.io")(server, {
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
}));

// socket.io 客户端，用于连接中转服务
const ioClient = require("socket.io-client").io;

/**
 * @description: 初始化
 */
async function initialize() {
  // 限制一个窗口
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    // 销毁所有窗口、托盘、退出应用
    helper.appQuit();
  }

  // 当运行第二个实例时,聚焦到 MAIN_WINDOW 这个窗口
  app.on("second-instance", () => {
    if (MAIN_WINDOW) {
      if (MAIN_WINDOW.isMinimized()) {
        // 将窗口从最小化状态恢复到以前的状态
        MAIN_WINDOW.restore();
      }
      MAIN_WINDOW.focus();
    }
  });

  // 允许渲染进程创建通知
  ipcMain.on("notification", (event, data) => {
    const notification = new Notification(data);
    // 显示通知
    notification.show();
  });

  // 打开设置窗口
  ipcMain.on("openSetting", openSetWindow);

  // 获取设备唯一id
  ipcMain.on("getMachineId", (event) => {
    event.sender.send("machineId", machineIdSync({ original: true }));
  });

  // 获取设备ip、mac等信息
  ipcMain.on("getAddress", (event) => {
    address.all().then((obj) => {
      event.sender.send("address", {
        ...obj,
        port: store.get("port"),
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
    log("==> Electron-hiprint 启动 <==")
  });
}

/**
 * @description: 创建渲染进程 主窗口
 * @return {BrowserWindow} MAIN_WINDOW 主窗口
 */
async function createWindow() {
  const windowOptions = {
    width: 500, // 窗口宽度
    height: 300, // 窗口高度
    title: store.get("mainTitle") || "Electron-hiprint",
    useContentSize: true, // 窗口大小不包含边框
    center: true, // 居中
    resizable: false, // 不可缩放
    show: store.get("openAsHidden") ? false : true, // 显示
    webPreferences: {
      // 设置此项为false后，才可在渲染进程中使用 electron api
      contextIsolation: false,
      nodeIntegration: true,
    },
  };

  // 窗口左上角图标
  if (!app.isPackaged) {
    windowOptions.icon = path.join(__dirname, "build/icons/256x256.png");
  } else {
    app.setLoginItemSettings({
      openAtLogin: store.get("openAtLogin"),
      openAsHidden: store.get("openAsHidden"),
    });
  }

  // 创建主窗口
  MAIN_WINDOW = new BrowserWindow(windowOptions);

  // 添加加载页面 解决白屏的问题
  loadingView(windowOptions);

  // 初始化系统设置
  systemSetup();

  // 加载主页面
  const indexHtml = path.join("file://", app.getAppPath(), "assets/index.html");
  MAIN_WINDOW.webContents.loadURL(indexHtml);

  // 未打包时打开开发者工具
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
    if (store.get("closeType") === "tray") {
      // 最小化到托盘
      MAIN_WINDOW.hide();

      // 隐藏任务栏
      MAIN_WINDOW.setSkipTaskbar(true);

      // 阻止窗口关闭
      event.preventDefault();
    } else {
      // 销毁所有窗口、托盘、退出应用
      helper.appQuit();
    }
  });

  // 主窗口 Dom 加载完毕
  MAIN_WINDOW.webContents.on("dom-ready", async () => {
    try {
      // 本地服务开启端口监听
      server.listen(store.get("port") || 17521);
      // 初始化本地 服务端事件
      initServeEvent(ioServer);
      // 有配置中转服务时连接中转服务
      if (
        store.get("connectTransit") &&
        store.get("transitUrl") &&
        store.get("transitToken")
      ) {
        global.SOCKET_CLIENT = ioClient(store.get("transitUrl"), {
          transports: ["websocket"],
          query: {
            client: "electron-hiprint",
          },
          auth: {
            token: store.get("transitToken"),
          },
        });

        // 初始化中转 客户端事件
        initClientEvent();
      }
    } catch (error) {
      console.error(error);
    }
  });

  // 初始化托盘
  initTray();
  // 打印窗口初始化
  await printSetup();

  return MAIN_WINDOW;
}

/**
 * @description: 加载等待页面，解决主窗口白屏问题
 * @param {Object} windowOptions 主窗口配置
 * @return {Void}
 */
function loadingView(windowOptions) {
  const loadingBrowserView = new BrowserView();
  MAIN_WINDOW.setBrowserView(loadingBrowserView);
  loadingBrowserView.setBounds({
    x: 0,
    y: 0,
    width: windowOptions.width,
    height: windowOptions.height,
  });

  const loadingHtml = path.join("file://", app.getAppPath(), "assets/loading.html");
  loadingBrowserView.webContents.loadURL(loadingHtml);

  // 主窗口 dom 加载完毕，移除 loadingBrowserView
  MAIN_WINDOW.webContents.on("dom-ready", async (event) => {
    MAIN_WINDOW.removeBrowserView(loadingBrowserView);
  });
}

/**
 * @description: 初始化系统设置
 * @return {Void}
 */
function systemSetup() {
  // 隐藏菜单栏
  Menu.setApplicationMenu(null);
}

/**
 * @description: 初始化托盘
 * @return {Tray} APP_TRAY 托盘实例
 */
function initTray() {
  let trayPath = path.join(app.getAppPath(), "assets/icons/tray.png");

  APP_TRAY = new Tray(trayPath);

  // 托盘提示标题
  APP_TRAY.setToolTip("hiprint");

  // 托盘菜单
  const trayMenuTemplate = [
    {
      label: "设置",
      click: () => {
        if (!SET_WINDOW) {
          setSetup();
        } else {
          SET_WINDOW.show();
        }
      },
    },
    {
      label: "查看日志",
      click: () => {
        shell.openPath(app.getPath("logs"));
      }
    },
    {
      label: "退出",
      click: () => {
        helper.appQuit();
      },
    },
  ];

  APP_TRAY.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate));

  // 监听点击事件
  APP_TRAY.on("click", function() {
    if (MAIN_WINDOW.isMinimized()) {
      // 将窗口从最小化状态恢复到以前的状态
      MAIN_WINDOW.restore();
      MAIN_WINDOW.setSkipTaskbar(false);
    }
    if (!MAIN_WINDOW.isVisible()) {
      // 主窗口关闭不会被销毁，只是隐藏，重新显示即可
      MAIN_WINDOW.show();
      MAIN_WINDOW.setSkipTaskbar(false);
    }
    if (!MAIN_WINDOW.isFocused()) {
      // 主窗口未聚焦，使其聚焦
      MAIN_WINDOW.focus();
    }
  });
  return APP_TRAY;
}

/**
 * @description: 打开设置窗口
 * @return {BrowserWindow} SET_WINDOW 设置窗口
 */
async function openSetWindow() {
  if (!SET_WINDOW) {
    await setSetup();
  } else {
    SET_WINDOW.show();
  }
  return SET_WINDOW;
}

// 初始化主窗口
initialize();
