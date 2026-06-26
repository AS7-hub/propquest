const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// 6. Global error handling: log but don't crash
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

async function createWindow() {
  // 2. Create a BrowserWindow
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "PropQuest — Property Search",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 3. Load src/index.html into the window
  await mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

async function bootstrap() {
  try {
    // 1. Require and start the Express server
    const serverModule = require('../server/index.js');
    
    // Support various ways the server might export its start function
    if (typeof serverModule === 'function') {
      await serverModule();
    } else if (serverModule && typeof serverModule.start === 'function') {
      await serverModule.start();
    } else if (serverModule && typeof serverModule.startServer === 'function') {
      await serverModule.startServer();
    }
  } catch (error) {
    console.error('Error starting Express server:', error);
  }

  await app.whenReady();

  // 4. Set up User-Agent spoofing
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  createWindow();

  // 5. Handle macOS activate
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

bootstrap();

// 5. Quit on non-macOS when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
