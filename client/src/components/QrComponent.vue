<template>
  <div>
    <h1>QR Code Generator</h1>
    <!-- The Component -->
     <div v-if="!loading">
    <qrcode-vue :value="text" :size="200" level="H" render-as="jpg"/>
      </div>
      <div v-if="loading">
        <animation-loader message="Getting URL..." size="md"/>
      </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import QrcodeVue from 'qrcode.vue'
import { link } from '../assets/Link'
import AnimationLoader from './AnimationLoader.vue';
const uid =sessionStorage.getItem('userToken');
const shopId=sessionStorage.getItem('shopId');
const text = ref('');
const loading=ref(true);
onMounted(async () => {
  try {
    const response = await fetch(`${link}/user-me`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid, shopId: shopId })
    });
    
    if (!response.ok) {
      throw new Error('fetching failed...'); // Fixed typo 'error' to 'Error'
    }
    
    const data = await response.json(); // 1. Parse the JSON object completely
    
    // 2. Change this to match the exact key your backend sends back (e.g., data.url)
    text.value = data.url; 
    
    loading.value = false;
  } catch (err) {
    console.error(err);
    loading.value = false;
  }
});
//done by 2026/05/24 all set here
</script>
