/*
 * @Date: 2023-09-06 00:23:16
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2023-09-06 13:21:35
 * @FilePath: \electron-hiprint\tools\file.js
 */
const path = require("path");
const fs = require("fs");

const { app, dialog } = require("electron");

/**
 * @description: 获取系统类型
 * @return {Number} 1: macos, 2: windows, 3: linux
 */
function getSystem() {
  if (process.platform == "darwin") {
    return 1;
  }
  if (process.platform == "win32") {
    return 2;
  }
  if (process.platform == "linux") {
    return 3;
  }
}

/**
 * @description: 获取exe路径
 * @return {String} win 为 exe路径，macos 为 hiprint.app/Contents/MacOS
 */
function getExePath() {
  if (app.isPackaged) {
    if (getSystem() === 1) {
      return path.resolve(app.getPath("exe"), "../../");
    } else {
      return path.dirname(app.getPath("exe"));
    }
  } else {
    return path.resolve(__dirname, "..");
  }
}

/**
 * @description: 获取配置文件路径
 * @return {String} 根据系统不同，返回不同的路径
 */
function getConfigPath() {
  if (getSystem() === 1) {
    return getExePath() + "/config.json";
  } else {
    return getExePath() + "\\config.json";
  }
}

/**
 * @description: 读取配置文件
 * @return {Promise<Object>} 配置
 */
function readConfig() {
  return new Promise((resolve, reject) => {
    fs.readFile(getConfigPath(), "utf-8", (err, data) => {
      const PLUGIN_CONFIG = { port: 17521, token: null };
      if (data) {
        var { port, token, openAtLogin, openAsHidden, closeType } = JSON.parse(
          data
        );
        // 端口号限制为 10000 - 65535 防止常用端口冲突
        if (port && port >= 10000 && port <= 65535) {
          PLUGIN_CONFIG.port = port;
        }
        PLUGIN_CONFIG.token = token;
        PLUGIN_CONFIG.openAtLogin = Boolean(openAtLogin);
        PLUGIN_CONFIG.openAsHidden = Boolean(openAsHidden);
        PLUGIN_CONFIG.closeType = ["tray", "quit"].includes(closeType)
          ? closeType
          : "tray";
      }
      if (app.isPackaged) {
        app.setLoginItemSettings({
          openAtLogin: Boolean(PLUGIN_CONFIG.openAtLogin),
          openAsHidden: Boolean(PLUGIN_CONFIG.openAsHidden),
        });
      }
      resolve(PLUGIN_CONFIG);
    });
  });
}

/**
 * @description: 写入配置文件
 * @param {Object} data 配置
 * @return {*}
 */
function writeConfig(data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(getConfigPath(), JSON.stringify(data, null, 2), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  readConfig,
  writeConfig,
};
