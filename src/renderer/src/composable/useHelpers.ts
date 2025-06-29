import { saveAs } from 'file-saver'
import type { DiscoveredEntry } from '@renderer/stores/useScrapperData'

export function useHelpers(): {
  isValidURL: (value: string) => boolean
  downloadUrlList: (entries: DiscoveredEntry[], filename?: string) => void
  downloadJson: (entries: DiscoveredEntry[], filename?: string) => void
  downloadCsv: (entries: DiscoveredEntry[], filename?: string) => void
} {
  const isValidURL = (value: string): boolean => {
    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }

  const downloadUrlList = (entries: DiscoveredEntry[], filename = 'urls.txt'): void => {
    const content = entries.map((e) => e.originalUrl).join('\n')
    downloadBlob(content, filename, 'text/plain')
  }

  const downloadJson = (entries: DiscoveredEntry[], filename = 'data.json'): void => {
    const content = JSON.stringify(entries, null, 2)
    downloadBlob(content, filename, 'application/json')
  }

  const downloadCsv = (entries: DiscoveredEntry[], filename = 'data.csv'): void => {
    if (entries.length === 0) return

    const headers = Object.keys(entries[0]).join(',')
    const rows = entries.map((entry) =>
      Object.values(entry)
        .map((value) => `"${String(value).replace(/"/g, '""')}"`) // escape "
        .join(',')
    )
    const content = [headers, ...rows].join('\n')
    downloadBlob(content, filename, 'text/csv')
  }

  const downloadBlob = (content: string, filename: string, type: string): void => {
    const blob = new Blob([content], { type })
    saveAs(blob, filename)
  }

  return {
    isValidURL,
    downloadUrlList,
    downloadJson,
    downloadCsv
  }
}
