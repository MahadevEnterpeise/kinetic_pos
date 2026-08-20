<template>
  <div class="client-wrapper" v-if="!billshow">
    <!-- Left Side: Product Selection Workspace -->
    <div class="client-work">
      <!-- Category Folder Grid -->
      <div class="folder-grid" v-if="!selected && !open">
        <div class="item-box1" v-for="n in data" :key="n.id" @click="opens(n.id)">
          <span class="folder-icon">📁</span>
          <span class="folder-name">{{ n.name }}</span>
        </div>
        <div v-if="data.length === 0" class="empty-state">
          <p>No product categories available</p>
        </div>
      </div>

      <!-- Item / File Grid -->
      <div class="file-grid" v-if="selected && open">
        <div class="item-box" v-for="i in openeditems" :key="i.itemid">
          <div class="itembox">
            <div class="name">{{ i.name }}</div>
            <div class="stock-label">Stock: {{ i.stock }}</div>
            <div class="qty">
              <input type="number" v-model="tempQtys[i.itemid]" placeholder="1" min="1" id="input1"/>
            </div>
          </div>
          <button @click="handleboxclicked(i, tempQtys[i.itemid])" id="b1">ADD</button>
        </div>

        <!-- Back Button Box -->
        <div class="item-box back-box" @click="back()">
          <span id="arrow">↩</span>
          <span class="back-text">Back</span>
        </div>
      </div>
    </div>

    <!-- Right Side: POS Billing Panel -->
    <div class="client-bill">
      <div class="bill-header">
        <h1 id="h1">Current Bill <span v-if="isOffline" class="offline-badge">🔌 Offline</span></h1>
      </div>

      <div class="bills">
        <div class="heads">
          <h3 id="n">Name</h3>
          <h3 id="q">Qty</h3>
          <h3 id="p">Price</h3>
        </div>

        <div v-if="selectedItems.length === 0" class="empty-cart">
          <p>Cart is empty. Tap items to add.</p>
        </div>

        <div class="bdata" v-for="i in selectedItems" :key="i.id" @click="remove(i.id)" title="Click to remove">
          <p class="n">{{ i.name }}</p>
          <p class="q">{{ i.qty }}</p>
          <p class="p">{{ Number(i.price || 0).toFixed(2) }}</p>
        </div>
      </div>

      <div class="last">
        <div class="calc-row">
          <span>Sub Total</span>
          <span>{{ Number(subtotal || 0).toFixed(2) }} {{ currency }}</span>
        </div>

        <div class="calc-row input-calc-row">
          <span>Service Charge (%)</span>
          <input type="number" v-model.number="sc" min="0" />
        </div>

        <div class="calc-row input-calc-row">
          <span>Discount (%)</span>
          <input type="number" v-model.number="rc" min="0" />
        </div>

        <div class="calc-row total-row">
          <span>Total</span>
          <span>{{ Number(total || 0).toFixed(2) }} {{ currency }}</span>
        </div>

        <div class="action-buttons">
          <button class="hold-btn" @click="holdBill" :disabled="saving">Hold Bill</button>
          <button class="pay-btn" @click="bill('paid')" :disabled="saving">{{ button }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { link, printReceipt } from '../assets/Link';
import { eventBus } from '../assets/eventBus'; // <--- Connected to shared event bus

const router = useRouter();

const data = ref([]);
const loading = ref(true);
const error = ref(null);
const button = ref('Save & Pay');
const open = ref(false);
const selected = ref(false);
const selectedItems = ref([]);
const openeditems = ref([]);
const sc = ref(0);
const rc = ref(0);
const billshow = ref(false);
const currency = ref('LKR');
const tempQtys = ref({});
const saving = ref(false);
const isOffline = ref(!navigator.onLine);
let shop = ''; 

const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId') || sessionStorage.getItem('shopid');
const clientUid = Token;

// --- INDEXEDDB SETUP & HELPERS ---
const DB_NAME = 'KineticPOS_Local';
const DB_VERSION = 4;

function openLocalDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('catalog')) {
        db.createObjectStore('catalog', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_bills')) {
        db.createObjectStore('offline_bills', { keyPath: 'tempId' });
      }
      if (!db.objectStoreNames.contains('pending_cache')) {
        db.createObjectStore('pending_cache', { keyPath: 'id' });
      }
    };
  });
}

async function saveCatalogToCache(categories, curr) {
  try {
    const db = await openLocalDb();
    const tx = db.transaction(['catalog'], 'readwrite');
    tx.objectStore('catalog').put({ id: 'main_menu', categories, currency: curr });
  } catch (err) {
    console.error('Failed to cache catalog locally:', err);
  }
}

async function loadCatalogFromCache() {
  try {
    const db = await openLocalDb();
    return new Promise((resolve) => {
      const tx = db.transaction(['catalog'], 'readonly');
      const store = tx.objectStore('catalog');
      const req = store.get('main_menu');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

async function saveBillOffline(payload, statusType) {
  const db = await openLocalDb();
  const tempId = 'OFFLINE_' + Date.now();
  const numericId = Date.now();

  const billRecord = {
    ...payload,
    id: numericId,
    tempId,
    date: new Date().toISOString(),
    customer: 'Walk-in Customer',
    items: payload.items.map(i => ({
      itemid: i.pid,
      name: i.name,
      qty: i.qty,
      price: i.price
    })),
    servicePct: payload.sc,
    discount: payload.rc,
    total: total.value,
    currency: currency.value,
    shopname: shop || 'KINETIC POS',
    orderType: 'DINE-IN'
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['offline_bills', 'pending_cache'], 'readwrite');
    tx.objectStore('offline_bills').add({ ...billRecord, tempId });

    if (statusType === 'pending') {
      tx.objectStore('pending_cache').put(billRecord);
    }

    tx.oncomplete = () => resolve(tempId);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- SYNC ENGINE ---
async function syncOfflineBills() {
  if (!navigator.onLine) return;
  try {
    const db = await openLocalDb();
    
    const offlineBills = await new Promise((resolve, reject) => {
      const tx = db.transaction(['offline_bills'], 'readonly');
      const store = tx.objectStore('offline_bills');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (!offlineBills || offlineBills.length === 0) return;

    for (const billData of offlineBills) {
      try {
        const syncPayload = {
          ...billData,
          isOfflineSync: true,
          originalTempId: billData.tempId
        };

        const res = await fetch(`${link}/bills`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Token}`,
            'Content-Type': 'application/json',
            'shop-id': shopId,
            'client-uid': clientUid
          },
          body: JSON.stringify(syncPayload)
        });

        if (res.ok) {
          await new Promise((resolve, reject) => {
            const delTx = db.transaction(['offline_bills', 'pending_cache'], 'readwrite');
            delTx.objectStore('offline_bills').delete(billData.tempId);
            
            if (delTx.objectStoreNames.contains('pending_cache')) {
              delTx.objectStore('pending_cache').delete(billData.id);
            }

            delTx.oncomplete = () => resolve();
            delTx.onerror = (e) => reject(e);
          });
          console.log(`Synced and cleared local offline bill: ${billData.tempId}`);
        } else {
          console.warn(`Server rejected sync with status: ${res.status}`);
        }
      } catch (e) {
        console.warn('Sync pending due to network state.');
      }
    }
  } catch (err) {
    console.error('Error during background bill sync:', err);
  }
}

function updateNetworkStatus() {
  isOffline.value = !navigator.onLine;
  if (!isOffline.value) {
    syncOfflineBills();
  }
}

// Watch event bus to react instantly when sibling components change data states
watch(() => eventBus.refreshPending, () => {
  // Add any extra reactions Component A needs to take when Component B modifies/clears bills
  console.log('Event bus triggered from sibling component.');
});

onMounted(async () => {
  if (!Token) {
    router.push('/');
    return;
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);

  try {
    loading.value = true;
    error.value = null;

    if (navigator.onLine) {
      const res = await fetch(`${link}/my-products`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${Token}`,
          'shop-id': shopId,
          'client-uid': clientUid,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`API Error: ${res.status}`);

      const result = await res.json();
      data.value = result.categories;
      currency.value = result.currency || 'LKR';
      if (result.shopname) {
        shop = result.shopname;
      }

      await saveCatalogToCache(result.categories, currency.value);
      syncOfflineBills();
    } else {
      throw new Error('Offline mode active');
    }
  } catch (err) {
    const cached = await loadCatalogFromCache();
    if (cached) {
      data.value = cached.categories;
      currency.value = cached.currency || 'LKR';
    } else {
      error.value = "Could not load products and no offline cache available.";
    }
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  window.removeEventListener('online', updateNetworkStatus);
  window.removeEventListener('offline', updateNetworkStatus);
});

const subtotal = computed(() => {
  return selectedItems.value.reduce((sum, item) => sum + item.price, 0);
});

function opens(a) {
  const category = data.value.find(c => c.id === a);
  if (category) {
    openeditems.value = category.items;
    open.value = true;
    selected.value = true;
  }
}

function back() {
  open.value = false;
  selected.value = false;
}

const handleboxclicked = (item, qty) => {
  const finalQty = Number(qty) || 1;

  if (finalQty > item.stock) {
    alert(`Requested quantity exceeds available stock (${item.stock})!`);
    return;
  }

  const unitPrice = Number(item.price) || 0;
  const existingItem = selectedItems.value.find(i => i.id === item.itemid);

  if (existingItem) {
    existingItem.qty += finalQty;
    existingItem.price = existingItem.qty * unitPrice;
  } else {
    selectedItems.value.push({
      name: item.name,
      qty: finalQty,
      unitPrice: unitPrice,
      price: unitPrice * finalQty,
      id: item.itemid,
      itemid: item.itemid
    });
  }

  item.stock -= finalQty;
  tempQtys.value[item.itemid] = '';
};

function remove(id) {
  const index = selectedItems.value.findIndex(item => item.id === id);
  if (index !== -1) {
    const removedItem = selectedItems.value[index];

    for (const cat of data.value) {
      const prod = cat.items?.find(i => i.itemid === id);
      if (prod) {
        prod.stock += removedItem.qty;
        break;
      }
    }

    selectedItems.value.splice(index, 1);
  }
}

const total = computed(() => {
  const chargeAmount = (subtotal.value * sc.value) / 100;
  let stotal = subtotal.value + chargeAmount;
  const reduce = (stotal * rc.value) / 100;
  return stotal - reduce;
});

async function printKOT(items, billNum, orderType, shopName) {
  try {
    const kotPayload = {
      arrays: JSON.parse(JSON.stringify(items)),
      billnum: billNum,
      orderType: orderType.toUpperCase(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      shopname: shopName
    };
    await printReceipt(kotPayload);
  } catch (err) {
    console.warn('KOT Print note:', err);
  }
}

async function bill(statusType = 'paid') {
  if (selectedItems.value.length === 0) {
    alert('Cart is empty');
    return;
  }
  if (saving.value) return;

  saving.value = true;
  button.value = statusType === 'pending' ? 'Holding...' : 'Saving...';

  const payload = {
    shopId: shopId,
    uid: clientUid,
    clientUid: clientUid,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0,
    items: selectedItems.value.map(item => ({
      pid: item.id || item.itemid,
      name: item.name,
      qty: item.qty,
      price: item.unitPrice
    })),
    status: statusType
  };

  try {
    let billnumResult = `OFFLINE-${Date.now().toString().slice(-6)}`;
    let currentShopName = shop || 'My Shop';

    if (navigator.onLine) {
      const res = await fetch(`${link}/bills`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Token}`,
          'Content-Type': 'application/json',
          'shop-id': shopId,
          'client-uid': clientUid
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Save failed: ${res.status}`);
      }

      const result = await res.json();
      billnumResult = result.billnum;
      if (result.shopname) {
        currentShopName = result.shopname;
        shop = result.shopname;
      }
    } else {
      await saveBillOffline(payload, statusType);
    }

    await printKOT(
      selectedItems.value, 
      billnumResult, 
      statusType === 'paid' ? 'Dine-In / Paid' : 'Held / Pending',
      currentShopName
    );

    if (statusType === 'paid') {
      const printPayload = {
        arrays: JSON.parse(JSON.stringify(selectedItems.value)),
        rcvalue: Number(rc.value),
        scvalue: Number(sc.value),
        stotal: Number(subtotal.value),
        total: Number(total.value),
        billnum: billnumResult,
        currency: currency.value,
        shopname: currentShopName,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      };

      await printReceipt(printPayload);
    } else {
      alert('Bill held successfully as pending and KOT printed!');
    }

    selectedItems.value = [];
    rc.value = 0;
    sc.value = 0;

    // Notify sibling components (like Component B) via event bus that a bill was held/processed
    eventBus.triggerRefresh();
  } catch (err) {
    console.error("Bill save failed, saving locally as backup:", err);
    await saveBillOffline(payload, statusType);
    alert("Network unreachable. Bill saved locally and will sync once online.");
    eventBus.triggerRefresh();
  } finally {
    saving.value = false;
    button.value = 'Save & Pay';
  }
}

async function holdBill() {
  await bill('pending');
}
</script>

<style scoped>
.client-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
  background-color: #0f172a;
  box-sizing: border-box;
  overflow: hidden;
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

.client-work {
  width: 60%;
  padding: 20px;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: flex-start;
  overflow-y: auto;
  box-sizing: border-box;
}

.folder-grid, .file-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  align-content: flex-start;
  justify-content: flex-start;
  width: 100%;
  box-sizing: border-box;
}

.item-box1 {
  width: 140px;
  height: 110px;
  padding: 12px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.item-box1:hover {
  border-color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.08);
  transform: translateY(-2px);
}

.folder-icon {
  font-size: 1.8rem;
}

.folder-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #f8fafc;
  text-align: center;
  word-break: break-word;
}

.item-box {
  width: 140px;
  height: 160px;
  padding: 12px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.item-box:hover {
  border-color: #38bdf8;
}

.itembox {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-grow: 1;
}

.name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #f8fafc;
  text-align: center;
  word-break: break-word;
}

.stock-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.qty {
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 2px;
}

#input1[type="number"] {
  width: 65px;
  padding: 6px;
  text-align: center;
  border: 1px solid #475569;
  border-radius: 8px;
  font-size: 0.9rem;
  background: #0f172a;
  color: #f8fafc;
  outline: none;
}

#input1[type="number"]:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

#b1 {
  width: 100%;
  padding: 6px;
  font-size: 0.85rem;
  background-color: #0284c7;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}

#b1:hover {
  background-color: #0369a1;
}

.back-box {
  cursor: pointer;
  background-color: #1e293b;
  border: 1px dashed #475569;
  justify-content: center;
  gap: 6px;
}

.back-box:hover {
  background-color: #0f172a;
  border-color: #38bdf8;
}

#arrow {
  font-size: 1.2rem;
  color: #38bdf8;
}

.back-text {
  font-weight: 600;
  color: #f8fafc;
  font-size: 0.9rem;
}

.client-bill {
  width: 40%;
  background-color: #1e293b;
  color: #f8fafc;
  border-left: 1px solid #334155;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.bill-header {
  padding: 15px 20px;
  border-bottom: 1px solid #334155;
}

#h1 {
  margin: 0;
  font-size: 1.2rem;
  color: #f8fafc;
}

.bills {
  flex-grow: 1;
  overflow-y: auto;
  padding: 15px 20px;
  box-sizing: border-box;
}

.heads {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #334155;
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.heads h3 {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
  font-weight: 600;
}

#n { width: 50%; text-align: left; }
#q { width: 15%; text-align: center; }
#p { width: 35%; text-align: right; }

.empty-cart {
  text-align: center;
  padding: 30px;
  color: #64748b;
  font-size: 0.9rem;
}

.bdata {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border-bottom: 1px solid #334155;
  transition: background 0.15s;
}

.bdata:hover {
  background: rgba(239, 68, 68, 0.12);
  border-radius: 6px;
}

.bdata .n {
  width: 50%;
  text-align: left;
  color: #e2e8f0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bdata .q {
  width: 15%;
  text-align: center;
  color: #94a3b8;
}

.bdata .p {
  width: 35%;
  text-align: right;
  color: #f8fafc;
  font-weight: 600;
}

.last {
  padding: 15px 20px;
  background: #0f172a;
  border-top: 1px solid #334155;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
}

.calc-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 0.9rem;
  color: #94a3b8;
  font-weight: 500;
}

.input-calc-row input {
  width: 60px;
  padding: 4px;
  text-align: center;
  border: 1px solid #475569;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #1e293b;
  color: #f8fafc;
  outline: none;
}

.input-calc-row input:focus {
  border-color: #38bdf8;
}

.total-row {
  font-size: 1.1rem;
  font-weight: 700;
  color: #f8fafc;
  border-top: 1px dashed #475569;
  padding-top: 8px;
  margin-top: 2px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 5px;
}

.hold-btn {
  background-color: #475569;
  color: #ffffff;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  width: 50%;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.hold-btn:hover {
  background-color: #64748b;
}

.pay-btn {
  background-color: #0284c7;
  color: #ffffff;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  width: 50%;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.pay-btn:hover {
  background-color: #0369a1;
}

.pay-btn:disabled, .hold-btn:disabled {
  background-color: #334155;
  cursor: not-allowed;
}
</style>