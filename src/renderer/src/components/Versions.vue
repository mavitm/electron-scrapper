<script setup lang="ts">
import { reactive } from 'vue'

const versions = reactive({ ...window.electron.process.versions })
</script>

<template>
  <ul class="versions mx-auto">
    <li class="electron-version">Electron v{{ versions.electron }}</li>
    <li class="chrome-version">Chromium v{{ versions.chrome }}</li>
    <li class="node-version">Node v{{ versions.node }}</li>
  </ul>
</template>

<style lang="scss">
.versions {
  padding: 15px 0;
  font-family: 'Menlo', 'Lucida Console', monospace;
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  background-color: #202127;
  backdrop-filter: blur(24px);
  width: 100%;
  justify-content: center;
}

.versions li {
  display: block;
  float: left;
  border-right: 1px solid var(--ev-c-gray-1);
  padding: 0 20px;
  font-size: 14px;
  line-height: 14px;
  opacity: 0.8;

  &:last-child {
    border: none;
  }
}

@media (max-width: 720px) {
  .text {
    font-size: 20px;
  }
}

@media (max-width: 620px) {
  .versions {
    display: none;
  }
}

@media (max-width: 350px) {
  .tip,
  .actions {
    display: none;
  }
}
</style>
