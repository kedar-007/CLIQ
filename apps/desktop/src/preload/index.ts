import { contextBridge, ipcRenderer } from 'electron'

// Type declarations for the exposed API
export interface ElectronAPI {
  /** The current OS platform ('darwin', 'win32', 'linux') */
  platform: NodeJS.Platform

  /**
   * Update the app badge / tray badge count.
   * @param count  Number of unread messages (0 clears the badge)
   */
  setBadge(count: number): Promise<number>

  /**
   * Display a native OS notification.
   * @param title  Notification title (max 100 chars)
   * @param body   Notification body (max 300 chars)
   */
  showNotification(title: string, body: string): Promise<boolean>

  /**
   * Returns the current app version string (e.g. "1.0.0").
   */
  getAppVersion(): Promise<string>

  /**
   * Open a URL in the system default browser.
   * Only http:// and https:// URLs are allowed.
   * @param url  The URL to open
   */
  openExternal(url: string): Promise<boolean>

  /**
   * Hide the main window to the system tray.
   */
  minimizeToTray(): Promise<boolean>

  /**
   * Show or hide the application menu bar.
   * @param visible  true to show, false to hide
   */
  setMenuBarVisibility(visible: boolean): Promise<boolean>

  /**
   * Register a callback for when a software update is available.
   * The callback receives version info from electron-updater.
   */
  onUpdateAvailable(
    callback: (
      _event: Electron.IpcRendererEvent,
      info: { version: string; releaseDate: string; releaseNotes?: string }
    ) => void
  ): void

  /**
   * Register a callback for incoming deep links (dsvcliq:// URLs).
   * @param callback  Receives the full deep-link URL string
   */
  onDeepLink(
    callback: (_event: Electron.IpcRendererEvent, url: string) => void
  ): void

  /**
   * Remove all listeners for the 'update-available' IPC event.
   * Call this during component cleanup to avoid memory leaks.
   */
  removeUpdateAvailableListeners(): void

  /**
   * Remove all listeners for the 'deep-link' IPC event.
   * Call this during component cleanup to avoid memory leaks.
   */
  removeDeepLinkListeners(): void
}

// Expose a strongly-typed API to the renderer via contextBridge
const electronAPI: ElectronAPI = {
  // Synchronous platform value — no IPC round-trip needed
  platform: process.platform,

  setBadge: (count: number) => ipcRenderer.invoke('set-badge', count),

  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('show-notification', title, body),

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),

  setMenuBarVisibility: (visible: boolean) =>
    ipcRenderer.invoke('set-menu-bar-visibility', visible),

  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', callback)
  },

  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', callback)
  },

  removeUpdateAvailableListeners: () => {
    ipcRenderer.removeAllListeners('update-available')
  },

  removeDeepLinkListeners: () => {
    ipcRenderer.removeAllListeners('deep-link')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Augment the global Window interface so TypeScript is happy in the renderer
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
