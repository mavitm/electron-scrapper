import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { default as installExtension, VUEJS_DEVTOOLS } from 'electron-devtools-installer'
import { parse as parseUrl } from 'url'
import fs from 'fs'
import path from 'path'
import mimeMap from './mimeTypes.json'
import type { OnCompletedListenerDetails } from 'electron/main'
import type { IpcMainInvokeEvent } from 'electron'
import https from 'https'
import http from 'http'
import { URL } from 'url'

interface ipcMessage {
  channel: string
  params: any
}

interface DiscoveredEntry {
  originalUrl: string
  mime: string
  extension: string
  replace: boolean
  replaced: boolean
  downloaded: boolean
  localPath: string
}

class main {
  mainWindow: BrowserWindow | null = null
  scrapperWindow: BrowserWindow | null = null
  mimeMap: Record<string, string[]> = {}
  originHost: string = ''
  discoveredUrls: Map<string, DiscoveredEntry> = new Map()
  anchorUrls: Map<string, Record<string, any>> = new Map()
  downloadPath: string = ''

  constructor() {
    this.mimeMap = mimeMap
    this.initialize()
  }

  initialize(): void {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    app.whenReady().then(() => {
      // Set app user model id for windows
      electronApp.setAppUserModelId('com.electron')
      this.installWebTools().catch(console.error)

      // Default open or close DevTools by F12 in development
      // and ignore CommandOrControl + R in production.
      // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })

      // IPC
      ipcMain.on('cIpc', this.frontEndListener.bind(this))
      ipcMain.handle('cIpc', this.frontEndRequest.bind(this))

      this.createWindow()

      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow()
        }
      })
    })

    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })
  }

  createWindow(): void {
    // Create the browser window.
    this.mainWindow = new BrowserWindow({
      width: 900,
      height: 670,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        nodeIntegrationInWorker: true,
        webSecurity: false, // cross domain
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })

    this.mainWindow.on('ready-to-show', () => {
      if (this.mainWindow) {
        this.mainWindow.show()
      }
    })

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  async installWebTools(): Promise<boolean> {
    if (is.dev) {
      try {
        await installExtension(VUEJS_DEVTOOLS)
        console.log('install vue dev tools')
        return Promise.resolve(true)
      } catch (e) {
        console.error('Vue Devtools failed', e)
        return Promise.resolve(false)
      }
    } else {
      app.on('web-contents-created', (_, contents) => {
        contents.on('before-input-event', (event, input) => {
          if (input.key === 'I' && input.meta && input.alt) {
            event.preventDefault()
          }
        })

        contents.setWindowOpenHandler(() => {
          return { action: 'deny' }
        })
      })
      return Promise.resolve(false)
    }
  }

  send(data: any): void {
    this.mainWindow?.webContents.send('cIpc', data)
  }

  frontEndListener(_, data: ipcMessage): void {
    if (typeof this[data.channel] === 'function') {
      this[data.channel](data.params, _)
    }
  }

  frontEndRequest(event: IpcMainInvokeEvent, data: ipcMessage): any | Promise<any> {
    if (typeof this[data.channel] === 'function') {
      return this[data.channel](data.params, event)
    }
    return { status: 404 }
  }

  /**
   * START
   * @param data
   */
  async start(data: any): Promise<void> {
    console.log('start', data)
    if (this.scrapperWindow) {
      this.stop(data)
    }

    this.downloadPath =
      typeof data.downloadPath === 'string' && data.downloadPath.trim().length > 0
        ? data.downloadPath.trim()
        : app.getPath('downloads')
    this.originHost = this.normalizeHost(parseUrl(data.url, true).host || '')

    this.scrapperWindow = new BrowserWindow({
      show: true,
      width: 1280,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })
    this.scrapperWindow.on('closed', () => {
      this.stop(data)
    })

    if (this.scrapperWindow === null) {
      return Promise.resolve()
    }

    this.scrapperWindow.webContents.session.webRequest.onCompleted((details: any) => {
      const existing = this.discoveredUrls.has(details.url)
      if (!existing) {
        let result: DiscoveredEntry | boolean | null = false
        try {
          result = this.buildDiscoveredEntry(details)
        } catch (e) {
          console.log(e)
        }
        if (result) {
          this.discoveredUrls.set(details.url, result)
          this.send({
            channel: 'addUrl',
            params: result
          })
        }
      }
    })

    if (Object.prototype.hasOwnProperty.call(data, 'userAgent')) {
      if (typeof data.userAgent === 'string' && data.userAgent.length > 0) {
        this.scrapperWindow.webContents.setUserAgent(data.userAgent)
      }
    }

    // this.scrapperWindow.on('ready-to-show', async () => {
    //   if (this.scrapperWindow) {
    //     const anchors = await this.scrapperWindow.webContents.executeJavaScript(`
    //       Array.from(document.querySelectorAll('a')).map(a => a.href)
    //     `)
    //     await this.addAnchors(anchors)
    //   }
    // })

    this.scrapperWindow.webContents.on('dom-ready', async () => {
      if (this.scrapperWindow) {

        await this.scrapperWindow.webContents.executeJavaScript(`
          window.scrollTo(0, 0);
        `)

        const anchors = await this.scrapperWindow.webContents.executeJavaScript(`
          Array.from(document.querySelectorAll('a')).map(a => a.href)
        `)
        await this.addAnchors(anchors)

        this.scrapperWindow.webContents
          .executeJavaScript(
            `new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
              window.scrollBy(0, distance);
              totalHeight += distance;
              if (totalHeight >= document.body.scrollHeight) {
                clearInterval(timer);
                setTimeout(resolve, 100);
              }
            },400); //for auto paging
          })`
          )
          .then(this.nextPage.bind(this))
      }
    })

    await this.scrapperWindow.loadURL(data.url.trim())

    await this.scrapperWindow.webContents.executeJavaScript(`
      document.querySelectorAll('*').forEach(el => {
        const style = getComputedStyle(el);
        if (style.display !== 'none') {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      });
    `)
  }

  stop(data: any): void {
    if (this.scrapperWindow && !this.scrapperWindow.isDestroyed()) {
      this.scrapperWindow.close()
    }
    this.scrapperWindow = null
    this.originHost = ''
    this.discoveredUrls.clear()
    this.anchorUrls.clear()
    this.send({
      channel: 'stop'
    })
    console.log('stopped: ', data)
  }

  async getDownloadPath(data, event): Promise<any> {
    const allowed: Set<string> = new Set([
      'openFile',
      'openDirectory',
      'multiSelections',
      'showHiddenFiles',
      'createDirectory',
      'promptToCreate',
      'noResolveAliases',
      'treatPackageAsDirectory',
      'dontAddToRecent'
    ])

    const win = BrowserWindow.fromWebContents(event.sender)
    let properties: Electron.OpenDialogOptions['properties'] = ['openDirectory', 'createDirectory']
    if (Object.prototype.hasOwnProperty.call(data, 'properties')) {
      if (Array.isArray(data.properties)) {
        properties = data.properties.filter((p: string) =>
          allowed.has(p)
        ) as Electron.OpenDialogOptions['properties']
      }
    }
    const result = await dialog.showOpenDialog(win!, {
      title: 'Download path',
      properties: properties
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null // cancel
    }

    return result.filePaths[0]
  }

  getSysDownloadPath(data, _) {
    return app.getPath(data.path)
  }

  buildDiscoveredEntry(details: OnCompletedListenerDetails): DiscoveredEntry | null {
    const rawMime = details.responseHeaders?.['content-type']?.[0] || ''
    const mime = rawMime.split(';')[0].trim().toLowerCase()
    const ext = this.getExtension(mime) || 'bin'

    const parsed = parseUrl(details.url, true)
    if (!parsed.host || this.normalizeHost(parsed.host) !== this.originHost) return null

    const isHtml = mime === 'text/html'
    const hasQuery = !!parsed.search

    const baseNameRaw = path.basename(parsed.pathname || '')
    const baseExt = path.extname(baseNameRaw)
    const hasExtension = baseExt !== ''

    let fileName = ''
    let replace = false

    // 1. HTML dosyaları
    if (isHtml) {
      if (hasQuery) {
        const safeQuery = parsed.search
          .replace(/[^\w\d=&-]/g, '_')
          .replace(/^_+/, '')
          .substring(0, 100)
        const baseName = baseNameRaw || 'index'
        fileName = `${baseName}_${safeQuery}.${ext}`
      } else if (!hasExtension) {
        fileName = (baseNameRaw || 'index') + '.' + ext
      } else {
        fileName = baseNameRaw
      }
      replace = true
    }

    // 2. Diğer mime türleri
    if (!fileName) {
      if (hasQuery) {
        const queryString = parsed.query
        const fromQuery = Object.entries(queryString)
          .map(([k, v]) => `${k}-${v}`)
          .join('-')
          .replace(/[^\w\d-]/g, '_')
          .substring(0, 100)

        const extName = hasExtension ? baseExt.slice(1) : ext
        const base = path.basename(parsed.pathname || '/').replace(/\.[^/.]+$/, '') || 'file'
        fileName = `${base}_${fromQuery}.${extName}`
        replace = true
      } else if (hasExtension) {
        fileName = baseNameRaw
      } else {
        fileName = (baseNameRaw || 'file') + '.' + ext
      }
    }

    // 3. Dosya yolu oluşturulması
    const pathParts = (parsed.pathname || '/').split('/').filter(Boolean)
    const dirPath = path.join(this.downloadPath, parsed.host, ...pathParts.slice(0, -1))
    const localPath = path.join(dirPath, fileName)

    return {
      originalUrl: details.url,
      mime,
      extension: ext,
      replace,
      replaced: false,
      downloaded: false,
      localPath
    }
  }

  async addAnchors(anchors: string[]): Promise<void> {
    for (const url of anchors) {
      if (!this.isValidUrl(url)) continue
      if (url.includes('#')) continue
      const parsed = parseUrl(url, true)
      if (!parsed.host || this.normalizeHost(parsed.host) !== this.originHost) {
        continue
      }

      if (!this.anchorUrls.has(url)) {
        this.anchorUrls.set(url, { scanned: false })
      }
    }
  }

  async nextPage(): Promise<void> {
    const next = Array.from(this.anchorUrls.entries()).find(([, data]) => data.scanned === false)

    if (next) {
      const [url] = next
      this.anchorUrls.set(url, { scanned: true })
      await this.sleep(200)
      await this.saveCurrentDomSnapshot()
      await this.scrapperWindow!.loadURL(url)

      const scannedCount = Array.from(this.anchorUrls.values()).filter(
        (item) => item.scanned
      ).length
      const pendingCount = this.anchorUrls.size - scannedCount

      this.send({
        channel: 'loaded-url',
        params: { urlSize: this.anchorUrls.size, scannedCount, pendingCount, url }
      })
      console.log('load url:', url)
    } else {
      this.send({
        channel: 'scanned',
        params: { scannedSize: this.anchorUrls.size }
      })
      console.log('scan finish ###################')
      await this.sleep(300)
      await this.downloadDiscoveredEntries()
    }
  }

  async saveCurrentDomSnapshot(): Promise<void> {
    if (!this.scrapperWindow || this.scrapperWindow.isDestroyed()) return

    try {
      const currentUrl = this.scrapperWindow.webContents.getURL()
      const now = Date.now()

      const result = await this.scrapperWindow.webContents.executeJavaScript(`({
      title: document.title || '',
      html: document.documentElement.outerHTML
    })`)

      const rawTitle = typeof result.title === 'string' ? result.title.trim() : ''
      if (!rawTitle) return

      const parsed = parseUrl(currentUrl, true)
      const host = parsed.host ? this.normalizeHost(parsed.host) : 'unknown-host'

      // eslint-disable-next-line no-control-regex
      const safeTitle = rawTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      const maxLength = 100
      const shortTitle =
        safeTitle.length > maxLength ? safeTitle.substring(0, maxLength) : safeTitle

      const fileName = `${shortTitle}_${now}.scrp`

      const subDirs = (parsed.pathname || '/').split('/').filter(Boolean)
      const tmpPath = path.join(this.downloadPath, host, 'tmp', ...subDirs.slice(0, -1))
      const fullPath = path.join(tmpPath, fileName)

      fs.mkdirSync(tmpPath, { recursive: true })

      const content = `<!-- URL: ${currentUrl} -->\n<!-- TITLE: ${rawTitle} -->\n${result.html}`
      fs.writeFileSync(fullPath, content, 'utf-8')

      console.log(`DOM snapshot saved: ${fullPath}`)
    } catch (err) {
      console.warn('Failed to save DOM snapshot:', err)
    }
  }

  async downloadDiscoveredEntries(): Promise<void> {
    this.send({
      channel: 'downloading',
      params: { fileCount: this.discoveredUrls.size }
    })
    for (const [url, entry] of this.discoveredUrls.entries()) {
      if (entry.downloaded) continue

      try {
        console.log(`Downloading: ${url} -> ${entry.localPath}`)
        await this.downloadFile(url, entry.localPath)
        console.log(`Downloaded: ${url}`)
      } catch (err) {
        console.error(`Failed to download ${url}:`, err)
      } finally {
        entry.downloaded = true
        this.discoveredUrls.set(url, entry)
        this.send({
          channel: 'downloadFile',
          params: { url }
        })
      }
    }
    this.send({
      channel: 'downloaded',
      params: { fileCount: this.discoveredUrls.size }
    })

    await this.applyReplacements()
  }

  downloadFile(urlStr: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(urlStr)
      const proto = urlObj.protocol === 'https:' ? https : http

      const req = proto.get(urlStr, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`))
          return
        }

        fs.mkdirSync(path.dirname(localPath), { recursive: true })

        const fileStream = fs.createWriteStream(localPath)
        res.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close()
          resolve()
        })

        fileStream.on('error', (err) => {
          fs.unlinkSync(localPath)
          reject(err)
        })
      })

      this.send({
        channel: 'downloadFile',
        params: { url: urlStr, localPath }
      })

      req.on('error', reject)
    })
  }

  async applyReplacements(): Promise<void> {
    const replaceMap = new Map<string, string>()

    this.send({
      channel: 'changing',
      params: { fileCount: this.discoveredUrls.size }
    })

    for (const [, entry] of this.discoveredUrls.entries()) {
      if (entry.replace) {
        const oldName = path.basename(new URL(entry.originalUrl).pathname)
        const newName = path.basename(entry.localPath)
        replaceMap.set(oldName, newName)
      }
    }

    if (replaceMap.size === 0) {
      console.log('No replacements needed.')
      return
    }

    console.log('Replacements to apply:', replaceMap)
    const allowedMimeTypes = ['text/css', 'text/html', 'application/javascript']

    for (const [url, entry] of this.discoveredUrls.entries()) {
      if (!allowedMimeTypes.includes(entry.mime)) continue

      if (!fs.existsSync(entry.localPath)) {
        console.warn(`File not found, skipping replace: ${entry.localPath}`)
        continue
      }

      try {
        let content = fs.readFileSync(entry.localPath, 'utf-8')
        let replaced = false

        for (const [oldName, newName] of replaceMap.entries()) {
          const regex = new RegExp(oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')

          if (regex.test(content)) {
            content = content.replace(regex, newName)
            replaced = true
            console.log(`Replaced ${oldName} → ${newName} in ${entry.localPath}`)
          }
        }

        if (replaced) {
          fs.writeFileSync(entry.localPath, content, 'utf-8')
          entry.replaced = true
          this.discoveredUrls.set(url, entry)
          this.send({
            channel: 'replacedFile',
            params: { url }
          })
        }
      } catch (err) {
        console.error(`Failed to apply replacements in ${entry.localPath}:`, err)
      }
    }

    this.send({
      channel: 'changed',
      params: { fileCount: this.discoveredUrls.size }
    })
  }

  normalizeHost(host: string): string {
    return host.replace(/^www\./, '').toLowerCase()
  }

  getExtension(mimeType: string): string {
    const list = this.mimeMap[mimeType]
    if (!list || list.length === 0) return 'bin' // fallback
    return list[0].replace(/^\./, '') // baştaki . işaretini kaldır
  }

  isValidUrl(value: string): boolean {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

new main()
