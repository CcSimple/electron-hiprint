/*
 * @Date: 2024-12-14 23:59:49
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-12-15 02:55:48
 * @FilePath: /electron-hiprint/src/printlog.js
 */
"use strict";
const { app, BrowserWindow, BrowserView, ipcMain } = require("electron");
const path = require("path");
const db = require("../tools/database");

function createPrintLogWindow() {
  const windowOptions = {
    width: 1080,
    height: 600,
    minWidth: 1040,
    minHeight: 550,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  };

  // 创建打印日志窗口
  PRINT_LOG_WINDOW = new BrowserWindow(windowOptions);

  // 添加加载页面 解决白屏的问题
  loadingView(windowOptions);

  // 加载打印日志页面
  const printLogHtml = path.join(
    "file://",
    app.getAppPath(),
    "/assets/printLog.html",
  );
  PRINT_LOG_WINDOW.loadURL(printLogHtml);

  // 未打包时打开开发者工具
  if (!app.isPackaged) {
    PRINT_LOG_WINDOW.webContents.openDevTools();
  }

  // 绑定窗口事件
  initPrintLogEvent();

  // 监听退出，移除所有事件
  PRINT_LOG_WINDOW.on("closed", removePrintLogEvent);

  return PRINT_LOG_WINDOW;
}

/**
 * @description: 加载等待页面，解决主窗口白屏问题
 * @param {Object} windowOptions 主窗口配置
 * @return {void}
 */
function loadingView(windowOptions) {
  const loadingBrowserView = new BrowserView();
  PRINT_LOG_WINDOW.setBrowserView(loadingBrowserView);
  loadingBrowserView.setBounds({
    x: 0,
    y: 0,
    width: windowOptions.width,
    height: windowOptions.height,
  });

  const loadingHtml = path.join(
    "file://",
    app.getAppPath(),
    "assets/loading.html",
  );
  loadingBrowserView.webContents.loadURL(loadingHtml);

  // 打印日志窗口 dom 加载完毕，移除 loadingBrowserView
  PRINT_LOG_WINDOW.webContents.on("dom-ready", async (event) => {
    PRINT_LOG_WINDOW.removeBrowserView(loadingBrowserView);
  });
}

/**
 * @description: 获取打印日志
 * @param {Array} condition 搜索条件
 * @param {Array} params 搜索参数
 * @param {Object} page 分页
 * @param {Object} sort 排序
 * @param {Function} callback 回调函数
 * @return {void}
 */
function fetchPrintLogs({ condition, params, page, sort }, callback) {
  const baseQuery = `SELECT id, timestamp, socketId, clientType, printer, templateId, pageNum, status, errorMessage FROM print_logs`;
  const totalQuery = `SELECT COUNT(*) AS total FROM print_logs`;
  let query = baseQuery;
  let total = totalQuery;

  if (condition.length > 0) {
    query += " WHERE " + condition.join(" AND ");
    total += " WHERE " + condition.join(" AND ");
  }

  console.log(sort);
  if (sort.prop && sort.order) {
    query += ` ORDER BY ${sort.prop} ${sort.order
      .replace("ending", "")
      .toUpperCase()}`;
  }

  query += ` LIMIT ${page.pageSize} OFFSET ${(page.currentPage - 1) *
    page.pageSize}`;

  function allAsync(query, params) {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  Promise.all([allAsync(query, params), allAsync(total, params)])
    .then(([rows, total]) => {
      callback(null, { rows, total: total[0].total });
    })
    .catch((err) => {
      callback(err, null);
    });
}

/**
 * @description: 清空打印日志
 * @return {void}
 */
function clearPrintLogs() {
  db.run("DELETE FROM print_logs");
}

/**
 * @description: 重打打印
 * @param {Object} row 打印日志
 * @return {void}
 */
function rePrint(row) {
  db.get("SELECT * FROM print_logs WHERE id = ?", [row.id], (err, row) => {
    if (err) return;
    PRINT_WINDOW.webContents.send("reprint", {
      ...JSON.parse(row.data),
      taskId: undefined,
      replyId: undefined,
      clientType: "local",
      socketId: undefined,
    });
  });
}

/**
 * @description: 绑定打印日志窗口事件
 * @return {void}
 */
function initPrintLogEvent() {
  ipcMain.on("request-logs", (event, { condition, params, page, sort }) => {
    fetchPrintLogs({ condition, params, page, sort }, (err, logs) => {
      if (err) return;
      event.sender.send("print-logs", logs);
    });
  });

  ipcMain.on("reprint", (event, row) => {
    rePrint(row);
  });

  ipcMain.on("clear-logs", (event) => {
    clearPrintLogs();
  });
}

/**
 * @description: 移除所有事件
 * @return {void}
 */
function removePrintLogEvent() {
  ipcMain.removeListener("request-logs", fetchPrintLogs);
  ipcMain.removeListener("reprint", rePrint);
  ipcMain.removeListener("clear-logs", clearPrintLogs);
  PRINT_LOG_WINDOW = null;
}

module.exports = async () => {
  // 创建设置窗口
  await createPrintLogWindow();
};
