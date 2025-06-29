export {}

declare global {
  interface Window {
    api: {
      openExternal: (url: string) => Promise<void>
    }
    electron: typeof import('@electron-toolkit/preload').electronAPI
  }
}
