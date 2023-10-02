"use strict";
const { app } = require("electron");

/**
 * 退出应用
 *
 * @return {undefined}
 */
exports.appQuit = function() {
  SET_WINDOW && SET_WINDOW.destroy();
  PRINT_WINDOW && PRINT_WINDOW.destroy();
  MAIN_WINDOW && MAIN_WINDOW.destroy();
  APP_TRAY && APP_TRAY.destroy();
  app.quit();
};
