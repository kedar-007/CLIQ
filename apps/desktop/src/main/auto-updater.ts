import { autoUpdater } from 'electron-updater'
import { dialog, BrowserWindow } from 'electron'
import log from 'electron-log'

// Configure electron-log for auto-updater
autoUpdater.logger = log
;(autoUpdater.logger as typeof log).transports.file.level = 'info'

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

export function setupAutoUpdater(win: BrowserWindow): void {
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info)
    // Notify renderer process about the available update
    if (!win.isDestroyed()) {
      win.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    }
  })

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info)
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = [
      `Download speed: ${progressObj.bytesPerSecond}`,
      `Downloaded ${progressObj.percent.toFixed(1)}%`,
      `(${progressObj.transferred} / ${progressObj.total})`
    ].join(' - ')
    log.info(logMessage)
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info)

    dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Update Ready',
        message: `DSV-CLIQ ${info.version} has been downloaded.`,
        detail:
          'A new version has been downloaded. Restart the application to apply the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
      .catch((err) => {
        log.error('Error showing update dialog:', err)
      })
  })

  // Check for updates after a short delay to avoid blocking app startup
  setTimeout(() => {
    log.info('Triggering update check...')
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('Update check failed (this is normal in dev):', err.message)
    })
  }, 3000)
}
