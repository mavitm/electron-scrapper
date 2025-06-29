import { onMounted, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useElectronStore } from '@renderer/stores/useElectronStore'

export interface DiscoveredEntry {
  originalUrl: string
  mime: string
  extension: string
  replace: boolean
  replaced: boolean
  downloaded: boolean
  localPath: string
}

export const useScrapperData = defineStore('useScrapperData', () => {
  const domainName = ref('')
  const fileList = ref<DiscoveredEntry[]>([])
  const processType = ref('pending')
  const downloadPath = ref('')
  const userAgent = ref(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  )

  const backend = useElectronStore()

  watch(downloadPath, (val) => {
    localStorage.setItem('downloadPath', val)
  })
  watch(userAgent, (val) => {
    localStorage.setItem('userAgent', val)
  })

  onMounted(async () => {
    const cAgent = localStorage.getItem('userAgent')
    if (cAgent) {
      userAgent.value = cAgent
    }
    const cDdownloadPath = localStorage.getItem('downloadPath')
    if (!cDdownloadPath) {
      downloadPath.value = await backend.request('getSysDownloadPath', {
        params: {
          path: 'downloads'
        }
      })
    } else {
      downloadPath.value = cDdownloadPath
    }
  })

  return {
    domainName,
    fileList,
    processType,
    userAgent,
    downloadPath
  }
})
