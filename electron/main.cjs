// App para Windows (Electron): abre a mesma tela do app do celular.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { startAutoUpdate } = require('./updater.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#05070d',
    title: 'InvestCrime',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // links (fontes, cartaz oficial) abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

app.whenReady().then(() => startAutoUpdate(createWindow()));
app.on('window-all-closed', () => app.quit());
