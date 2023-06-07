# electron-hiprint

> vue-plugin-hiprint 直接打印控件，绕过浏览器的打印窗口

## 预览 <a href="https://ccsimple.gitee.io/vue-plugin-hiprint/">vue-plugin-hiprint demo</a>

<div align="center">

![image](./res/tool.jpeg)

</div>

## 调试/打包

```console
git clone https://github.com/CcSimple/electron-hiprint.git
// or
git clone https://gitee.com/CcSimple/electron-hiprint.git
// init
cd electron-hiprint
npm i
// 调试预览
npm run start
// 打包 win x64  // 详情见package.json
npm run build-w-64
```

## web 打印插件

[vue-plugin-hiprint](https://github.com/CcSimple/vue-plugin-hiprint.git)

## 打印原理说明

1. 连接次客户端开启的 socket.io 服务 (默认端口 17521)

   - socket.io-client^4.x 连接 ("http://localhost:17521")

2. 通过 socket.io-client^4.x 服务发送打印数据 (news)

   - socket.emit("news", {html,templateId,printer,pageSize});
   - 主要参数 html: 及 html 字符串，templateId: 用于回调 successs/error 时的标识
   - printer: 打印机名称，pageSize: 打印纸张大小 (其他参数,见下面的示例)

## 默认打印参数说明

```js
// 详见electron文档: https://www.electronjs.org/zh/docs/latest/api/web-contents
{
    silent: data.silent ?? true, // 静默打印
    printBackground: data.printBackground ?? true, // 是否打印背景
    deviceName: deviceName, // 打印机名称
    color: data.color ?? true, // 是否打印颜色
    margins: data.margins ?? {
    marginType: "none",
    }, // 边距
    landscape: data.landscape ?? false, // 是否横向打印
    scaleFactor: data.scaleFactor ?? 100, // 打印缩放比例
    pagesPerSheet: data.pagesPerSheet ?? 1, // 每张纸的页数
    collate: data.collate ?? true, // 是否排序
    copies: data.copies ?? 1, // 打印份数
    pageRanges: data.pageRanges ?? {}, // 打印页数
    duplexMode: data.duplexMode, // 打印模式 simplex,shortEdge,longEdge
    dpi: data.dpi, // 打印机DPI
    header: data.header, // 打印头
    footer: data.footer, // 打印尾
    pageSize: data.pageSize, // 打印纸张 // A0, A1, A2, A3, A4, A5, A6, Legal, Letter, Tabloid
}
// 其中纸张大小参数 pageSize 如果传自定义大小, 需要乘以 1000
{height: 80 * 1000, width: 60 * 1000}
```

## 使用 pdf 打印功能

原理:

1. 通过 electron 的 printToPDF 先导出 pdf 文件
2. 再通过 pdf-to-printer 或 unix-print 打印 pdf 文件

> 传数据时需要传入: {type:'pdf'}

> 如果是自定义的纸张大小, 别忘了 传 自定义的 pageSize

eg: {height: 80 * 1000, width: 60 * 1000}

```js
{
    printer?: string; // 打印机名称
    pages?: string; // 打印页数
    subset?: string; // 奇偶页 even、odd
    orientation?: string; // 纸张方向 portrait、landscape
    scale?: string; // 缩放 noscale、shrink、fit
    monochrome?: boolean; // 黑白打印 true、false
    side?: string; // 单双面 duplex, duplexshort, duplexlong, and simplex
    bin?: string; // select tray to print to
    paperName?: string; // 纸张大小 A2, A3, A4, A5, A6, letter, legal, tabloid, statement
    silent?: boolean; // Silences error messages.
    printDialog?: boolean; // 显示打印对话框 true、false
    copies?: number; // 打印份数
}
```

## 学习借鉴

- electron <a href="https://www.electronjs.org/zh/docs/latest/">https://www.electronjs.org/zh/docs/latest/</a>
- electron-egg <a href="https://gitee.com/wallace5303/electron-egg/">https://gitee.com/wallace5303/electron-egg/</a>
- pdf-to-printer <a href="https://github.com/artiebits/pdf-to-printer">https://github.com/artiebits/pdf-to-printer</a>
- unix-printer <a href="https://github.com/artiebits/unix-print">https://github.com/artiebits/unix-print</a>
