const { spawn } = require('child_process');
const os = require('os');

const isWindows = os.platform() === 'win32';

// Windows下使用chcp 65001设置编码，其他平台直接运行electron
const command = isWindows ? 'chcp' : 'electron';
const args = isWindows ? ['65001', '&&', 'electron', '.'] : ['.'];

const electronProcess = spawn(command, args, {
  stdio: 'inherit', // 继承父进程的stdio配置
  shell: true // 使用shell来解析命令
});

electronProcess.on('close', (code) => {
  console.log(`Electron process exited with code ${code}`);
}); 