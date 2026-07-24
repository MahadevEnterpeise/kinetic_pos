<script setup>
import { ref, onMounted } from 'vue';
import AnimationLoader from './AnimationLoader.vue';
import { link } from '../assets/Link';

// State for data coming "from the server"
const complaints = ref([]);
const suggestions = ref([]);
const isLoading = ref(true);
const Token=ref('');
const data=ref('');
const currentLoadingStage=ref('');
const shopId=sessionStorage.getItem('shopId');

// Simulate Server Fetch
onMounted(async() => {
  isLoading.value = true; // start loading
  currentLoadingStage.value = 'fetching reviews';
  
  try {
    Token.value = sessionStorage.getItem('userToken');
    
    if (!Token.value) {
      throw new Error('No userId in sessionStorage');
    }

    const response = await fetch(`${link}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: Token.value,shopId:shopId })
    });

    if (!response.ok) throw new Error('Server error: ' + response.status);

    const result = await response.json(); // () added here
    
    complaints.value = result.complaints || [];
    suggestions.value = result.suggestions || [];
    
  } catch(error) {
    console.error('error', error);
    alert('Load error: ' + error.message);
  } finally {
    isLoading.value = false; // always stop loading, success or fail
  }
});

const handleAction = (type, id) => {
  alert('Action in devlopment')
  // You can add logic here to "resolve" or "delete" items
  //currently do not need this action
};
//done by 2026/05/24
</script>


<template>
  <div class="feedback-page" v-if="!isLoading">
    <header class="page-header">
      <h1>Feedback Management</h1>
    </header>

    <main class="content-wrapper">
      <!-- Complaints Column -->
      <section class="data-column complaints">
        <div class="column-header">
          <h2>Complaints</h2>
          <span class="badge red">{{ complaints.length }}</span>
        </div>
        
        <div class="scroll-area">
          <div v-for="item in complaints" :key="item.id" class="data-card border-red">
            <div class="card-meta">
              <span class="username">@{{ item.user }}</span>
              <span class="tag">{{ item.category }}</span>
            </div>
            <p class="message">{{ item.message }}</p>
            <button class="btn-resolve" @click="handleAction('complaint', item.id)">Mark Resolved</button>
          </div>
        </div>
      </section>

      <!-- Suggestions Column -->
      <section class="data-column suggestions">
        <div class="column-header">
          <h2>Suggestions</h2>
          <span class="badge blue">{{ suggestions.length }}</span>
        </div>

        <div class="scroll-area">
          <div v-for="item in suggestions" :key="item.id" class="data-card border-blue">
            <div class="card-meta">
              <span class="username">@{{ item.user }}</span>
            </div>
            <p class="message">{{ item.message }}</p>
            <button class="btn-upvote" @click="handleAction('suggestion', item.id)">Hold Suggestion</button>
          </div>
        </div>
      </section>
    </main>
  </div>
  <AnimationLoader :message="currentLoadingStage" size="md" v-if="isLoading"/>
  
</template>
<style scoped>
.animation{
  background-color: white;
  box-shadow: 2px 2px 6px;
  border-radius: 12px;
  width: 600px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.feedback-page {
  font-family: sans-serif;
  background-color: #f4f7f6;
  min-height: 100vh;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

/* Grid Layout: 1 column on mobile, 2 columns on desktop */
.content-wrapper {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

@media (min-width: 900px) {
  .content-wrapper {
    grid-template-columns: 1fr 1fr;
    height: 80vh; /* Fixed height for dual-scroll setup */
  }
}

.data-column {
  background: #ffffff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
  overflow: hidden;
}

.column-header {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #04042c;
  color: white;
}

.scroll-area {
  padding: 15px;
  overflow-y: auto;
  flex-grow: 1;
}

/* Card Styling */
.data-card {
  background: #fff;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}

.border-red { border-left: 5px solid #ff4d4d; }
.border-blue { border-left: 5px solid #007bff; }

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 10px;
}

.username { font-weight: bold; color: #555; }
.tag { background: #eee; padding: 2px 8px; border-radius: 4px; }

.message {
  font-size: 14px;
  color: #333;
  margin-bottom: 15px;
  line-height: 1.5;
}

/* Buttons */
button {
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.2s;
}

.btn-resolve { background: #ffeded; color: #d73a49; }
.btn-upvote { background: #e7f3ff; color: #007bff; }

button:hover { opacity: 0.8; }

.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
}
.red { background: #ff4d4d; }
.blue { background: #007bff; }
</style>
