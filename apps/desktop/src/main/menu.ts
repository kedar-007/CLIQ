import { Menu, shell, app, BrowserWindow, MenuItem } from 'electron'
import log from 'electron-log'

const WEBSITE_URL = 'https://www.dsvcliq.com'
const ISSUE_URL = 'https://github.com/dsv/cliq/issues/new'

function getFocusedWebContents(): Electron.WebContents | null {
  const win = BrowserWindow.getFocusedWindow()
  return win ? win.webContents : null
}

export function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),

    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: isMac ? 'Command+N' : 'Ctrl+N',
          click: () => {
            // Import lazily to avoid circular dependency
            const { createMainWindow } = require('./window')
            const newWin: BrowserWindow = createMainWindow()

            const isDev = process.env.NODE_ENV === 'development'
            if (isDev) {
              newWin.loadURL('http://localhost:3000')
            } else {
              newWin.loadURL('app://./index.html')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Close',
          accelerator: isMac ? 'Command+W' : 'Ctrl+W',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.close()
          }
        },
        { type: 'separator' },
        ...(isMac
          ? []
          : [
              {
                label: 'Quit',
                accelerator: 'Ctrl+Q',
                click: () => app.quit()
              }
            ])
      ]
    },

    // Edit menu
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: isMac ? 'Command+Z' : 'Ctrl+Z',
          click: () => getFocusedWebContents()?.undo()
        },
        {
          label: 'Redo',
          accelerator: isMac ? 'Shift+Command+Z' : 'Ctrl+Y',
          click: () => getFocusedWebContents()?.redo()
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: isMac ? 'Command+X' : 'Ctrl+X',
          click: () => getFocusedWebContents()?.cut()
        },
        {
          label: 'Copy',
          accelerator: isMac ? 'Command+C' : 'Ctrl+C',
          click: () => getFocusedWebContents()?.copy()
        },
        {
          label: 'Paste',
          accelerator: isMac ? 'Command+V' : 'Ctrl+V',
          click: () => getFocusedWebContents()?.paste()
        },
        { type: 'separator' },
        {
          label: 'Select All',
          accelerator: isMac ? 'Command+A' : 'Ctrl+A',
          click: () => getFocusedWebContents()?.selectAll()
        }
      ]
    },

    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: isMac ? 'Command+R' : 'Ctrl+R',
          click: () => getFocusedWebContents()?.reload()
        },
        {
          label: 'Force Reload',
          accelerator: isMac ? 'Shift+Command+R' : 'Ctrl+Shift+R',
          click: () => getFocusedWebContents()?.reloadIgnoringCache()
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => {
            const wc = getFocusedWebContents()
            if (wc) {
              if (wc.isDevToolsOpened()) {
                wc.closeDevTools()
              } else {
                wc.openDevTools()
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: isMac ? 'Command+0' : 'Ctrl+0',
          click: () => {
            const wc = getFocusedWebContents()
            if (wc) wc.setZoomLevel(0)
          }
        },
        {
          label: 'Zoom In',
          accelerator: isMac ? 'Command+Plus' : 'Ctrl+Plus',
          click: () => {
            const wc = getFocusedWebContents()
            if (wc) {
              const currentZoom = wc.getZoomLevel()
              wc.setZoomLevel(Math.min(currentZoom + 0.5, 5))
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: isMac ? 'Command+-' : 'Ctrl+-',
          click: () => {
            const wc = getFocusedWebContents()
            if (wc) {
              const currentZoom = wc.getZoomLevel()
              wc.setZoomLevel(Math.max(currentZoom - 0.5, -5))
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: isMac ? 'Ctrl+Command+F' : 'F11',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.setFullScreen(!win.isFullScreen())
          }
        }
      ]
    },

    // Window menu
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: isMac ? 'Command+M' : 'Ctrl+M',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) win.minimize()
          }
        },
        {
          label: 'Zoom',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              if (win.isMaximized()) {
                win.unmaximize()
              } else {
                win.maximize()
              }
            }
          }
        },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              {
                label: 'Bring All to Front',
                click: () => {
                  BrowserWindow.getAllWindows().forEach((win) => {
                    win.show()
                  })
                }
              }
            ]
          : [])
      ]
    },

    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal(WEBSITE_URL)
          }
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal(ISSUE_URL)
          }
        },
        { type: 'separator' },
        {
          label: 'About DSV-CLIQ',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              // On non-macOS, show a custom about dialog since there's no native one
              if (!isMac) {
                const { dialog } = require('electron')
                dialog.showMessageBox(win, {
                  type: 'info',
                  title: 'About DSV-CLIQ',
                  message: `DSV-CLIQ`,
                  detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode.js: ${process.versions.node}`,
                  buttons: ['OK']
                })
              }
            }
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  log.info('Application menu built')
}
