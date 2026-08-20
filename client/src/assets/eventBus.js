// src/assets/eventBus.js
import { reactive } from 'vue';

export const eventBus = reactive({
  refreshPending: 0,
  triggerRefresh() {
    this.refreshPending++;
  }
});