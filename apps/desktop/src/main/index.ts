import {
  app,
  ipcMain,
  shell,
  Notification,
  BrowserWindow,
  protocol
} from 'electron'
import { join } from 'path'
import log from 'electron-log'
import { createMainWindow } from './window'
import { createTray, updateBadge, destroyTray, flashTray } from './tray'
import { setupAutoUpdater } from './auto-updater'
import { buildApplicationMenu } from './menu'

// Configure electron-log
log.transports.file.level = 'info'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
log.info('App starting...')

// ─── Constants ────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const DEV_URL = 'http://localhost:3000'
const PROD_URL = 'app://./index.html'
const ALLOWED_URL_SCHEMES = ['http:', 'https:']

// ─── Single instance lock ──────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  log.info('Another instance is already running. Quitting.')
  app.quit()
  process.exit(0)
}

// ─── Deep link / protocol registration ────────────────────────────────────────

// Register the dsvcliq:// custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('dsvcliq', process.execPath, [
      join(__dirname, process.argv[1])
    ])
  }
} else {
  app.setAsDefaultProtocolClient('dsvcliq')
}

// ─── Global references ────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// ─── Deep link handler ────────────────────────────────────────────────────────

function handleDeepLink(url: string): void {
  log.info('Handling deep link:', url)
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('deep-link', url)
  }
}

// ─── Second instance handler (Windows / Linux deep links) ─────────────────────

app.on('second-instance', (_event, commandLine) => {
  log.info('Second instance launched')
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  // On Windows, the deep link URL is passed as a command-line argument
  const deepLinkUrl = commandLine.find((arg) => arg.startsWith('dsvcliq://'))
  if (deepLinkUrl) {
    handleDeepLink(deepLinkUrl)
  }
})

// ─── app://  protocol for production builds ────────────────────────────────────

app.whenReady().then(() => {
  // Register app:// protocol to serve built renderer files
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.replace('app://./', '')
    const filePath = join(__dirname, '../../renderer', url)
    callback(filePath)
  })

  log.info('app:// protocol registered')
})

// ─── App ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('App is ready')

  // Build menus
  buildApplicationMenu()

  // Create main window
  mainWindow = createMainWindow()

  // Load the correct URL
  if (isDev) {
    log.info('Loading dev URL:', DEV_URL)
    await mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    log.info('Loading production URL:', PROD_URL)
    await mainWindow.loadURL(PROD_URL)
  }

  // Create system tray
  createTray(mainWindow)

  // Setup auto-updater (only in packaged builds to avoid errors)
  if (!isDev) {
    setupAutoUpdater(mainWindow)
  }

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
      const url = isDev ? DEV_URL : PROD_URL
      mainWindow.loadURL(url)
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // macOS: handle deep links via open-url event
  app.on('open-url', (_event, url) => {
    handleDeepLink(url)
  })
})

// ─── Window management ────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until the user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  log.info('App is about to quit — cleaning up')
  isQuitting = true
  destroyTray()
})

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// get-platform — returns the current OS platform
ipcMain.handle('get-platform', () => {
  return process.platform
})

// get-app-version — returns the app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// set-badge — update tray badge and dock badge (macOS)
ipcMain.handle('set-badge', (_event, count: number) => {
  const sanitizedCount = Math.max(0, Math.floor(Number(count) || 0))
  log.debug('set-badge IPC received:', sanitizedCount)

  if (mainWindow && !mainWindow.isDestroyed()) {
    updateBadge(mainWindow, sanitizedCount)

    // Flash tray for new messages on Windows
    if (process.platform === 'win32' && sanitizedCount > 0) {
      flashTray(mainWindow)
    }
  }

  return sanitizedCount
})

// show-notification — display a native OS notification
ipcMain.handle(
  'show-notification',
  (_event, title: string, body: string) => {
    if (!title || typeof title !== 'string') return false
    if (!body || typeof body !== 'string') return false

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: title.slice(0, 100),
        body: body.slice(0, 300),
        silent: false
      })

      notification.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }
      })

      notification.show()
      log.debug('Notification shown:', title)
      return true
    }

    log.warn('Notifications not supported on this platform')
    return false
  }
)

// open-external — safely open a URL in the default browser
ipcMain.handle('open-external', async (_event, url: string) => {
  if (!url || typeof url !== 'string') return false

  try {
    const parsed = new URL(url)
    if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
      log.warn('Blocked open-external for disallowed scheme:', parsed.protocol)
      return false
    }

    await shell.openExternal(url)
    log.debug('Opened external URL:', url)
    return true
  } catch (err) {
    log.error('Failed to open external URL:', err)
    return false
  }
})

// minimize-to-tray — hide the window to the system tray
ipcMain.handle('minimize-to-tray', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
    log.debug('Window hidden to tray')
    return true
  }
  return false
})

// set-menu-bar-visibility — show or hide the menu bar
ipcMain.handle('set-menu-bar-visibility', (_event, visible: boolean) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenuBarVisibility(visible)
    mainWindow.setAutoHideMenuBar(!visible)
    log.debug('Menu bar visibility set to:', visible)
    return true
  }
  return false
})

// ─── Unhandled errors ─────────────────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason)
})
