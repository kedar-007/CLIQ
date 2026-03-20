import { BrowserWindow, nativeImage } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import log from 'electron-log'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const store = new Store<{ windowState: WindowState }>()

const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 800
const MIN_WIDTH = 900
const MIN_HEIGHT = 600

function getStoredWindowState(): WindowState {
  return store.get('windowState', {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    maximized: false
  }) as WindowState
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return

  const isMaximized = win.isMaximized()
  const bounds = win.getNormalBounds()

  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: isMaximized
  }

  store.set('windowState', state)
  log.debug('Window state saved:', state)
}

export function createMainWindow(): BrowserWindow {
  const savedState = getStoredWindowState()

  const preloadPath = join(__dirname, '../preload/index.js')
  log.info('Preload path:', preloadPath)

  const win = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    autoHideMenuBar: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  // Restore maximized state after window is ready
  win.once('ready-to-show', () => {
    if (savedState.maximized) {
      win.maximize()
    }
    win.show()
    log.info('Main window shown')
  })

  // Persist window state on resize and move
  const saveState = () => saveWindowState(win)
  win.on('resize', saveState)
  win.on('move', saveState)
  win.on('close', saveState)

  // Gracefully handle window unresponsive
  win.on('unresponsive', () => {
    log.warn('Main window became unresponsive')
  })

  win.on('responsive', () => {
    log.info('Main window became responsive again')
  })

  // Log any renderer process crashes
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone:', details)
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    log.error('Failed to load:', errorCode, errorDescription)
  })

  log.info('Main window created')
  return win
}
