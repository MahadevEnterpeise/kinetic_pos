<style scoped>
.toggle-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  width: 100%;
  max-width: 400px;
}

.toggle-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
}

/* Switch styling */
.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 26px;
}

.switch input { 
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #ccc;
  transition: .3s;
  border-radius: 26px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #0077B6;
}

input:checked + .slider:before {
  transform: translateX(24px);
}
</style>

<template>
  <div class="toggle-container">
    <span class="toggle-label">Push Notifications</span>
    <label class="switch">
      <input type="checkbox" v-model="notificationsPermitted" @change="toggleNotifications" />
      <span class="slider"></span>
    </label>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { link } from '../assets/Link';

const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId');
const notificationsPermitted = ref(true);

// Fetch current setting from DB on mount
onMounted(async () => {
  try {
    const res = await fetch(`${link}/notifications/settings`, {
      headers: { 'Authorization': `Bearer ${Token}`, 'shop-id': shopId }
    });
    if (res.ok) {
      const data = await res.json();
      notificationsPermitted.value = data.notifications_permitted;
    }
  } catch (err) {
    console.error("Failed to fetch notification preference", err);
  }
});

// Update database & browser permission on toggle change
async function toggleNotifications() {
  if (notificationsPermitted.value && 'Notification' in window) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert("Browser notification permission was denied.");
      notificationsPermitted.value = false;
      return;
    }
  }

  try {
    const res = await fetch(`${link}/notifications/settings`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${Token}`, // Fixed: Removed .value
        'Content-Type': 'application/json',
        'shop-id': shopId // Fixed: Removed .value
      },
      body: JSON.stringify({ permitted: notificationsPermitted.value })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with status ${res.status}`);
    }
  } catch (err) {
    console.error("Error updating notifications:", err);
    alert(`Could not update setting: ${err.message}`);
    notificationsPermitted.value = !notificationsPermitted.value;
  }
}
</script>

