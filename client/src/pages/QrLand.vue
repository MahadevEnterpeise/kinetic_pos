<template>
<div class="client-wrapper" v-if="!billshow">

<!-- LEFT PANE: PENDING LIST -->
<div class="pending-pane">
<div class="head">
Pending Orders <span v-if="isOffline" class="offline-badge">🔌 Offline</span>
</div>

<div class="pending-list">
<div v-if="loading" class="empty">Loading...</div>
<div v-else-if="pendingOrders.length === 0" class="empty">
<span class="empty-icon">📭</span>
<p>No pending orders</p>
</div>

<div
v-for="o in pendingOrders"
:key="o.id"
class="pending-card"
:class="{ active: selectedOrder?.id === o.id }"
@click="loadPending(o)"
>
<div class="card-top-row">
<span class="order-id">#{{ o.id }}</span>
<span class="order-total">{{ Number(o.total || 0).toFixed(2) }} {{ currency }}</span>
</div>

<div class="card-mid-row">
<span class="customer-name">{{ o.customer || 'Walk-in Customer' }}</span>
</div>

<div class="card-bot-row">
<span class="muted">{{ o.items ? o.items.length : 0 }} items</span>
<span class="muted">{{ formatDate(o.date) }}</span>
</div>
</div>
</div>
</div>

<!-- RIGHT PANE: BILL SECTOR -->
<div class="client-bill">
<div class="bill-header">
<h1 id="h1">Bill #{{ selectedOrder?.id || '--' }}</h1>
</div>

<div class="heads">
<h3 id="n">Name</h3>
<h3 id="q">Qty</h3>
<h3 id="p">Price</h3>
</div>

<div class="bills">
<div v-if="selectedItems.length === 0" class="empty">
<span class="empty-icon">🧾</span>
<p>Select a pending order</p>
</div>

<div 
class="bdata" 
v-for="i in selectedItems" 
:key="i.id" 
@click="remove(i.id)" 
title="Click to remove item"
>
<p class="n">{{ i.name }}</p>
<p class="q">{{ i.qty }}</p>
<p class="p">{{ Number(i.price || 0).toFixed(2) }}</p>
</div>
</div>

<div class="last">
<span id="subtotal">
<p>Sub Total</p>
<p>{{ Number(subtotal || 0).toFixed(2) }} {{ currency }}</p>
</span>

<span id="service" class="input-span">
<p>Service charge %</p>
<input type="number" v-model.number="sc" min="0" />
</span>

<span id="discount" class="input-span">
<p>Discount %</p>
<input type="number" v-model.number="rc" min="0" />
</span>

<span id="total" class="total-span">
<p>Total</p>
<p>{{ Number(total || 0).toFixed(2) }} {{ currency }}</p>
</span>

<div class="action-buttons">
<button class="reject-btn" @click="reject" :disabled="saving">Reject</button>
<button class="pay-btn" @click="bill" :disabled="saving">{{ buttonText }}</button>
</div>
</div>
</div>

</div>
</template>

<script setup>
import { onMounted, ref, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { link, printReceipt } from '../assets/Link';

const router = useRouter();
const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId') || sessionStorage.getItem('shopid');
const clientUid = Token;

const pendingOrders = ref([]);
const selectedOrder = ref(null);
const loading = ref(true);
const currency = ref('LKR');
const buttonText = ref('Save & Pay');
const selectedItems = ref([]);
const sc = ref(0);
const rc = ref(0);
const billshow = ref(false);
const saving = ref(false);
const isOffline = ref(!navigator.onLine);

// --- INDEXEDDB SETUP & HELPERS ---
const DB_NAME = 'KineticPOS_Pending_Local';
const DB_VERSION = 1;

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending_cache')) {
        db.createObjectStore('pending_cache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_actions')) {
        db.createObjectStore('offline_actions', { keyPath: 'tempId', autoIncrement: true });
      }
    };
  });
}

async function cachePendingOrders(orders) {
  try {
    const db = await openLocalDb();
    const tx = db.transaction(['pending_cache'], 'readwrite');
    const store = tx.objectStore('pending_cache');
    store.clear();
    orders.forEach(order => store.put(order));
  } catch (err) {
    console.error('Failed to cache pending orders locally:', err);
  }
}

async function loadPendingFromCache() {
  try {
    const db = await openLocalDb();
    return new Promise((resolve) => {
      const tx = db.transaction(['pending_cache'], 'readonly');
      const store = tx.objectStore('pending_cache');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

async function saveActionOffline(actionData) {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['offline_actions'], 'readwrite');
    const store = tx.objectStore('offline_actions');
    const req = store.add({ ...actionData, tempId: 'ACTION_' + Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- SYNC ENGINE ---
async function syncOfflineActions() {
  if (!navigator.onLine) return;
  try {
    const db = await openLocalDb();
    const tx = db.transaction(['offline_actions'], 'readwrite');
    const store = tx.objectStore('offline_actions');
    const req = store.getAll();

    req.onsuccess = async () => {
      const offlineActions = req.result;
      if (!offlineActions || offlineActions.length === 0) return;

      for (const action of offlineActions) {
        try {
          const response = await fetch(`${link}/orders/${action.orderId}`, {
            method: 'PATCH',
            headers: { 
              'Authorization': `Bearer ${Token}`, 
              'Content-Type': 'application/json', 
              'shop-id': shopId,
              'client-uid': clientUid
            },
            body: JSON.stringify(action.payload)
          });
          if (response.ok) {
            const delTx = db.transaction(['offline_actions'], 'readwrite');
            delTx.objectStore('offline_actions').delete(action.tempId);
          }
        } catch (e) {
          console.warn('Sync pending for action due to network state.');
        }
      }
    };
  } catch (err) {
    console.error('Error during background action sync:', err);
  }
}

function updateNetworkStatus() {
  isOffline.value = !navigator.onLine;
  if (!isOffline.value) {
    syncOfflineActions();
    fetchPendingOrders();
  }
}

const subtotal = computed(() => {
  return selectedItems.value.reduce((sum, item) => sum + item.price, 0);
});

const total = computed(() => {
  const chargeAmount = (subtotal.value * sc.value) / 100;
  let stotal = subtotal.value + chargeAmount;
  const reduce = (stotal * rc.value) / 100;
  return Math.max(0, stotal - reduce);
});

const formatDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA');
};

function remove(rid) {
  selectedItems.value = selectedItems.value.filter(item => item.id !== rid);
}

function loadPending(o) {
  selectedOrder.value = o;
  selectedItems.value = (o.items || []).map(it => {
    const realPid = it.pid || it.itemid || it.item_id || it.id;
    const itemQty = Number(it.qty) || 1;
    const itemPrice = Number(it.price) || Number(it.unitPrice) || 0;

    return {
      pid: realPid,
      id: realPid,
      name: it.name || 'Unnamed Item',
      qty: itemQty,
      unitPrice: itemPrice,
      price: itemPrice * itemQty
    };
  });
  sc.value = Number(o.servicePct || o.sc || 0);
  rc.value = Number(o.discount || o.rc || 0);
}

async function reject() {
  if (!selectedOrder.value) return;
  saving.value = true;
  
  const payload = { 
    status: 'cancelled',
    billNum: selectedOrder.value.id,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0,
    items: selectedItems.value.map(i => {
      const resolvedPid = i.pid || i.id;
      return {
        pid: resolvedPid ? Number(resolvedPid) : null,
        id: resolvedPid ? Number(resolvedPid) : null,
        name: i.name,
        qty: i.qty,
        price: i.unitPrice || 0
      };
    })
  };

  try {
    if (navigator.onLine) {
      const response = await fetch(`${link}/orders/${selectedOrder.value.id}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${Token}`, 
          'Content-Type': 'application/json', 
          'shop-id': shopId,
          'client-uid': clientUid
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Reject failed: ${response.status}`);
    } else {
      await saveActionOffline({ orderId: selectedOrder.value.id, payload });
      console.log("Reject action saved locally.");
    }

    pendingOrders.value = pendingOrders.value.filter(o => o.id !== selectedOrder.value.id);
    selectedOrder.value = null;
    selectedItems.value = [];
  } catch (err) {
    console.error("Reject failed:", err);
    alert("Could not reject order.");
  } finally {
    saving.value = false;
  }
}

async function bill() {
  if (!selectedOrder.value) {
    alert('Please select a pending order first');
    return;
  }
  if (selectedItems.value.length === 0) {
    alert('Cart is empty');
    return;
  }
  if (saving.value) return;

  saving.value = true;
  buttonText.value = 'Saving...';

  const payload = {
    id: selectedOrder.value.id,
    billNum: selectedOrder.value.id,
    status: 'paid',
    clientUid: clientUid,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0,
    items: selectedItems.value.map(i => {
      const resolvedPid = i.pid || i.id;
      if (!resolvedPid) {
        console.warn("⚠️ Warning: Item is missing a valid product ID (pid):", i);
      }

      return {
        pid: resolvedPid ? Number(resolvedPid) : null,
        id: resolvedPid ? Number(resolvedPid) : null,
        name: i.name,
        qty: Number(i.qty) || 1,
        price: Number(i.unitPrice) || (Number(i.qty) > 0 ? Number(i.price) / Number(i.qty) : Number(i.price)) || 0
      };
    }),
    rcvalue: Number(rc.value),
    scvalue: Number(sc.value),
    stotal: Number(subtotal.value),
    total: Number(total.value),
    currency: String(currency.value),
    staffName: 'Cashier'
  };

  try {
    let finalBillNum = selectedOrder.value.id;

    if (navigator.onLine) {
      const res = await fetch(`${link}/orders/${selectedOrder.value.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${Token}`,
          'Content-Type': 'application/json',
          'shop-id': shopId,
          'client-uid': clientUid
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const result = await res.json();
      if (result.billnum) finalBillNum = result.billnum;
    } else {
      await saveActionOffline({ orderId: selectedOrder.value.id, payload });
      console.log("Bill action saved offline.");
    }

    const printPayload = {
      arrays: JSON.parse(JSON.stringify(selectedItems.value)),
      rcvalue: Number(rc.value),
      scvalue: Number(sc.value),
      stotal: Number(subtotal.value),
      total: Number(total.value),
      billnum: finalBillNum,
      currency: currency.value
    };

    const printResult = await printReceipt(printPayload);
    if (!printResult.success) {
      console.warn('Printer note:', printResult.error);
    }

    router.push({ name: 'billprint', state: printPayload });

    pendingOrders.value = pendingOrders.value.filter(o => o.id !== selectedOrder.value.id);
    selectedOrder.value = null;
    selectedItems.value = [];
    rc.value = 0;
    sc.value = 0;
  } catch (err) {
    console.error("Bill save failed:", err);
    alert(err.message || "Could not save bill.");
  } finally {
    saving.value = false;
    buttonText.value = 'Save & Pay';
  }
}

async function fetchPendingOrders() {
  try {
    const res = await fetch(`${link}/pendingorders`, {
      headers: { 'Authorization': `Bearer ${Token}`, 'shop-id': shopId, 'client-uid': clientUid }
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const data = await res.json();
    pendingOrders.value = data;
    if (data.length > 0) currency.value = data[0].currency || 'LKR';
    await cachePendingOrders(data);
  } catch (err) {
    console.warn("Network fetch failed, loading pending orders from local cache...", err);
    const cachedData = await loadPendingFromCache();
    pendingOrders.value = cachedData;
    if (cachedData.length > 0) currency.value = cachedData[0].currency || 'LKR';
  }
}

onMounted(async () => {
  if (!Token) {
    router.push('/');
    return;
  }

  if (!shopId) {
    console.warn("⚠️ Warning: shopId is missing from sessionStorage!");
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  loading.value = true;
  await fetchPendingOrders();
  loading.value = false;
  if (navigator.onLine) {
    syncOfflineActions();
  }
});

onUnmounted(() => {
  window.removeEventListener('online', updateNetworkStatus);
  window.removeEventListener('offline', updateNetworkStatus);
});
</script>

<style scoped>
html, body {
  margin: 0;
  padding: 0;
  height: 100vh;
  background-color: #f0f8ff;
  overflow: hidden;
}

.client-wrapper {
  width: 100vw;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
  height: 100vh;
  overflow: hidden;
  background-color: #f0f8ff;
  box-sizing: border-box;
}

.offline-badge {
  font-size: 0.7rem;
  background-color: #ef4444;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  vertical-align: middle;
  margin-left: 8px;
}

.pending-pane {
  width: 50%;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
}

.head {
  padding: 18px 20px;
  background: #041528;
  color: white;
  flex-shrink: 0;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.pending-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: #f8fafc;
}

.pending-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pending-card:hover { 
  border-color: #0077B6; 
  background: #f0f8ff; 
}

.pending-card.active { 
  border-color: #0077B6; 
  background: #e6f4fb; 
  box-shadow: 0 0 0 2px rgba(0, 119, 182, 0.2); 
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-id {
  font-weight: 700;
  color: #041528;
  font-size: 0.95rem;
}

.order-total {
  font-weight: 700;
  color: #0077B6;
  font-size: 0.95rem;
}

.card-mid-row {
  display: flex;
  justify-content: space-between;
}

.customer-name {
  font-weight: 600;
  color: #334155;
  font-size: 0.9rem;
}

.card-bot-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
}

.muted { 
  color: #64748b; 
  font-size: 0.8rem; 
}

.empty { 
  padding: 40px; 
  text-align: center; 
  color: #94a3b8; 
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
}

.empty-icon {
  font-size: 2rem;
}

.client-bill {
  width: 50%;
  background-color: #ffffff;
  color: #1e293b;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.bill-header {
  padding: 18px 20px 0 20px;
  background: #ffffff;
  flex-shrink: 0;
}

#h1 {
  width: 100%;
  margin: 0;
  font-size: 1.15rem;
  color: #041528;
  font-weight: 600;
}

.heads {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  flex-shrink: 0;
  border-bottom: 2px solid #e2e8f0;
  box-sizing: border-box;
  background: #ffffff;
}

.heads h3 {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
}

#n { width: 50%; text-align: left; }
#q { text-align: center; width: 15%; }
#p { text-align: right; width: 35%; }

.bills {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
}

.bdata {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s;
}

.bdata:hover { 
  background: rgba(239, 68, 68, 0.05); 
  border-radius: 6px;
}

.n { 
  width: 50%; 
  text-align: left; 
  overflow: hidden; 
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #334155;
  font-weight: 500;
}

.q { 
  overflow: hidden; 
  text-align: center; 
  width: 15%; 
  color: #64748b;
}

.p { 
  overflow: hidden; 
  text-align: right; 
  width: 35%; 
  color: #1e293b;
  font-weight: 600;
}

.last {
  position: sticky;
  bottom: 0;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  padding: 15px 20px;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.last span {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 0.9rem;
  color: #475569;
  font-weight: 500;
}

.input-span input { 
  width: 65px; 
  padding: 4px;
  text-align: center; 
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #ffffff;
  color: #1e293b;
  outline: none;
}

.input-span input:focus {
  border-color: #0077B6;
}

.total-span {
  font-size: 1.1rem !important;
  font-weight: 700 !important;
  color: #041528 !important;
  border-top: 1px dashed #cbd5e1;
  padding-top: 8px;
  margin-top: 2px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 4px;
}

button {
  padding: 12px;
  font-size: 1rem;
  font-weight: 600;
  width: 100%;
  margin-top: 0;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.reject-btn {
  background-color: #ef4444;
  color: #ffffff;
}

.reject-btn:hover {
  background-color: #dc2626;
}

.pay-btn {
  background-color: #0077B6;
  color: #ffffff;
}

.pay-btn:hover {
  background-color: #026094;
}

button:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}
</style>
