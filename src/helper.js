"use strict";
const { app } = require("electron");
const log = require("../tools/log");

/**
 * 退出应用
 *
 * @return {undefined}
 */
exports.appQuit = function() {
  log("==> Electron-hiprint 关闭 <==");
  SET_WINDOW && SET_WINDOW.destroy();
  PRINT_WINDOW && PRINT_WINDOW.destroy();
  MAIN_WINDOW && MAIN_WINDOW.destroy();
  APP_TRAY && APP_TRAY.destroy();
  app.quit();
};
