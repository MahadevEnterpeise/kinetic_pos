<template>
<div class="owner">

<!-- Mobile Menu Overlay Background -->
<div class="sidebar-overlay" v-if="mobileMenuOpen" @click="mobileMenuOpen = false"></div>

<!-- Sidebar Navigation -->
<aside :class="['sidebar', { 'mobile-open': mobileMenuOpen }]">
<div class="sidebar-header">
<h2>Kinetic POS (Manager)</h2>
<button class="close-menu-btn" @click="mobileMenuOpen = false">&times;</button>
</div>
<div class="tools">
<a href="#dashboard" class="tool" @click="mobileMenuOpen = false">📊 Dashboard</a>
<a href="#staff" class="tool" @click="mobileMenuOpen = false">🏢 Management</a>
<a href="#customer" class="tool" @click="mobileMenuOpen = false">👥 Customer</a>
<a href="#update" class="tool" @click="mobileMenuOpen = false">📦 Update</a>
<a href="#qr" class="tool" @click="mobileMenuOpen = false">🔲 QR Generator</a>
</div>
<div class="sidebar-footer">
<button @click="logout" id="log-btn">Log Out</button>
</div>
</aside>

<!-- Main Container -->
<div class="owner_cont">
<header id="dashboard">
<div class="header-left">
<button class="menu-toggle-btn" @click="mobileMenuOpen = true">☰</button>
<h3>Welcome, <span class="shop-name">{{ data.shop || 'Store' }}</span> (Manager)</h3>
</div>
<div class="extrahead" @click="settingsOpen = true" title="System Settings">⚙️</div>
</header>

<!-- Quick Metrics Cards -->
<div class="quickdata">
<div class="box">
<p>Today Sales</p>
<h3 class="metric-primary">{{ Number(data.sales || 0).toFixed(2) }} {{ currency }}</h3>
</div>
<div class="box">
<p>Sell Count</p>
<h3 class="metric-dark">{{ data.count || 0 }}</h3>
</div>
<div class="box">
<p>Today Charge (1.1%)</p>
<h3 class="metric-primary">{{ Number(data.sales * (1.1 / 100) || 0).toFixed(2) }} {{ currency }}</h3>
</div>
</div>

<!-- Chart Section -->
<div class="sale_chart card-panel">
<LineChart />
</div>

<!-- Extradata Section: Logs & Trends -->
<div class="extradata">
<div class="logs card-panel">
<h5>Recent Logs</h5>
<div class="logdata">
<div class="loghead">
<div class="n">Mobile</div>
<div class="d">Date/Time</div>
<div class="p">Price</div>
<div class="b">Bill</div>
</div>
<div v-if="bills.length === 0" class="empty-text">No recent bills found</div>
<div class="log" v-for="d in bills" :key="d.billnum">
<div class="n">{{ d.mobile || 'N/A' }}</div>
<div class="d">{{ d.time }}</div>
<div class="p">{{ Number(d.price || 0).toFixed(2) }} LKR</div>
<div class="b font-mono">{{ d.billnum }}</div>
</div>
</div>
</div>

<div class="trends card-panel">
<h5>Recent Trends</h5>
<ol class="trend-list">
<li v-if="trends.length === 0" class="empty-text">No trends available</li>
<li v-for="(t, idx) in trends" :key="idx">{{ t.name }}</li>
</ol>
</div>
</div>

<!-- Feature Sections -->
<div id="update" class="section-block">
<InventoryManager :staffName="managerName" actorRole="manager" />
</div>

<div id="customer" class="section-block">
<CustomerComponent />
</div>

<!-- Management Section: Full-Width Vertical Column Stack -->
<div id="staff" class="section-block management-container">
<hr class="divider" />
<h1 class="section-title">Management</h1>
<div class="management-stack">
<div class="management-card card-panel">
<h3>Register POS / Staff</h3>
<div class="component-slot">
<RegisterPos />
</div>
</div>
</div>
</div>

<div id="qr" class="section-block">
<QrComponent />
</div>

</div>

<!-- Settings Modal Overlay -->
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
import LineChart from '../components/LineChart.vue';
import CustomerComponent from '../components/CustomerComponent.vue';
import QrComponent from '../components/QrComponent.vue';
import { link } from '../assets/Link.js';
import { useRouter } from 'vue-router';
import { onMounted, ref, nextTick } from 'vue';
import RegisterPos from '../components/RegisterPos.vue';
import InventoryManager from '../components/InventoryManager.vue';

const router = useRouter();
const Token = ref('');
const shopId = ref('');
const currency = ref('');
const data = ref({});
const bills = ref([]);
const trends = ref([]);
const managerName = ref('Manager');

// UI Control states
const mobileMenuOpen = ref(false);
const settingsOpen = ref(false);
const notificationsPermitted = ref(true);

onMounted(async () => {
Token.value = sessionStorage.getItem('userToken');
shopId.value = sessionStorage.getItem('shopId');
managerName.value = sessionStorage.getItem('userName') || 'Manager';

if (!Token.value) {
router.push('/');
return;
}

try {
const response = await fetch(`${link}/owner`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ user: Token.value, shopId: shopId.value })
});

if (!response.ok) {
throw new Error('Authentication failed');
}

data.value = await response.json();
bills.value = data.value.bills || [];
trends.value = data.value.trends || [];
currency.value = data.value.currency;

const notifRes = await fetch(`${link}/notifications/settings`, {
headers: { 'Authorization': `Bearer ${Token.value}`, 'shop-id': shopId.value }
});
if (notifRes.ok) {
const notifData = await notifRes.json();
notificationsPermitted.value = notifData.notifications_permitted;
}

} catch (error) {
console.error("Error fetching data:", error);
}

await nextTick();
setupScrollAnimation();
});

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
'Authorization': `Bearer ${Token.value || Token}`,
'Content-Type': 'application/json',
'shop-id': shopId.value || shopId
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

function setupScrollAnimation() {
const staffSection = document.querySelector('#staff');
const dashboardsection = document.querySelector('#dashboard');
if (!staffSection) return;

const observer = new IntersectionObserver((entries) => {
entries.forEach(entry => {
if (entry.isIntersecting) {
entry.target.classList.add('visible');
observer.unobserve(entry.target);
}
});
}, { threshold: 0.1 });

observer.observe(staffSection);
if (dashboardsection) observer.observe(dashboardsection);
}

function logout() {
sessionStorage.removeItem('userToken');
sessionStorage.removeItem('shopId');
sessionStorage.removeItem('userName');
router.push('/');
}
</script>

<style scoped>
html {
scroll-behavior: smooth;
overflow: hidden;
height: 100vh;
}

body {
margin: 0;
padding: 0;
overflow: hidden;
height: 100vh;
}

.owner {
width: 100vw;
height: 100vh;
display: flex;
flex-direction: row;
background-color: #f0f8ff;
overflow: hidden;
box-sizing: border-box;
}

/* Sidebar Styling */
.sidebar {
width: 260px;
height: 100vh;
background-color: #041528;
display: flex;
flex-direction: column;
justify-content: space-between;
flex-shrink: 0;
transition: transform 0.3s ease-in-out;
z-index: 100;
}

.sidebar-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 20px;
color: #ffffff;
border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-header h2 {
font-size: 1.2rem;
margin: 0;
}

.close-menu-btn {
display: none;
background: none;
border: none;
color: #fff;
font-size: 1.5rem;
cursor: pointer;
}

.tools {
padding: 20px 15px;
display: flex;
flex-direction: column;
gap: 12px;
overflow-y: auto;
flex-grow: 1;
}

.tool {
padding: 12px 16px;
color: #E4E7EB;
text-decoration: none;
border-radius: 8px;
font-weight: 500;
transition: background 0.2s, color 0.2s;
}

.tool:hover {
background-color: rgba(0, 119, 182, 0.2);
color: #ffffff;
}

.sidebar-footer {
padding: 20px;
border-top: 1px solid rgba(255, 255, 255, 0.1);
}

#log-btn {
width: 100%;
padding: 10px;
border-radius: 8px;
border: none;
background-color: #ef4444;
color: white;
font-weight: 600;
cursor: pointer;
transition: background 0.2s;
}

#log-btn:hover {
background-color: #dc2626;
}

/* Owner Content Panel */
.owner_cont {
flex-grow: 1;
height: 100vh;
overflow-y: auto;
overflow-x: hidden;
display: flex;
flex-direction: column;
align-items: center;
padding: 20px;
box-sizing: border-box;
gap: 20px;
-webkit-overflow-scrolling: touch;
}

header {
width: 100%;
max-width: 1200px;
display: flex;
flex-direction: row;
align-items: center;
justify-content: space-between;
background: #ffffff;
padding: 15px 25px;
border-radius: 12px;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.header-left {
display: flex;
align-items: center;
gap: 15px;
}

.menu-toggle-btn {
display: none;
background: none;
border: none;
font-size: 1.5rem;
cursor: pointer;
color: #041528;
}

.shop-name {
color: #0077B6;
}

.extrahead {
font-size: 1.2rem;
cursor: pointer;
padding: 6px;
border-radius: 50%;
transition: background 0.2s;
}

.extrahead:hover {
background-color: #f1f5f9;
}

/* Quick Metrics Cards */
.quickdata {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
gap: 20px;
width: 100%;
max-width: 1200px;
}

.box {
background: #ffffff;
display: flex;
align-items: center;
justify-content: center;
flex-direction: column;
border: 1px solid #e2e8f0;
border-radius: 12px;
padding: 20px;
box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
gap: 8px;
}

.box p {
margin: 0;
color: #64748b;
font-size: 0.9rem;
font-weight: 500;
}

.box h3 {
margin: 0;
font-size: 1.5rem;
}

.metric-primary {
color: #0077B6;
}

.metric-dark {
color: #041528;
}

/* Cards Panels */
.card-panel {
background: #ffffff;
border: 1px solid #e2e8f0;
border-radius: 12px;
padding: 20px;
box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
box-sizing: border-box;
}

.sale_chart {
width: 100%;
max-width: 1200px;
box-sizing: border-box;
}

.extradata {
width: 100%;
max-width: 1200px;
display: flex;
flex-direction: row;
gap: 20px;
}

.logs {
flex: 2;
display: flex;
flex-direction: column;
}

.logs h5, .trends h5 {
margin-top: 0;
margin-bottom: 12px;
color: #1e293b;
font-size: 1rem;
}

.logdata {
width: 100%;
max-height: 220px;
overflow-y: auto;
}

.loghead, .log {
display: flex;
flex-direction: row;
align-items: center;
justify-content: space-between;
padding: 8px 4px;
font-size: 0.85rem;
}

.loghead {
border-bottom: 2px solid #e2e8f0;
font-weight: 600;
color: #64748b;
}

.log {
border-bottom: 1px solid #f1f5f9;
color: #334155;
}

.n { width: 22%; }
.d { width: 30%; color: #64748b; }
.p { width: 22%; text-align: right; }
.b { width: 26%; text-align: right; }

.trends {
flex: 1;
display: flex;
flex-direction: column;
}

.trend-list {
margin: 0;
padding-left: 20px;
color: #334155;
font-size: 0.9rem;
display: flex;
flex-direction: column;
gap: 8px;
}

.empty-text {
padding: 20px;
text-align: center;
color: #94a3b8;
font-size: 0.85rem;
}

.font-mono {
font-family: monospace;
}

/* Management Layout */
.management-container {
width: 100%;
max-width: 1200px;
}

.management-stack {
display: flex;
flex-direction: column;
gap: 20px;
width: 100%;
}

.management-card {
display: flex;
flex-direction: column;
gap: 15px;
width: 100%;
box-sizing: border-box;
}

.management-card h3 {
margin: 0;
font-size: 1.1rem;
color: #041528;
border-bottom: 1px solid #f1f5f9;
padding-bottom: 8px;
}

.component-slot {
width: 100%;
display: flex;
flex-direction: column;
box-sizing: border-box;
}

.component-slot :deep(*) {
max-width: 100% !important;
box-sizing: border-box !important;
}

.component-slot :deep(div),
.component-slot :deep(form),
.component-slot :deep(section) {
display: flex !important;
flex-direction: column !important;
width: 100% !important;
}

.section-block {
width: 100%;
max-width: 1200px;
}

#staff, #dashboard {
opacity: 0;
transform: translateY(30px);
transition: opacity 0.5s ease, transform 0.5s ease;
}

#staff.visible, #dashboard.visible {
opacity: 1;
transform: translateY(0);
}

.divider {
border: none;
border-top: 1px solid #cbd5e1;
margin: 20px 0;
width: 100%;
}

.section-title {
font-size: 1.5rem;
color: #041528;
margin-bottom: 15px;
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

.sidebar-overlay {
display: none;
}

@media (max-width: 900px) {
.sidebar {
position: fixed;
top: 0;
left: -260px;
height: 100%;
box-shadow: 2px 0 10px rgba(0,0,0,0.2);
}

.sidebar.mobile-open {
transform: translateX(260px);
}

.sidebar-overlay {
display: block;
position: fixed;
top: 0; left: 0; width: 100vw; height: 100vh;
background: rgba(0,0,0,0.4);
z-index: 99;
}

.close-menu-btn {
display: block;
}

.menu-toggle-btn {
display: block;
}

.extradata {
flex-direction: column;
}

.logs, .trends {
width: 100%;
}
}
</style>
