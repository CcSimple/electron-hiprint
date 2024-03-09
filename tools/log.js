/*
 * @Date: 2024-03-08 13:05:10
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-03-09 12:53:03
 * @FilePath: \electron-hiprint\tools\log.js
 */
const { app } = require("electron");
const { access, appendFile, constants, writeFile } = require("node:fs");
const dayjs = require("dayjs");

const logs = app.getPath('logs')

/**
 * This function checks if a log file exists. If it does not exist, a new log file will be created.
 * @returns {Promise} A Promise object that resolves if the file exists, or rejects if creating the file fails.
 */
function checkLogFile() {
  const filePath = `${logs}/${dayjs().format("YYYY-MM-DD")}.log`;
  return new Promise((resolve, reject) => {
    access(filePath, constants.F_OK, (err) => {
      if (err) {
        writeFile(filePath, "", (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Writes log message to log file.
 * @param {string} message - The log message to be written.
 * @returns {Promise} - A Promise object that resolves when writing is successful, or rejects when writing fails.
 */
function log(message) {
  const filePath = `${logs}/${dayjs().format("YYYY-MM-DD")}.log`;
  return new Promise((resolve, reject) => {
    checkLogFile()
      .then(() => {
        const logMessage = `${dayjs().format(
          "YYYY/MM/DD HH:mm:ss"
        )}: ${message}\n`;
        appendFile(filePath, logMessage, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
      .catch((err) => {
        reject(err);
      });
  });
}

module.exports = log;
