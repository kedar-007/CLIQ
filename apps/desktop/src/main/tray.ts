import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import { join } from 'path'
import log from 'electron-log'

let tray: Tray | null = null
let isMuted = false
let flashInterval: ReturnType<typeof setInterval> | null = null
let isFlashing = false

function getTrayIconPath(isDark = false): string {
  const iconName = isDark ? 'tray-icon-dark.png' : 'tray-icon.png'
  return join(__dirname, '../../assets', iconName)
}

function buildTrayImage(badgeCount = 0): Electron.NativeImage {
  const iconPath = getTrayIconPath()
  let image: Electron.NativeImage

  try {
    image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) {
      // Fallback: create a simple 16x16 placeholder icon
      image = nativeImage.createEmpty()
    }
  } catch {
    image = nativeImage.createEmpty()
  }

  return image
}

function buildContextMenu(win: BrowserWindow): Electron.Menu {
  const isVisible = win.isVisible()

  return Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide DSV-CLIQ' : 'Show DSV-CLIQ',
      click: () => {
        if (win.isVisible()) {
          win.hide()
        } else {
          win.show()
          win.focus()
        }
        // Rebuild menu to reflect new state
        if (tray) {
          tray.setContextMenu(buildContextMenu(win))
        }
      }
    },
    {
      label: isMuted ? 'Unmute Notifications' : 'Mute Notifications',
      click: () => {
        isMuted = !isMuted
        log.info('Notifications muted:', isMuted)
        if (tray) {
          tray.setContextMenu(buildContextMenu(win))
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit DSV-CLIQ',
      accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
      click: () => {
        app.quit()
      }
    }
  ])
}

export function createTray(win: BrowserWindow): Tray {
  const iconImage = buildTrayImage()

  tray = new Tray(iconImage)
  tray.setToolTip('DSV-CLIQ')
  tray.setContextMenu(buildContextMenu(win))

  // Left-click on tray icon toggles window visibility
  tray.on('click', () => {
    if (win.isVisible()) {
      if (win.isFocused()) {
        win.hide()
      } else {
        win.show()
        win.focus()
      }
    } else {
      win.show()
      win.focus()
    }
    // Update context menu to reflect new state
    if (tray) {
      tray.setContextMenu(buildContextMenu(win))
    }
  })

  // Double-click on tray (Windows) — show window
  tray.on('double-click', () => {
    win.show()
    win.focus()
  })

  log.info('Tray created')
  return tray
}

export function updateBadge(win: BrowserWindow, count: number): void {
  if (!tray) return

  const tooltip = count > 0
    ? `DSV-CLIQ (${count} unread message${count === 1 ? '' : 's'})`
    : 'DSV-CLIQ'

  tray.setToolTip(tooltip)

  // On macOS, update the dock badge
  if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? String(count) : '')
  }

  // On Windows, overlay icon on taskbar button
  if (process.platform === 'win32') {
    if (count > 0) {
      try {
        const overlayPath = join(__dirname, '../../assets', 'badge.png')
        const overlayImage = nativeImage.createFromPath(overlayPath)
        if (!overlayImage.isEmpty()) {
          win.setOverlayIcon(overlayImage, `${count} unread messages`)
        }
      } catch {
        // Overlay icon not critical — ignore errors
      }
    } else {
      win.setOverlayIcon(null, '')
    }
  }

  // Rebuild tray image with badge indicator (simple approach: update icon)
  const iconImage = buildTrayImage(count)
  tray.setImage(iconImage)

  log.debug('Badge updated to:', count)
}

export function flashTray(win: BrowserWindow): void {
  if (!tray || isFlashing) return
  if (process.platform !== 'win32') return

  isFlashing = true
  let visible = true

  // Flash the tray icon by alternating between visible/hidden state via tooltip update
  // Also flash the taskbar button on Windows
  win.flashFrame(true)

  const emptyImage = nativeImage.createEmpty()
  const normalImage = buildTrayImage()

  flashInterval = setInterval(() => {
    if (!tray) {
      stopFlash(win)
      return
    }
    tray.setImage(visible ? emptyImage : normalImage)
    visible = !visible
  }, 500)

  log.debug('Tray flash started')
}

export function stopFlash(win: BrowserWindow): void {
  if (flashInterval) {
    clearInterval(flashInterval)
    flashInterval = null
  }

  isFlashing = false

  if (process.platform === 'win32') {
    win.flashFrame(false)
  }

  if (tray) {
    tray.setImage(buildTrayImage())
  }

  log.debug('Tray flash stopped')
}

export function destroyTray(): void {
  if (flashInterval) {
    clearInterval(flashInterval)
    flashInterval = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
  log.info('Tray destroyed')
}

export function getTray(): Tray | null {
  return tray
}
