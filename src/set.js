/*
 * @Date: 2023-09-05 17:34:28
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-04-05 10:06:51
 * @FilePath: \electron-hiprint\src\set.js
 */
"use strict";

const {
  app,
  BrowserWindow,
  BrowserView,
  ipcMain,
  dialog,
} = require("electron");
const path = require("path");
const { store } = require("../tools/utils");
const log = require("../tools/log");

/**
 * @description: 创建设置窗口
 * @return {BrowserWindow} SET_WINDOW 设置窗口
 */
async function createSetWindow() {
  const windowOptions = {
    width: 400, // 窗口宽度
    height: 600, // 窗口高度
    title: "设置",
    useContentSize: true, // 窗口大小不包含边框
    center: true, // 居中
    alwaysOnTop: true, // 永远置顶
    resizable: false, // 不可缩放
    webPreferences: {
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用 electron api
      nodeIntegration: true,
    },
  };

  // 创建设置窗口
  SET_WINDOW = new BrowserWindow(windowOptions);

  // 添加加载页面 解决白屏的问题
  loadingView(windowOptions);

  // 加载设置渲染进程页面
  const setHtmlUrl = path.join("file://", app.getAppPath(), "assets/set.html");
  SET_WINDOW.webContents.loadURL(setHtmlUrl);

  // 未打包时打开开发者工具
  if (!app.isPackaged) {
    SET_WINDOW.webContents.openDevTools();
  }

  // 绑定窗口事件
  initSetEvent();

  // 监听退出，移除所有事件
  SET_WINDOW.on("closed", removeEvent);

  return SET_WINDOW;
}

/**
 * @description: 加载等待页面，解决主窗口白屏问题
 * @param {Object} windowOptions 主窗口配置
 * @return {Void}
 */
function loadingView(windowOptions) {
  const loadingBrowserView = new BrowserView();
  SET_WINDOW.setBrowserView(loadingBrowserView);
  loadingBrowserView.setBounds({
    x: 0,
    y: 0,
    width: windowOptions.width,
    height: windowOptions.height,
  });

  const loadingHtml = path.join(
    "file://",
    app.getAppPath(),
    "assets/loading.html"
  );
  loadingBrowserView.webContents.loadURL(loadingHtml);

  // 主窗口 dom 加载完毕，移除 loadingBrowserView
  SET_WINDOW.webContents.on("dom-ready", async (event) => {
    SET_WINDOW.removeBrowserView(loadingBrowserView);
  });
}

/**
 * @description: 渲染进程触发获取配置
 * @param {IpcMainEvent} event
 * @return {Void}
 */
function getConfig(event) {
  event.sender.send("onConfig", store.store);
}

/**
 * @description: 渲染进程触发写入配置
 * @param {IpcMainEvent} event
 * @param {Object} data 配置数据
 * @return {Void}
 */
function setConfig(event, data) {
  log("==> 设置窗口：保存配置 <==");
  // 保存配置前，弹出 dialog 确认
  dialog
    .showMessageBox(SET_WINDOW, {
      type: "question",
      title: "提示",
      message: "修改设置后需要立即重启，继续操作？",
      buttons: ["确定", "取消"],
    })
    .then((res) => {
      if (res.response === 0) {
        store.set(data);
        setTimeout(() => {
          app.relaunch();
          app.exit();
        }, 500);
      }
    });
}

/**
 * @description: 渲染进程触发设置工作区大小
 * @param {IpcMainEvent} event
 * @param {Object} data {width, height[, animate]}
 * @return {Void}
 */
function setContentSize(event, data) {
  SET_WINDOW.setContentSize(data.width, data.height, data.animate ?? true);
}

/**
 * @description: 渲染进程触发弹出消息框
 * @param {IpcMainEvent} event
 * @param {Object} data https://www.electronjs.org/zh/docs/latest/api/dialog#dialogshowmessageboxbrowserwindow-options
 * @return {Void}
 */
function showMessageBox(event, data) {
  dialog.showMessageBox(SET_WINDOW, data);
}

/**
 * @description: 渲染进程触发测试连接中转服务
 * @param {IpcMainEvent} event
 * @param {Object} data {url, token}
 * @return {Void}
 */
function testTransit(event, data) {
  const { io } = require("socket.io-client");
  const socket = io(data.url, {
    transports: ["websocket"],
    reconnection: false, // 关闭自动重连
    query: {
      test: true, // 标识为测试连通性
    },
    auth: {
      token: data.token, // 身份令牌
    },
  });

  // 连接错误
  socket.on("connect_error", (err) => {
    dialog.showMessageBox(SET_WINDOW, {
      type: "error",
      title: "提示",
      message: `${err.message}，请检查设置！`,
      buttons: ["确定"],
    });
    socket.close();
  });

  // 连接成功
  socket.on("connect", () => {
    dialog.showMessageBox(SET_WINDOW, {
      type: "info",
      title: "提示",
      message: "连接成功！",
      buttons: ["确定"],
    });
    socket.close();
  });
}

/**
 * @description: 关闭设置窗口
 * @return {Void}
 */
function closeSetWindow() {
  SET_WINDOW && SET_WINDOW.close();
}

/**
 * @description: 绑定设置窗口事件
 * @return {Void}
 */
function initSetEvent() {
  ipcMain.on("getConfig", getConfig);
  ipcMain.on("setConfig", setConfig);
  ipcMain.on("setContentSize", setContentSize);
  ipcMain.on("showMessageBox", showMessageBox);
  ipcMain.on("testTransit", testTransit);
  ipcMain.on("closeSetWindow", closeSetWindow);
}

/**
 * @description: 移除所有事件
 * @return {Void}
 */
function removeEvent() {
  ipcMain.removeListener("getConfig", getConfig);
  ipcMain.removeListener("setConfig", setConfig);
  ipcMain.removeListener("setContentSize", setContentSize);
  ipcMain.removeListener("showMessageBox", showMessageBox);
  ipcMain.removeListener("testTransit", testTransit);
  ipcMain.removeListener("closeSetWindow", closeSetWindow);
  SET_WINDOW = null;
}

module.exports = async () => {
  // 创建设置窗口
  await createSetWindow();
};
