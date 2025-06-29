<script setup lang="ts">
import { useScrapperData } from '@renderer/stores/useScrapperData'
import { useElectronStore } from '@renderer/stores/useElectronStore'
import { onMounted, onUnmounted } from 'vue'
import { useHelpers } from '@renderer/composable/useHelpers'

const subsVals: any[] = []

const db = useScrapperData()
const backend = useElectronStore()
const helpers = useHelpers()

const handleUrlList = (): void => {
  helpers.downloadUrlList(db.fileList)
}
const handleJsonData = (): void => {
  helpers.downloadJson(db.fileList)
}

const handleCsv = (): void => {
  helpers.downloadCsv(db.fileList)
}

onMounted(() => {
  subsVals.push(
    backend.observe('addUrl').subscribe((data) => {
      db.fileList.push(data)
      console.log('find: ', data)
    }),
    backend.observe('stop').subscribe(() => {
      db.fileList = []
    }),
    backend.observe('downloadFile').subscribe((data) => {
      const index = db.fileList.findIndex((item) => item.originalUrl === data.url)

      if (index !== -1) {
        db.fileList[index].downloaded = true
        console.log(`Marked downloaded: ${data.url}`)
      } else {
        console.warn(`URL not found in fileList: ${data.url}`)
      }
    }),
    backend.observe('replacedFile').subscribe((data) => {
      const index = db.fileList.findIndex((item) => item.originalUrl === data.url)

      if (index !== -1) {
        db.fileList[index].replaced = true
        console.log(`Marked replaced: ${data.url}`)
      } else {
        console.warn(`URL not found in fileList: ${data.url}`)
      }
    })
  )
})
onUnmounted(() => {
  subsVals.forEach((val) => {
    val.unsubscribe()
  })
})
</script>

<template>
  <div class="scroll-content">
    <table class="table table-striped data-table">
      <thead class="sticky-top">
        <tr>
          <th>
            <div class="d-flex w-100">
              <span class="me-auto">Url</span>
              <a class="text-end mx-2 hand" @click="handleUrlList">Url list</a>
              <a class="text-end mx-2 hand" @click="handleJsonData">Json</a>
              <a class="text-end mx-2 hand" @click="handleCsv">Csv</a>
            </div>
          </th>
          <th>Mime</th>
          <th>Extension</th>
          <th>local</th>
          <th>replace</th>
          <th>downloaded</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in db.fileList" :key="item.originalUrl">
          <td>{{ item.originalUrl }}</td>
          <td>{{ item.mime }}</td>
          <td>{{ item.extension }}</td>
          <td>{{ item.localPath }}</td>
          <td>
            <div>
              <span v-if="item.replace">Yes:</span>
              <span v-else>No</span>
            </div>
            <div v-if="item.replace">
              <span v-if="item.replaced"> done</span>
              <span v-else> pending</span>
            </div>
          </td>
          <td>
            <span v-if="item.downloaded"> done</span>
            <span v-else> pending</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style lang="scss">
.scroll-content {
  position: relative;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.data-table {
  font-size: 12px;
}
</style>
