<template>
<div class="entire">
  <!-- Sidebar Navigation -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <h2>KP</h2>
    </div>
    <div class="sidebar-menu">
      <button class="logout-btn" @click="logout()" title="Logout">
        <span>🚪</span>
        <span class="label">Logout</span>
      </button>
    </div>
  </aside>

  <!-- Main Container -->
  <div class="container">
    <header>
      <h1>Kinetic POS</h1>
    </header>

    <!-- Quick Metrics Cards -->
    <div class="quickdata">
      <div class="box metric-box">
        <h4>{{ Number(data.sales || 0).toFixed(2) }}</h4>
        <p>Today Income</p>
      </div>
      <div class="box metric-box">
        <h4>{{ data.salecount || 0 }}</h4>
        <p>Active POS</p>
      </div>
      <div class="box metric-box">
        <h4>{{ posowners.length }}</h4>
        <p>Total POS Owners</p>
      </div>
    </div>

    <!-- Chart Section -->
    <div class="chart card-panel">
      <LineChart />
    </div>

    <!-- Register POS Section -->
    <div class="newone card-panel">
      <RegisterPos />
    </div>

    <!-- POS Owners Data Table Section with Live Search -->
    <div class="datas card-panel">
      <div class="datas-header-row">
        <h4>POS Sale Data</h4>
        <div class="search-box-wrapper">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="Search by name..." 
            class="search-input"
          />
        </div>
      </div>

      <div class="data1 head-row">
        <p>Name</p>
        <p>Date</p>
        <p>Due</p>
        <p>Status</p>
        <p>Action</p>
      </div>

      <div class="data-list-container">
        <div v-if="filteredPosOwners && filteredPosOwners.length > 0">
          <div class="data" v-for="d in filteredPosOwners" :key="d.id">
            <p class="col-name">{{ d.name }}</p>
            <p class="col-date">{{ d.date }}</p>
            <p class="col-due">{{ d.due }}</p>
            <p class="col-status">
              <span :class="['status-badge', (d.status || '').toLowerCase()]">{{ d.status }}</span>
            </p>
            <div class="col-action">
              <button class="terminate-btn" @click="termination(d.id)">Terminate</button>
            </div>
          </div>
        </div>

        <div class="empty-state" v-else-if="searchQuery && filteredPosOwners.length === 0">
          <p>No matching POS records found.</p>
        </div>

        <div class="empty-state" v-else-if="!posowners || posowners.length === 0">
          <p>Not yet available</p>
          <AnimationLoader />
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import LineChart from '../components/LineChart.vue';
import RegisterPos from '../components/RegisterPos.vue';
import { useRouter } from 'vue-router';
import { link } from '../assets/Link.js';
import AnimationLoader from '../components/AnimationLoader.vue';

const router = useRouter();
const data = ref({});
const posowners = ref([]);
const searchQuery = ref('');
const user = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopid');

onMounted(async () => {
  if (!user) {
    router.push('/auth');
    return;
  }

  try {
    const response = await fetch(`${link}/posowners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: user, shopId: shopId })
    });

    if (!response.ok) {
      throw new Error('Server error while loading data');
    }

    data.value = await response.json();
    posowners.value = data.value.posowners || [];
  } catch (err) {
    console.error("Error loading pos owners:", err);
  }
});

const filteredPosOwners = computed(() => {
  if (!searchQuery.value.trim()) {
    return posowners.value;
  }
  const query = searchQuery.value.toLowerCase();
  return posowners.value.filter(item => 
    (item.name && item.name.toLowerCase().includes(query)) ||
    (item.id && String(item.id).toLowerCase().includes(query))
  );
});

async function termination(d) {
  try {
    const response = await fetch(`${link}/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: d })
    });

    if (!response.ok) {
      alert('Try again later');
      return;
    }

    const res = await response.json();
    alert(res.value.message);
    
    // Refresh local list after termination
    posowners.value = posowners.value.filter(item => item.id !== d);
  } catch (err) {
    console.error("Termination error:", err);
    alert('Could not process termination.');
  }
}

function logout() {
  sessionStorage.removeItem('userToken');
  sessionStorage.removeItem('shopId');
  router.push('/auth');
}
</script>

<style scoped>
html, body {
  margin: 0;
  padding: 0;
  height: 100vh;
  background-color: #f0f8ff;
  overflow: hidden;
}

.entire {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: flex-start;
  background-color: #f0f8ff;
  box-sizing: border-box;
  overflow: hidden;
}

/* Sidebar styling */
.sidebar {
  width: 80px;
  height: 100vh;
  background-color: #041528;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
}

.sidebar-brand h2 {
  color: #ffffff;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.sidebar-menu {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 0 10px;
  box-sizing: border-box;
}

.logout-btn {
  width: 100%;
  padding: 10px;
  background-color: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.logout-btn:hover {
  background-color: #ef4444;
  color: #ffffff;
}

.logout-btn .label {
  font-size: 0.75rem;
  font-weight: 600;
}

/* Main Container styling */
.container {
  width: calc(100vw - 80px);
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
}

header {
  width: 100%;
  max-width: 1200px;
  background: #ffffff;
  padding: 15px 25px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

header h1 {
  margin: 0;
  color: #041528;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

/* Quick Metrics */
.quickdata {
  width: 100%;
  max-width: 1200px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  box-sizing: border-box;
}

.box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.box h4 {
  margin: 0;
  font-size: 1.5rem;
  color: #0077B6;
  font-weight: 700;
}

.box p {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 500;
}

/* Cards Panels */
.card-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  box-sizing: border-box;
  width: 100%;
  max-width: 1200px;
}

.chart {
  width: 100%;
  max-width: 1200px;
  box-sizing: border-box;
}

.newone {
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
}

/* POS Owners Data Section */
.datas {
  width: 100%;
  max-width: 1200px;
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  flex-direction: column;
  gap: 15px;
  box-sizing: border-box;
  margin-bottom: 30px;
}

.datas-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;
  gap: 10px;
}

.datas h4 {
  margin: 0;
  color: #041528;
  font-size: 1.1rem;
  font-weight: 600;
}

.search-box-wrapper {
  width: 260px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  outline: none;
  background-color: #ffffff;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #0077B6;
  box-shadow: 0 0 0 2px rgba(0, 119, 182, 0.15);
}

.data-list-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 350px;
  overflow-y: auto;
}

.head-row {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 600;
  color: #64748b;
  font-size: 0.85rem;
}

.data1, .data {
  width: 100%;
  display: grid;
  grid-template-columns: 2fr 2fr 1.5fr 1.5fr 1.5fr;
  align-items: center;
  justify-items: start;
  box-sizing: border-box;
  gap: 10px;
}

.data {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s;
}

.data:hover {
  border-color: #0077B6;
}

.data p {
  margin: 0;
  font-size: 0.9rem;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-name {
  font-weight: 600;
  color: #041528 !important;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: #e0f2fe;
  color: #0369a1;
  text-transform: capitalize;
}

.terminate-btn {
  padding: 6px 14px;
  background-color: #ef4444;
  color: white;
  border-radius: 6px;
  border: none;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.terminate-btn:hover {
  background-color: #dc2626;
}

.empty-state {
  width: 100%;
  padding: 30px;
  text-align: center;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
}
</style>
