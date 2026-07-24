<template>
  <div class="formbox">
    <form @submit.prevent>
      <input type="text" :value="name" readonly />
      
      <input type="number" v-model.number="qty" min="1" required />
      
      <input type="number" :value="price" readonly />
      
      <input type="text" :value="price * qty" readonly />
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const name = ref('Sample Product');
const price = ref(50);
const qty = ref(1);
</script>
