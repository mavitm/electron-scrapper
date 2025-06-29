<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useScrapperData } from '@renderer/stores/useScrapperData'
import { useElectronStore } from '@renderer/stores/useElectronStore'

const backend = useElectronStore()
const scrapperData = useScrapperData()
const startUrl = ref('')
const subsVals: any[] = []
const scanUrlSize = ref(0)
const currentUrl = ref('')
const scannedCount = ref(0)
const pendingCount = ref(0)

const buttonText = computed(() => (scrapperData.processType === 'pending' ? 'Start' : 'Stop'))

const startStop = (): void => {
  if (scrapperData.processType === 'pending') {
    scrapperData.processType = 'start'
    backend.send('start', {
      params: {
        url: startUrl.value,
        downloadPath: scrapperData.downloadPath,
        userAgent: scrapperData.userAgent
      }
    })
  } else {
    scrapperData.processType = 'pending'
    backend.send('stop', { params: { url: startUrl.value } })
  }
}

const selectFolder = async (): Promise<void> => {
  const selectedPath = await backend.request('getDownloadPath', {
    params: {
      properties: ['openDirectory', 'createDirectory']
    }
  })

  if (selectedPath === null) {
    console.log('No download path found')
  } else {
    scrapperData.downloadPath = selectedPath
  }
}

onMounted(() => {
  subsVals.push(
    backend.observe('stop').subscribe(() => {
      scrapperData.processType = 'pending'
    }),
    backend.observe('loaded-url').subscribe((data) => {
      scanUrlSize.value = data.urlSize
      currentUrl.value = data.url
      scannedCount.value = data.scannedCount
      pendingCount.value = data.pendingCount
    }),
    backend.observe('scanned').subscribe(() => {
      scrapperData.processType = 'scanned'
    }),
    backend.observe('downloading').subscribe(() => {
      scrapperData.processType = 'downloading'
    }),
    backend.observe('downloaded').subscribe(() => {
      scrapperData.processType = 'downloaded'
    }),
    backend.observe('changing').subscribe(() => {
      scrapperData.processType = 'changing'
    }),
    backend.observe('changed').subscribe(() => {
      scrapperData.processType = 'changed'
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
  <div class="form-group mb-3">
    <div class="url-input input-group mb-3">
      <input v-model="startUrl" type="text" class="form-control" name="url" placeholder="URL" />
      <button type="button" class="btn btn-success" @click="startStop">{{ buttonText }}</button>
    </div>
  </div>

  <div v-if="scrapperData.processType === 'pending'" class="form-group mb-3">
    <label>Out path</label>
    <div class="url-input input-group mb-3">
      <input
        v-model="scrapperData.downloadPath"
        type="text"
        class="form-control"
        placeholder="download path"
      />
      <button type="button" class="btn btn-primary" @click="selectFolder">...</button>
    </div>
  </div>
  <div v-if="scrapperData.processType === 'pending'" class="form-group mb-3">
    <label>User agent</label>
    <div class="url-input input-group mb-3">
      <input
        v-model="scrapperData.userAgent"
        type="text"
        class="form-control"
        placeholder="User agent"
      />
    </div>
  </div>
  <div v-if="scrapperData.processType === 'start'" class="form-group my-3">
    <div>Scanning...</div>
    <table class="table table table-striped data-table">
      <tbody>
        <tr>
          <td>Current:</td>
          <td>{{ currentUrl }}</td>
        </tr>
        <tr>
          <td>Total:</td>
          <td>{{ scanUrlSize }}</td>
        </tr>
        <tr>
          <td>Scanned:</td>
          <td>{{ scannedCount }}</td>
        </tr>
        <tr>
          <td>Pending:</td>
          <td>{{ pendingCount }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <div v-if="scrapperData.processType === 'downloading'">
    <div>Downloading...</div>
  </div>
  <div v-if="scrapperData.processType === 'changing'">
    <div>Replace process ...</div>
  </div>
</template>

<style lang="scss"></style>
