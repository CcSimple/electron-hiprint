/*
 * @Date: 2023-09-05 17:34:28
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2023-09-06 13:21:23
 * @FilePath: \electron-hiprint\src\set.js
 */
"use strict";

const path = require("path");
const { writeConfig } = require("../tools/file");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

async function createSetWindow() {
    const windowOptions = {
        width: 400,
        height: 460,
        show: true, // 显示
        center: true, // 居中
        resizable: false, // 不可缩放
        alwaysOnTop: true, // 永远置顶
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true
        },
        // frame: false, // 不显示边框
        // icon: ""
    }
    SET_WINDOW = new BrowserWindow(windowOptions);
    let setHtml = path.join("file://", app.getAppPath(), "assets/set.html");
    SET_WINDOW.webContents.loadURL(setHtml);
    if (!app.isPackaged) {
        SET_WINDOW.webContents.openDevTools();
    }
    initSetEvent();
}

function initSetEvent() {
    ipcMain.on("getConfig", (event) => {
        event.sender.send("onConfig", PLUGIN_CONFIG)
    })
    ipcMain.on("setConfig", (event, data) => {
        dialog.showMessageBox(SET_WINDOW, {
            type: "question",
            title: "提示",
            message: "修改设置后需要立即重启，继续操作？",
            buttons: ["确定", "取消"],
        }).then(res => {
            if (res.response === 0) {
                writeConfig(data).then(() => {
                    app.relaunch();
                    app.exit();
                }).catch(() => {
                    dialog.showErrorBox("提示", "保存失败！");
                });
            }
        })
    })
    ipcMain.on("closeSetWindow", () => {
        SET_WINDOW && SET_WINDOW.close();
    })
}

module.exports = async() => {
    // 创建设置窗口
    await createSetWindow();
}