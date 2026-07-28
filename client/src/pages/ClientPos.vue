<template>
<div class="container">
  <header>
    <h3>Kinetic POS</h3>
  </header>

  <div class="work">
    <div class="work1" v-if="selected && number === 1">
      <ClientPage/>
    </div>
    <div class="work1" v-if="selected && number === 2">
      <PastOrders/>
    </div>
    <div class="work1" v-if="selected && number === 3">
      <QrBills/>
    </div>
    <div class="no" v-if="!selected">
      <div class="placeholder-card">
        <span class="placeholder-icon">📌</span>
        <p>No selected works yet</p>
        <span class="placeholder-sub">Select an option from the bottom menu below to get started</span>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="box" :class="{ active: number === 2 }" @click="selectNew(2)">
      <p class="box-icon">📩</p>
      <p class="box-label">Orders</p>
    </div>
    <div class="box" :class="{ active: number === 1 }" @click="selectNew(1)">
      <p class="box-icon">✍🏼</p>
      <p class="box-label">New</p>
    </div>
    <div class="box" :class="{ active: number === 3 }" @click="selectNew(3)">
      <p class="box-icon">⏳</p>
      <p class="box-label">Hold</p>
    </div>
    <!-- SETTINGS BOX -->
    <div class="box" @click="settingsOpen = true">
      <p class="box-icon">⚙️</p>
      <p class="box-label">Settings</p>
    </div>
    <div class="box logout-box" @click="logout()">
      <p class="box-icon">🚪</p>
      <p class="box-label">Logout</p>
    </div>
  </div>

  <!-- SETTINGS MODAL OVERLAY -->
  <div class="modal-overlay" v-if="settingsOpen" @click.self="settingsOpen = false">
    <div class="modal-content">
      <div class="modal-header">
        <h3>System Settings</h3>
        <button @click="settingsOpen = false" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="setting-item">
          <span class="setting-label">Push Notifications</span>
          <label class="switch">
            <input type="checkbox" v-model="notificationsPermitted" @change="toggleNotifications" />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ClientPage from '../components/ClientPage.vue';
import PastOrders from '../components/PastOrders.vue';
import { useRouter } from 'vue-router';
import QrBills from '../components/QrBills.vue';
import { link } from '../assets/Link.js';

const selected = ref(false)
const number = ref(0);
const router = useRouter()

const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId');

// Settings state
const settingsOpen = ref(false);
const notificationsPermitted = ref(true);
let socket = null;

onMounted(async () => {
  if(!Token){
    router.push('/auth');
  } else {
    try {
      const notifRes = await fetch(`${link}/notifications/settings`, {
        headers: { 'Authorization': `Bearer ${Token}`, 'shop-id': shopId }
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        notificationsPermitted.value = notifData.notifications_permitted;
      }
    } catch (err) {
      console.error("Failed to load notification settings", err);
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = link.replace(/^https?:\/\//, '').split('/')[0]; 
    socket = new WebSocket(`${wsProtocol}//${wsHost}?shopId=${shopId}`);

    socket.onopen = () => {
      console.log('🟢 Connected to POS live notification socket');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'NEW_ORDER') {
          if (notificationsPermitted.value && 'Notification' in window && Notification.permission === 'granted') {
            new Notification("New Order Received! 📩", {
              body: `New order #${data.billnum} has arrived.`
            });
          } else {
            alert(`New Order Received! Bill #${data.billnum}`);
          }
          window.dispatchEvent(new CustomEvent('refresh-orders', { detail: data.billnum }));
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    socket.onclose = () => {
      console.log('🔴 Disconnected from POS live notification socket');
    };
  }
})

onUnmounted(() => {
  if (socket) {
    socket.close();
  }
})

async function toggleNotifications() {
  if (notificationsPermitted.value && 'Notification' in window) {
    if (Notification.permission === 'denied') {
      alert("Notifications are disabled in your device settings. You can enable them anytime in your tablet's app settings.");
    } else if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        notificationsPermitted.value = false;
        return;
      }
    }
  }

  try {
    const res = await fetch(`${link}/notifications/settings`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${Token}`,
        'Content-Type': 'application/json',
        'shop-id': shopId
      },
      body: JSON.stringify({ permitted: notificationsPermitted.value })
    });

    if (!res.ok) throw new Error("Failed to save preference");
  } catch (err) {
    console.error("Error updating notifications:", err);
    alert("Could not update notification setting.");
    notificationsPermitted.value = !notificationsPermitted.value;
  }
}

function logout(){
  sessionStorage.removeItem('userToken');
  sessionStorage.removeItem('shopId');
  router.push('/auth');
}

function selectNew(a){
  if(number.value === a){
    selected.value = false;
    number.value = 0;
  } else {
    selected.value = true;
    number.value = a;
  }
}
</script>

<style scoped>
html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #f0f8ff;
}

.container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: start;
  margin: 0;
  background-color: #f0f8ff;
  overflow: hidden;
  box-sizing: border-box;
}

header {
  width: 100%;
  background-color: #041528;
  height: 60px;
  flex-shrink: 0;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

header h3 {
  color: #ffffff;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.work {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f8ff;
  box-sizing: border-box;
  padding: 15px;
  overflow: hidden;
}

.work1 {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  box-sizing: border-box;
}

.no {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.placeholder-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 30px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 350px;
}

.placeholder-icon {
  font-size: 2rem;
  margin-bottom: 5px;
}

.placeholder-card p {
  color: #1e293b;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.placeholder-sub {
  color: #64748b;
  font-size: 0.85rem;
  margin: 0;
}

.foot {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-evenly;
  overflow-x: auto;
  overflow-y: hidden;
  width: 100%;
  height: 90px;
  flex-shrink: 0;
  background-color: #ffffff;
  border-top: 1px solid #e2e8f0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.03);
  scrollbar-width: none;
  box-sizing: border-box;
  padding: 0 10px;
}
.foot::-webkit-scrollbar { display: none; }

.box {
  height: 70px;
  width: 85px;
  flex-shrink: 0;
  background-color: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 2px;
}

.box-icon {
  font-size: 1.2rem;
  margin: 0;
}

.box-label {
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0;
}

.box:hover {
  background-color: rgba(0, 119, 182, 0.08);
  border-color: #0077B6;
}
.box:hover .box-label {
  color: #0077B6;
}

.box.active {
  background-color: #0077B6;
  border-color: #0077B6;
  box-shadow: 0 2px 6px rgba(0, 119, 182, 0.3);
}
.box.active .box-label,
.box.active .box-icon { 
  color: white;
}

.logout-box:hover {
  background-color: rgba(239, 68, 68, 0.08);
  border-color: #ef4444;
}
.logout-box:hover .box-label {
  color: #ef4444;
}

/* Modal CSS */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  width: 90%;
  max-width: 450px;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.modal-header h3 {
  color: #041528;
  margin: 0;
  font-size: 1.1rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #333;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 60vh;
  overflow-y: auto;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  background: #f9f9f9;
  border-radius: 8px;
  border: 1px solid #eee;
}

.setting-label {
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

/* Switch toggle styling */
.switch {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 24px;
}
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #ccc;
  transition: .3s;
  border-radius: 24px;
}
.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}
input:checked + .slider { background-color: #0077B6; }
input:checked + .slider:before { transform: translateX(22px); }

@media print {
  .pos-footer, .close-btn, .print-button, nav, footer, .foot {
    display: none !important;
  }
  html, body {
    height: auto !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body > *:not(.billing) {
    display: none !important;
  }
  .billing {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
  }
  @page {
    size: auto;
    margin: 0mm;
  }
}
</style>
