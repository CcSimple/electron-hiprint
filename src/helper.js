"use strict";
const { app } = require("electron");

/**
 * 退出应用
 *
 * @return {undefined}
 */
exports.appQuit = function() {
  MAIN_WINDOW && MAIN_WINDOW.destroy();
  app.quit();
};
