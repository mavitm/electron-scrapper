import { onMounted, ref } from 'vue'
import { defineStore } from 'pinia'
import { Observable } from '@renderer/classes/Observable'

interface ipcMessage {
  channel?: string
  params: any
}

export const useElectronStore = defineStore('useElectronStore', () => {
  const domReady = ref(false)
  const observableMap: Record<string, Observable<any>> = {}

  const send = (channel: string, data: ipcMessage): void => {
    if (!Object.prototype.hasOwnProperty.call(data, 'channel')) {
      data.channel = channel
    }
    window.electron.ipcRenderer.send('cIpc', data)
  }

  const request = (channel: string, data: ipcMessage): Promise<any> => {
    if (!Object.prototype.hasOwnProperty.call(data, 'channel')) {
      data.channel = channel
    }
    return window.electron.ipcRenderer.invoke('cIpc', data)
  }

  const observe = <T = any>(method: string): Observable<T> => {
    if (!observableMap[method]) {
      observableMap[method] = new Observable<T>()
    }
    return observableMap[method] as Observable<T>
  }

  const listenElectron = (_, data: ipcMessage): void => {
    if (typeof data.channel === 'string') {
      observe(data.channel).next(data.params)
    }
  }

  const openExternal = (url: string): any => {
    window.api.openExternal(url).catch((e) => e)
  }

  onMounted(() => {
    window.electron.ipcRenderer.on('cIpc', listenElectron)
  })

  return {
    domReady,
    send,
    request,
    observe,
    openExternal
  }
})
