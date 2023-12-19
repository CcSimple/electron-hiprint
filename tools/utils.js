const address = require("address");
const ipp = require("ipp");
const { machineIdSync } = require("node-machine-id");
const Store = require('electron-store');

Store.initRenderer();

const schema = {
  mainTitle: {
    type: "string",
    default: "Electron-hiprint"
  },
  openAtLogin: {
    type: "boolean",
    default: true
  },
  openAsHidden: {
    type: "boolean",
    default: true
  },
  connectTransit: {
    type: "boolean",
    default: false
  },
  transitUrl: {
    type: "string",
    default: ""
  },
  transitToken: {
    type: "string",
    default: ""
  },
  closeType: {
    type: "string",
    enum: ["tray", "quit"],
    default: "tray"
  },
  port: {
    type: "number",
    minimum: 10000,
    default: 17521
  },
  token: {
    type: "string",
    default: ""
  }
}

const store = new Store({ schema });

const { app, Notification } = require("electron");

/**
 * @description: 获取当前系统 IP 地址
 * @return {String}
 */
function addressIp() {
  return address.ip();
}

/**
 * @description: 获取当前系统 IPV6 地址
 * @return {String}
 */
function addressIpv6() {
  return address.ipv6();
}

/**
 * @description: 获取当前系统 MAC 地址
 * @return {String}
 */
function addressMac() {
  return new Promise((resolve) => {
    address.mac(function(err, addr) {
      if (err) {
        resolve(err);
      } else {
        resolve(addr);
      }
    });
  });
}

/**
 * @description: 获取当前系统 IP、IPV6、MAC 地址
 * @return {Object}
 */
function addressAll() {
  return new Promise((resolve) => {
    address.mac(function(err, mac) {
      if (err) {
        resolve({ ip: address.ip(), ipv6: address.ipv6(), mac: err });
      } else {
        resolve({ ip: address.ip(), ipv6: address.ipv6(), mac });
      }
    });
  });
}

/**
 * @description: address 方法重写
 * @return {Object}
 */
const _address = {
  ip: addressIp,
  ipv6: addressIpv6,
  mac: addressMac,
  all: addressAll,
};

/**
 * @description: 抛出当前客户端信息，提供更多有价值的信息，逐步替换原有 address
 * @param {io.Socket} socket
 * @return {Void}
 */
function emitClientInfo(socket) {
  _address.mac().then((mac) => {
    socket.emit("clientInfo", {
      version: app.getVersion(), // 版本号
      platform: process.platform, // 平台
      arch: process.arch, // 系统架构
      mac: mac, // mac 地址
      ip: _address.ip(), // ip 地址
      ipv6: _address.ipv6(), // ipv6 地址
      clientUrl: `http://${_address.ip()}:${store.get("port") || 17521}`, // 客户端地址
      machineId: machineIdSync({ original: true }), // 客户端唯一id
    });
  });
}

/**
 * @description: 作为本地服务端时绑定的 socket 事件
 * @param {*} server
 * @return {Void}
 */
function initServeEvent(server) {
  // 必须传入实体
  if (!server) return false;

  /**
   * @description: 新的 web client 连入，绑定 socket 事件
   */
  server.on("connect", (socket) => {
    // 通知渲染进程已连接
    MAIN_WINDOW.webContents.send(
      "serverConnection",
      server.engine.clientsCount
    );

    // 弹出连接成功通知
    const notification = new Notification({
      title: "新的连接",
      body: `已建立新的连接，当前连接数：${server.engine.clientsCount}`,
    });
    // 显示通知
    notification.show();

    // 向 client 发送打印机列表
    socket.emit("printerList", MAIN_WINDOW.webContents.getPrinters());

    // 向 client 发送客户端信息
    emitClientInfo(socket);

    /**
     * @description: client 请求客户端信息
     */
    socket.on("getClientInfo", () => {
      emitClientInfo(socket);
    });

    /**
     * @description: client请求 address ，获取本机 IP、IPV6、MAC 地址
     * @description: addressType 为 null 时，返回所有地址
     * @description: 逐步废弃该 api
     * @param {String} addressType ip、ipv6、mac、all === null
     */
    socket.on("address", (addressType) => {
      switch (addressType) {
        case "ip":
        case "ipv6":
          socket.emit("address", addressType, _address[addressType]());
          break;
        case "dns":
        case "interface":
        case "vboxnet":
          // 用处不大的几个信息，直接废弃
          socket.emit("address", addressType, null, "This type is removed.");
          break;
        default:
          addressType = addressType === "mac" ? "mac" : "all";
          _address[addressType]().then((res) => {
            socket.emit("address", addressType, res);
          });
          break;
      }
    });

    /**
     * @description: client 请求刷新打印机列表
     */
    socket.on("refreshPrinterList", () => {
      socket.emit("printerList", MAIN_WINDOW.webContents.getPrinters());
    });

    /**
     * @description: client 调用 ipp 打印 详见：https://www.npmjs.com/package/ipp
     */
    socket.on("ippPrint", (options) => {
      try {
        const { url, opt, action, message } = options;
        let printer = ipp.Printer(url, opt);
        socket.emit("ippPrinterConnected", printer);
        let msg = Object.assign(
          {
            "operation-attributes-tag": {
              "requesting-user-name": "hiPrint",
            },
          },
          message
        );
        // data 必须是 Buffer 类型
        if (msg.data && !Buffer.isBuffer(msg.data)) {
          if ("string" === typeof msg.data) {
            msg.data = Buffer.from(msg.data, msg.encoding || "utf8");
          } else {
            msg.data = Buffer.from(msg.data);
          }
        }
        /**
         * action: Get-Printer-Attributes 获取打印机支持参数
         * action: Print-Job 新建打印任务
         * action: Cancel-Job 取消打印任务
         */
        printer.execute(action, msg, (err, res) => {
          socket.emit(
            "ippPrinterCallback",
            err ? { type: err.name, msg: err.message } : null,
            res
          );
        });
      } catch (error) {
        socket.emit("ippPrinterCallback", {
          type: error.name,
          msg: error.message,
        });
      }
    });

    /**
     * @description: client ipp request 详见：https://www.npmjs.com/package/ipp
     */
    socket.on("ippRequest", (options) => {
      try {
        const { url, data } = options;
        let _data = ipp.serialize(data);
        ipp.request(url, _data, (err, res) => {
          socket.emit(
            "ippRequestCallback",
            err ? { type: err.name, msg: err.message } : null,
            res
          );
        });
      } catch (error) {
        socket.emit("ippRequestCallback", {
          type: error.name,
          msg: error.message,
        });
      }
    });

    /**
     * @description: client 常规打印任务
     */
    socket.on("news", (data) => {
      if (data) {
        PRINT_RUNNER.add((done) => {
          data.socketId = socket.id;
          data.taskId = new Date().getTime();
          data.clientType = "local";
          PRINT_WINDOW.webContents.send("print-new", data);
          MAIN_WINDOW.webContents.send("printTask", true);
          PRINT_RUNNER_DONE[data.taskId] = done;
        });
      }
    });

    /**
     * @description: client 断开连接
     */
    socket.on("disconnect", () => {
      MAIN_WINDOW.webContents.send(
        "serverConnection",
        server.engine.clientsCount
      );
    });
  });
}

/**
 * @description: 作为客户端连接中转服务时绑定的 socket 事件
 * @return {Void}
 */
function initClientEvent() {
  // 作为客户端连接中转服务时只有一个全局 client
  var client = global.SOCKET_CLIENT;

  /**
   * @description: 连接中转服务成功，绑定 socket 事件
   */
  client.on("connect", () => {
    // 通知渲染进程已连接
    MAIN_WINDOW.webContents.send("clientConnection", true);

    // 弹出连接成功通知
    const notification = new Notification({
      title: "已连接中转服务器",
      body: `已连接至中转服务器【${store.get("transitUrl")}】，即刻开印！`,
    });
    // 显示通知
    notification.show();

    // 向 中转服务 发送打印机列表
    client.emit("printerList", MAIN_WINDOW.webContents.getPrinters());

    // 向 中转服务 发送客户端信息
    emitClientInfo(client);
  });

  /**
   * @description: 中转服务 请求客户端信息
   */
  client.on("getClientInfo", () => {
    emitClientInfo(client);
  });

  /**
   * @description: 中转服务 请求刷新打印机列表
   */
  client.on("refreshPrinterList", () => {
    client.emit("printerList", MAIN_WINDOW.webContents.getPrinters());
  });

  /**
   * @description: 中转服务 调用 ipp 打印 详见：https://www.npmjs.com/package/ipp
   */
  client.on("ippPrint", (options) => {
    try {
      const { url, opt, action, message, replyId } = options;
      let printer = ipp.Printer(url, opt);
      client.emit("ippPrinterConnected", { printer, replyId });
      let msg = Object.assign(
        {
          "operation-attributes-tag": {
            "requesting-user-name": "hiPrint",
          },
        },
        message
      );
      // data 必须是 Buffer 类型
      if (msg.data && !Buffer.isBuffer(msg.data)) {
        if ("string" === typeof msg.data) {
          msg.data = Buffer.from(msg.data, msg.encoding || "utf8");
        } else {
          msg.data = Buffer.from(msg.data);
        }
      }
      /**
       * action: Get-Printer-Attributes 获取打印机支持参数
       * action: Print-Job 新建打印任务
       * action: Cancel-Job 取消打印任务
       */
      printer.execute(action, msg, (err, res) => {
        client.emit(
          "ippPrinterCallback",
          err ? { type: err.name, msg: err.message, replyId } : { replyId },
          res
        );
      });
    } catch (error) {
      client.emit("ippPrinterCallback", {
        type: error.name,
        msg: error.message,
        replyId,
      });
    }
  });

  /**
   * @description: 中转服务 ipp request 详见：https://www.npmjs.com/package/ipp
   */
  client.on("ippRequest", (options) => {
    try {
      const { url, data, replyId } = options;
      let _data = ipp.serialize(data);
      ipp.request(url, _data, (err, res) => {
        client.emit(
          "ippRequestCallback",
          err ? { type: err.name, msg: err.message, replyId } : { replyId },
          res
        );
      });
    } catch (error) {
      client.emit("ippRequestCallback", {
        type: error.name,
        msg: error.message,
        replyId,
      });
    }
  });

  /**
   * @description: 中转服务 常规打印任务
   */
  client.on("news", (data) => {
    if (data) {
      PRINT_RUNNER.add((done) => {
        data.socketId = client.id;
        data.taskId = new Date().getTime();
        data.clientType = "transit";
        PRINT_WINDOW.webContents.send("print-new", data);
        MAIN_WINDOW.webContents.send("printTask", true);
        PRINT_RUNNER_DONE[data.taskId] = done;
      });
    }
  });

  /**
   * @description: 中转服务 断开连接
   */
  client.on("disconnect", () => {
    MAIN_WINDOW.webContents.send("clientConnection", false);
  });
}

module.exports = {
  store,
  address: _address,
  initServeEvent,
  initClientEvent,
};
