<script setup lang="ts">
import StartStop from '@renderer/components/StartStop.vue'
import UrlList from '@renderer/components/UrlList.vue'
</script>

<template>
  <!-- <img alt="logo" class="logo" src="./assets/electron.svg" />-->
  <div class="row m-0 h-100">
    <div class="col-3 position-relative">
      <start-stop />
    </div>
    <div class="col-9 position-relative h-100">
      <url-list />
    </div>
  </div>
</template>
<style lang="scss">
#app {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  padding: 15px 0 0 0;
}
</style>
