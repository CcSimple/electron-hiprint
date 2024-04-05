/*
 * @Author: 刘鑫 admin@54xavier.cn
 * @Date: 2024-04-03 14:15:19
 * @LastEditors: admin@54xavier.cn
 * @LastEditTime: 2024-04-05 09:49:03
 * @FilePath: \electron-hiprint\tools\start.js
 * @Description: 添加脚本判断系统平台，解决因升级 electron 导致的 中文字符输出乱码，解决 chcp 指令在 linux 和 mac 系统下报错问题
 */
const exec = require('node:child_process').exec;

let command;

switch (process.platform) {
    case 'linux':
    case 'darwin':
        command = 'electron .';
        break;
    case 'win32':
        command = 'chcp 65001 & electron .';
        break;
}

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error}`);
        return;
    }
    if (stderr) {
        console.error(`Error: ${stderr}`);
    }
});
