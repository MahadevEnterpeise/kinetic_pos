<template>
<div class="container">
<header>
<h1>{{ shopName || 'Loading...' }}</h1>
<div class="header-right-actions">
<!-- Customer Audit Log / Notification Bell -->
<div class="extrahead notification-bell" @click="toggleAuditDrawer" title="Order Activity & Notifications">
🔔 <span v-if="unreadAuditCount > 0" class="badge">{{ unreadAuditCount }}</span>
</div>
<div class="extrahead settings-btn" @click="settingsOpen = true" title="System Settings">
⚙️
</div>
</div>
</header>

<div class="bills">
<template v-if="bills.length > 0">
<div class="bill" v-for="(b, idx) in bills" :key="b.number || idx">
<p>{{ b.number }}</p>
<p>{{ b.date }}</p>
<p>{{ b.status }}</p>
</div>
</template>
<p v-else id="raw">Your bills will be shown up here</p>
</div>

<div v-if="loading" class="loader">Loading menu...</div>

<div class="foods" v-else>
<div class="search">
<input v-model="query" placeholder="Search food here"/>
</div>

<div class="food">
<div 
class="item" 
v-for="i in filteredItems" 
:key="i.itemid || i.id" 
@click="added(i)"
>
<div class="data">
<h5>{{ i.name }}</h5>
<p>{{ i.price }} {{ currency }}</p>
<p>Stock: {{ i.stock }}</p>
</div>
</div>
<h5 id="no" v-if="filteredItems.length === 0">*No items found</h5>
</div>

<div class="added">
<ol>
<li class="add_items" v-for="(t, idx) in addeditems" :key="idx" @click="remove(idx)">
{{ t.name }} - {{ t.qty }} - {{ Number(t.totalprice).toFixed(2) }}
</li>
</ol>
</div>
<button id="ord_plc_btn" @click="sendandmake()" :disabled="clicked">
{{ clicked ? 'Processing...' : 'Place the order' }}
</button>
</div>

<div class="compliment">
<form @submit.prevent="submitFeedback">
<div class="input-group">
<label>Mobile Number</label>
<input type="tel" placeholder="Mobile number" v-model="mobile" required/>
</div>
<div class="input-group">
<label>Info</label>
<input type="text" placeholder="Say about us" v-model="info" required/>
</div>
<div class="input-group">
<label>Feedback Type</label>
<select v-model="feedbackType" required>
<option value="Complaint">Complaint</option>
<option value="Suggestion">Suggestion</option>
</select>
</div>
<button type="submit">Submit</button>
</form>
</div>

<footer>
<button @click="logout()">Logout Me</button>
</footer>

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

<!-- Customer Activity & Order Status Drawer Panel -->
<div class="drawer-overlay" v-if="auditDrawerOpen" @click="auditDrawerOpen = false"></div>
<div :class="['audit-drawer', { 'drawer-open': auditDrawerOpen }]">
<div class="drawer-header">
<h3>Order Updates & Activity</h3>
<button @click="auditDrawerOpen = false" class="close-btn">&times;</button>
</div>
<div class="drawer-body">
<div v-if="auditLogs.length === 0" class="empty-text">No order updates yet</div>
<div class="audit-item" v-for="log in auditLogs" :key="log.id">
<div class="audit-top">
<span class="audit-date">{{ log.created_at }}</span>
</div>
<div class="audit-title"><strong>{{ log.action_type }}</strong></div>
<div class="audit-details">{{ log.details }}</div>
</div>
</div>
</div>

</div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { link } from '../assets/Link';

const route = useRoute();
const router = useRouter();
const shopdefined = "D2574ckznL53";
const shopId = ref(route.params.shopId || shopdefined);

const shopName = ref('');
const currency = ref('');
const fooditems = ref([]);
const query = ref('');
const loading = ref(true);
const Token = ref(sessionStorage.getItem('userToken') || '');

// Settings state
const settingsOpen = ref(false);
const notificationsPermitted = ref(true);

// Audit Drawer state for customer
const auditDrawerOpen = ref(false);
const auditLogs = ref([]);
const unreadAuditCount = ref(0);

// --- Cart System ---
const addeditems = ref([]);

// --- Feedback form ---
const mobile = ref('');
const info = ref('');
const feedbackType = ref('Suggestion');
const clicked = ref(false);
const bills = ref([]);

let socket = null;

onMounted(async () => {
try {
const response = await fetch(`${link}/order/${shopId.value}`, {
method: 'GET',
headers: { 'Content-Type': 'application/json' }
});
if (!response.ok) throw new Error('Failed to load menu: ' + response.status);
const data = await response.json();
shopName.value = data.shopName || 'Demo Shop';
currency.value = data.currency || 'LKR';
fooditems.value = data.items || [];
bills.value = data.bills || [];

if (Token.value) {
const notifRes = await fetch(`${link}/notifications/settings`, {
headers: { 'Authorization': `Bearer ${Token.value}`, 'shop-id': shopId.value }
});
if (notifRes.ok) {
const notifData = await notifRes.json();
notificationsPermitted.value = notifData.notifications_permitted;
}
}

// Initialize Native WebSocket Connection for Live Stock Sync & Order Alerts
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = link.replace(/^https?:\/\//, '').split('/')[0]; 
socket = new WebSocket(`${wsProtocol}//${wsHost}?shopId=${shopId.value}`);

socket.onopen = () => {
console.log('🟢 Connected to customer menu live socket');
};

socket.onmessage = (event) => {
try {
const data = JSON.parse(event.data);
if (data.type === 'STOCK_UPDATE' && data.items) {
fooditems.value = data.items.categories ? data.items.categories.flatMap(c => c.items) : data.items;
} else if (data.type === 'AUDIT_ALERT') {
// Filter or capture only order acceptance / rejection updates for customers
if (data.title && (data.title.includes('QR Order') || data.title.includes('Accepted') || data.title.includes('Rejected'))) {
unreadAuditCount.value++;
auditLogs.value.unshift({
id: Date.now(),
action_type: data.title,
details: data.details,
created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
});

if (notificationsPermitted.value && 'Notification' in window && Notification.permission === 'granted') {
new Notification(data.title, { body: data.details });
}
}
}
} catch (e) {
console.error('Error parsing WS message', e);
}
};

socket.onclose = () => {
console.log('🔴 Disconnected from customer menu live socket');
};

} catch (err) {
console.error('Full error:', err);
} finally {
loading.value = false;
}
});

onUnmounted(() => {
if (socket) {
socket.close();
}
});

function toggleAuditDrawer() {
auditDrawerOpen.value = !auditDrawerOpen.value;
if (auditDrawerOpen.value) {
unreadAuditCount.value = 0; // Reset counter when drawer opens
}
}

async function toggleNotifications() {
if (notificationsPermitted.value && 'Notification' in window) {
if (Notification.permission === 'denied') {
alert("Notifications are disabled in your device settings.");
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
'Authorization': `Bearer ${Token.value}`,
'Content-Type': 'application/json',
'shop-id': shopId.value
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

// Search functionality
const filteredItems = computed(() => {
if (!query.value.trim()) return fooditems.value;
return fooditems.value.filter(i =>
i.name.toLowerCase().includes(query.value.toLowerCase())
);
});

// --- Cart Operations ---
const added = (item) => {
const targetFood = fooditems.value.find(i => (i.itemid || i.id) === (item.itemid || item.id));
if (!targetFood || targetFood.stock <= 0) {
alert("Sorry, this item is out of stock!");
return;
}
targetFood.stock--;

const cartItem = addeditems.value.find(i => i.id === (item.itemid || item.id));
const unitPrice = Number(item.price) || 0;

if (cartItem) {
cartItem.qty++;
cartItem.totalprice = cartItem.qty * unitPrice;
} else {
addeditems.value.push({
id: item.itemid || item.id,
itemid: item.itemid || item.id,
name: item.name,
qty: 1,
totalprice: unitPrice,
price: unitPrice,
unitPrice: unitPrice
});
}
};

const remove = (idx) => {
const itemInCart = addeditems.value[idx];
const targetFood = fooditems.value.find(i => (i.itemid || i.id) === itemInCart.id);
if (targetFood) targetFood.stock++;

if (itemInCart.qty > 1) {
itemInCart.qty--;
itemInCart.totalprice = itemInCart.qty * itemInCart.unitPrice;
} else {
addeditems.value.splice(idx, 1);
}
};

// --- API Submissions ---
async function submitFeedback() {
try {
const response = await fetch(`${link}/addreview`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
user: 'customer_' + mobile.value,
shopId: shopId.value,
type: feedbackType.value,
message: info.value
})
});
if (!response.ok) throw new Error('Submit failed');
alert('Thank you! Feedback submitted');
mobile.value = '';
info.value = '';
} catch (err) {
alert('Error: ' + err.message);
}
}

async function sendandmake() {
if (addeditems.value.length === 0) {
alert('Your cart is empty!');
return;
}
if (clicked.value) return;

clicked.value = true;
try {
const response = await fetch(`${link}/bills`, {
method: 'POST',
headers: { 
'Content-Type': 'application/json',
'Authorization': Token.value ? `Bearer ${Token.value}` : '',
'shop-id': shopId.value
},
body: JSON.stringify({ 
shopId: shopId.value, 
status: 'pending',
items: addeditems.value.map(i => ({
itemid: i.id,
name: i.name,
qty: i.qty,
price: i.unitPrice
}))
})
});

if (!response.ok) throw new Error('Error while placing order');
const data = await response.json();
alert('Order placed successfully! Bill No: ' + (data.billnum || ''));
addeditems.value = [];
} catch (err) {
alert(err.message);
} finally {
clicked.value = false;
}
}

function logout() {
sessionStorage.removeItem('userToken');
sessionStorage.removeItem('shopId');
router.push('/');
}
</script>

<style scoped>
.container {
width: 100%;
min-height: 100vh;
display: flex;
flex-direction: column;
align-items: center;
background-color: #f8f9fa;
gap: 30px;
padding-bottom: 50px;
position: relative;
}

header {
width: 100%;
padding: 15px 20px;
background: linear-gradient(135deg, #0062ff, #00c6ff);
box-shadow: 0 2px 10px rgba(0,0,0,0.1);
text-align: center;
position: relative;
display: flex;
align-items: center;
justify-content: center;
box-sizing: border-box;
}

.header-right-actions {
position: absolute;
right: 20px;
display: flex;
align-items: center;
gap: 15px;
}

.extrahead {
font-size: 1.3rem;
cursor: pointer;
padding: 6px;
border-radius: 50%;
transition: background 0.2s;
position: relative;
background: rgba(255, 255, 255, 0.2);
display: flex;
align-items: center;
justify-content: center;
}

.extrahead:hover {
background-color: rgba(255, 255, 255, 0.3);
}

.notification-bell {
display: flex;
align-items: center;
justify-content: center;
}

.badge {
position: absolute;
top: -5px;
right: -5px;
background-color: #ef4444;
color: white;
font-size: 0.65rem;
padding: 2px 5px;
border-radius: 50%;
font-weight: bold;
}

h1 {
font-family: 'Inter', sans-serif;
font-weight: 700;
color: white;
margin: 0;
letter-spacing: 1px;
}

.foods {
width: 95%;
max-width: 600px;
background: white;
box-shadow: 0 4px 20px rgba(0, 123, 255, 0.15);
border-radius: 20px;
padding: 20px;
max-height: 400px;
overflow-y: auto;
}

.food {
width: 100%;
display: flex;
flex-direction: row;
flex-wrap: wrap;
align-items: start;
justify-content: flex-start;
gap: 10px;
}

.search {
position: sticky;
top: 0;
background: white;
padding-bottom: 15px;
z-index: 10;
}

input, select {
width: 100%;
box-sizing: border-box;
padding: 12px 20px;
border: 2px solid #e1e1e1;
border-radius: 12px;
outline: none;
transition: 0.3s;
}

input:focus {
border-color: #007bff;
}

.item {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 4px;
padding: 8px;
height: 100px;
width: 100px;
border-radius: 12px;
border: 1px solid #0062ff;
cursor: pointer;
background: white;
}

.data h5 {
margin: 0;
color: #2d3436;
font-size: 0.9rem;
text-align: center;
}

.data p {
margin: 2px 0;
font-size: 0.8rem;
color: #636e72;
text-align: center;
}

.compliment {
width: 95%;
max-width: 600px;
background: white;
padding: 25px;
border-radius: 20px;
box-shadow: 0 4px 20px rgba(0, 123, 255, 0.15);
}

form {
display: flex;
flex-direction: column;
gap: 15px;
}

.input-group {
display: flex;
flex-direction: column;
gap: 5px;
}

label {
font-weight: 600;
font-size: 0.85rem;
color: #636e72;
text-transform: uppercase;
}

button {
background: #007bff;
color: white;
padding: 15px;
border: none;
border-radius: 12px;
font-weight: bold;
cursor: pointer;
margin-top: 10px;
}

#no {
color: gray;
text-align: center;
padding: 20px;
width: 100%;
}

.loader {
text-align: center;
padding: 40px;
color: #007bff;
}

.added {
height: 100px;
width: 100%;
overflow-y: scroll;
margin-top: 10px;
}

#ord_plc_btn {
width: 100%;
background-color: #0062ff;
border: none;
border-radius: 999px;
}

.bills {
height: 100px;
width: 90%;
overflow-y: scroll;
display: flex;
flex-direction: column;
align-items: center;
justify-content: start;
border: 2px dashed #2d3436;
border-radius: 12px;
background: white;
}

.bill {
display: flex;
flex-direction: row;
align-items: center;
justify-content: space-evenly;
width: 100%;
padding: 10px;
border-bottom: 1px solid #eee;
}

#raw {
color: gray;
margin: auto;
}

footer button {
background: #636e72;
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

/* Customer Audit Drawer Styles */
.drawer-overlay {
position: fixed;
top: 0; left: 0; width: 100vw; height: 100vh;
background: rgba(0, 0, 0, 0.4);
z-index: 1000;
}

.audit-drawer {
position: fixed;
top: 0;
right: -400px;
width: 380px;
height: 100vh;
background: white;
box-shadow: -4px 0 15px rgba(0,0,0,0.15);
z-index: 1001;
display: flex;
flex-direction: column;
transition: right 0.3s ease-in-out;
}

.audit-drawer.drawer-open {
right: 0;
}

.drawer-header {
padding: 20px;
display: flex;
align-items: center;
justify-content: space-between;
border-bottom: 1px solid #e2e8f0;
background: #0062ff;
color: white;
}

.drawer-header h3 {
margin: 0;
font-size: 1.1rem;
}

.drawer-header .close-btn {
color: white;
}

.drawer-body {
flex-grow: 1;
overflow-y: auto;
padding: 15px;
display: flex;
flex-direction: column;
gap: 12px;
background: #f8fafc;
}

.audit-item {
background: white;
padding: 12px;
border-radius: 8px;
border: 1px solid #e2e8f0;
display: flex;
flex-direction: column;
gap: 4px;
box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.audit-top {
display: flex;
justify-content: flex-end;
font-size: 0.75rem;
color: #64748b;
}

.audit-title {
font-size: 0.9rem;
color: #1e293b;
}

.audit-details {
font-size: 0.85rem;
color: #475569;
}

@media (max-width: 900px) {
.audit-drawer {
width: 100%;
right: -100%;
}
}
</style>
