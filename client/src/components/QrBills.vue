<template>
  <div class="pos-main-container" v-if="!billshow">
    <!-- LEFT PANE: PENDING ORDERS -->
    <div class="pending-pane">
      <div class="pane-header">
        <div class="header-title">
          <span class="title-icon">📋</span>
          <h2>Pending Orders</h2>
        </div>
        <button class="fetch-btn" @click="fetchPendingOrders()" :disabled="loading">
          <span>🔄</span> Fetch
        </button>
      </div>

      <div class="pending-list-container">
        <div v-if="loading" class="state-box">
          <div class="spinner"></div>
          <p>Loading orders...</p>
        </div>
        
        <div v-else-if="pendingOrders.length === 0" class="state-box">
          <span class="empty-icon">📭</span>
          <p>No pending orders right now</p>
        </div>

        <div v-else class="orders-grid">
          <div
            v-for="o in pendingOrders"
            :key="o.id"
            class="order-card"
            :class="{ active: selectedOrder?.id === o.id }"
            @click="loadPending(o)"
          >
            <div class="card-top">
              <span class="order-id">#{{ o.id }}</span>
              <span class="order-total">{{ Number(o.total || 0).toFixed(2) }} {{ currency }}</span>
            </div>

            <div class="card-middle">
              <span class="customer-name">👤 {{ o.customer || 'Walk-in Customer' }}</span>
            </div>

            <div class="card-bottom">
              <span class="meta-tag">📦 {{ o.items ? o.items.length : 0 }} items</span>
              <span class="meta-date">🕒 {{ formatDate(o.date) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT PANE: BILL SECTOR -->
    <div class="bill-pane">
      <div class="bill-pane-header">
        <div class="bill-title-wrapper">
          <span class="receipt-icon">🧾</span>
          <h1>Bill #{{ selectedOrder?.id || '--' }}</h1>
        </div>
        <span v-if="selectedOrder" class="order-type-badge">
          {{ (selectedOrder.orderType || 'takeaway').toUpperCase() }}
        </span>
      </div>

      <!-- Table Headings -->
      <div class="table-headers" v-if="selectedItems.length > 0">
        <span class="th-name">Item Name</span>
        <span class="th-qty">Qty</span>
        <span class="th-price">Price</span>
      </div>

      <!-- Bill Items Container -->
      <div class="bill-items-container">
        <div v-if="selectedItems.length === 0" class="state-box empty-bill">
          <span class="empty-icon">👈</span>
          <p>Select a pending order from the left to view bill details</p>
        </div>

        <div v-else class="items-list">
          <div 
            class="bill-item-row" 
            v-for="i in selectedItems" 
            :key="i.id" 
            @click="remove(i.id)" 
            title="Click to remove item"
          >
            <div class="item-name-wrap">
              <span class="remove-hint">×</span>
              <p class="item-name">{{ i.name }}</p>
            </div>
            <p class="item-qty">{{ i.qty }}</p>
            <p class="item-price">{{ Number((i.price) * i.qty || 0).toFixed(2) }}</p>
          </div>
        </div>
      </div>

      <!-- Footer Calculation & Action Block -->
      <div class="bill-footer" v-if="selectedOrder">
        <!-- Order Type & Payment Type Selectors -->
        <div class="selectors-grid">
          <div class="select-group">
            <label>Order Type</label>
            <select v-model="selectedOrder.orderType">
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <div class="select-group">
            <label>Payment Type</label>
            <select v-model="selectedOrder.paymentType">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </select>
          </div>
        </div>

        <div class="calc-block">
          <div class="calc-row">
            <span>Sub Total</span>
            <span class="calc-val">{{ Number(subtotal || 0).toFixed(2) }} {{ currency }}</span>
          </div>

          <div class="calc-row input-row">
            <span>Service Charge (%)</span>
            <input type="number" v-model.number="sc" min="0" placeholder="0" />
          </div>

          <div class="calc-row input-row">
            <span>Discount (%)</span>
            <input type="number" v-model.number="rc" min="0" placeholder="0" />
          </div>

          <div class="calc-row total-row">
            <span>Final Total</span>
            <span class="total-val">{{ Number(total || 0).toFixed(2) }} {{ currency }}</span>
          </div>
        </div>

        <div class="action-buttons">
          <button class="action-btn reject-btn" @click="reject" :disabled="saving">
            Reject Order
          </button>
          <button class="action-btn pay-btn" @click="bill" :disabled="saving || selectedItems.length === 0">
            {{ buttonText }}
          </button>
        </div>
      </div>
    </div>

    <!-- STICKY BOTTOM SUMMARY BAR (z-index: 99) -->
    <div class="sticky-cart-summary" v-if="selectedOrder">
      <div class="summary-content">
        <div class="summary-item">
          <span class="s-label">Order:</span>
          <span class="s-val">#{{ selectedOrder.id }}</span>
        </div>
        <div class="summary-item">
          <span class="s-label">Type:</span>
          <span class="s-val badge">{{ (selectedOrder.orderType || 'takeaway').toUpperCase() }}</span>
        </div>
        <div class="summary-item">
          <span class="s-label">Payment:</span>
          <span class="s-val badge">{{ (selectedOrder.paymentType || 'cash').toUpperCase() }}</span>
        </div>
        <div class="summary-item">
          <span class="s-label">Items:</span>
          <span class="s-val">{{ selectedItems.length }}</span>
        </div>
        <div class="summary-item total-summary">
          <span class="s-label">Total:</span>
          <span class="s-val-total">{{ Number(total || 0).toFixed(2) }} {{ currency }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { link, printReceipt } from '../assets/Link';
import { eventBus } from '../assets/eventBus';

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

const shopProfile = ref({
  shop_name: 'KINETIC POS',
  s_mobile: '',
  s_address: ''
});

const subtotal = computed(() => {
  return selectedItems.value.reduce((sum, item) => sum + (item.price * item.qty), 0);
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
  // Ensure default values exist if not provided by server
  selectedOrder.value = {
    ...o,
    orderType: o.orderType || 'takeaway',
    paymentType: o.paymentType || 'cash'
  };

  selectedItems.value = (o.items || []).map(it => {
    const qty = Number(it.qty) || 1;
    let rawPrice = Number(it.price) || 0;
    const unitPrice = (qty > 1 && rawPrice > 1000) ? (rawPrice / qty) : rawPrice;

    return {
      id: it.itemid || it.id,
      name: it.name,
      qty: qty,
      price: unitPrice 
    };
  });
  sc.value = o.servicePct || o.sc || 0;
  rc.value = o.discount || o.rc || 0;
}

// --- REJECT ACTION ---
async function reject() {
  if (!selectedOrder.value) return;
  saving.value = true;
  const targetId = selectedOrder.value.id;
  const payload = { 
    status: 'cancelled',
    billNum: targetId,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0
  };

  try {
    const response = await fetch(`${link}/orders/${targetId}`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${Token}`, 
        'Content-Type': 'application/json', 
        'shop-id': shopId,
        'client-uid': clientUid
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('Failed to reject order on server');

    pendingOrders.value = pendingOrders.value.filter(item => item.id !== targetId);
    selectedOrder.value = null;
    selectedItems.value = [];
    eventBus.triggerRefresh();
  } catch (err) {
    console.error("Reject failed:", err);
    alert("Could not reject order.");
  } finally {
    saving.value = false;
  }
}

// --- ACCEPT / SAVE & PAY ACTION ---
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
  const targetId = selectedOrder.value.id;

  const payload = {
    id: targetId,
    billNum: targetId,
    status: 'paid',
    clientUid: clientUid,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0,
    orderType: selectedOrder.value.orderType || 'takeaway',
    paymentType: selectedOrder.value.paymentType || 'cash',
    items: selectedItems.value.map(i => ({
      pid: i.id || i.itemid,
      id: i.id || i.itemid,
      name: i.name,
      qty: i.qty,
      price: Number(i.price) * Number(i.qty)
    })),
    rcvalue: Number(rc.value),
    scvalue: Number(sc.value),
    stotal: Number(subtotal.value),
    total: Number(total.value),
    currency: String(currency.value),
    staffName: 'Cashier'
  };

  try {
    let finalBillNum = targetId;

    const res = await fetch(`${link}/orders/${targetId}`, {
      method: 'PATCH',
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

    const result = await res.json().catch(() => ({}));
    if (result.billnum || result.id) finalBillNum = result.billnum || result.id;
    if (result.shopname || result.shop_name) shopProfile.value.shop_name = result.shopname || result.shop_name;
    if (result.s_mobile || result.mobile) shopProfile.value.s_mobile = result.s_mobile || result.mobile;
    if (result.s_address || result.address) shopProfile.value.s_address = result.s_address || result.address;

    // 1. Print KOT first
    const kotPayload = {
      arrays: JSON.parse(JSON.stringify(selectedItems.value.map(i => ({ ...i, price: i.price * i.qty })))),
      billnum: finalBillNum,
      orderType: (selectedOrder.value.orderType || 'takeaway').toUpperCase(),
      paymentType: (selectedOrder.value.paymentType || 'cash').toUpperCase(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      shopname: shopProfile.value.shop_name,
      s_mobile: shopProfile.value.s_mobile,
      s_address: shopProfile.value.s_address
    };
    await printReceipt(kotPayload);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Print Customer Bill
    const printPayload = {
      arrays: JSON.parse(JSON.stringify(selectedItems.value.map(i => ({ ...i, price: i.price * i.qty })))),
      rcvalue: Number(rc.value),
      scvalue: Number(sc.value),
      stotal: Number(subtotal.value),
      total: Number(total.value),
      billnum: finalBillNum,
      currency: currency.value,
      shopname: shopProfile.value.shop_name,
      s_mobile: shopProfile.value.s_mobile,
      s_address: shopProfile.value.s_address,
      orderType: selectedOrder.value.orderType || 'takeaway',
      paymentType: selectedOrder.value.paymentType || 'cash',
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString()
    };

    const printResult = await printReceipt(printPayload);
    if (!printResult.success) {
      console.warn('Printer note:', printResult.error);
    }

    pendingOrders.value = pendingOrders.value.filter(o => o.id !== targetId);
    selectedOrder.value = null;
    selectedItems.value = [];
    rc.value = 0;
    sc.value = 0;

    eventBus.triggerRefresh();
  } catch (err) {
    console.error("Bill save failed:", err);
    alert(err.message || "Could not save bill.");
  } finally {
    saving.value = false;
    buttonText.value = 'Save & Pay';
  }
}

async function fetchPendingOrders() {
  loading.value = true;
  try {
    const res = await fetch(`${link}/pendingorders`, {
      headers: { 'Authorization': `Bearer ${Token}`, 'shop-id': shopId, 'client-uid': clientUid }
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const serverData = await res.json();
    pendingOrders.value = serverData;
    if (serverData.length > 0) currency.value = serverData[0].currency || 'LKR';
  } catch (err) {
    console.error("Failed to fetch pending orders:", err);
    pendingOrders.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!Token) {
    indexedDB.deleteDatabase('KineticPOS_Local');
    sessionStorage.clear();
    router.push('/');
    return;
  }

  if (eventBus && typeof eventBus.on === 'function') {
    eventBus.on('refresh', async () => {
      await fetchPendingOrders();
    });
  }

  await fetchPendingOrders();
});

onUnmounted(() => {});
</script>

<style scoped>
*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100vh;
  background-color: #f8fafc;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

.pos-main-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: row;
  background-color: #f1f5f9;
  overflow: hidden;
  position: relative;
  padding-bottom: 50px; /* Make room for sticky bar */
}

/* ================= LEFT PANE: PENDING ORDERS ================= */
.pending-pane {
  width: 45%;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.pane-header {
  padding: 16px 20px;
  background: #0f172a;
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-title h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.title-icon {
  font-size: 1.2rem;
}

.fetch-btn {
  background: #0284c7;
  color: #ffffff;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s, transform 0.1s;
}

.fetch-btn:hover {
  background: #0369a1;
}

.fetch-btn:active {
  transform: scale(0.97);
}

.pending-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: #f8fafc;
}

.orders-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pending-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.pending-card:hover {
  border-color: #0284c7;
  background: #f0f9ff;
  transform: translateY(-1px);
}

.pending-card.active {
  border-color: #0284c7;
  background: #e0f2fe;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-id {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.95rem;
}

.order-total {
  font-weight: 700;
  color: #0284c7;
  font-size: 1rem;
}

.card-middle {
  display: flex;
  align-items: center;
}

.customer-name {
  font-weight: 600;
  color: #334155;
  font-size: 0.9rem;
}

.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #f1f5f9;
  padding-top: 6px;
  margin-top: 2px;
}

.meta-tag, .meta-date {
  color: #64748b;
  font-size: 0.8rem;
}


/* ================= RIGHT PANE: BILL SECTOR ================= */
.bill-pane {
  width: 55%;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.bill-pane-header {
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.bill-title-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bill-pane-header h1 {
  margin: 0;
  font-size: 1.25rem;
  color: #0f172a;
  font-weight: 700;
}

.receipt-icon {
  font-size: 1.3rem;
}

.order-type-badge {
  background: #f1f5f9;
  color: #0f172a;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  border: 1px solid #cbd5e1;
}

/* Table Column Headers */
.table-headers {
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.table-headers span {
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.th-name { width: 50%; text-align: left; }
.th-qty { width: 15%; text-align: center; }
.th-price { width: 35%; text-align: right; }

/* Bill Items Container */
.bill-items-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  background-color: #ffffff;
}

.items-list {
  display: flex;
  flex-direction: column;
}

.bill-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s;
}

.bill-item-row:hover {
  background: #fef2f2;
}

.item-name-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 50%;
}

.remove-hint {
  color: #ef4444;
  font-weight: bold;
  font-size: 1rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.bill-item-row:hover .remove-hint {
  opacity: 1;
}

.item-name {
  margin: 0;
  font-size: 0.9rem;
  color: #334155;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-qty {
  width: 15%;
  text-align: center;
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}

.item-price {
  width: 35%;
  text-align: right;
  margin: 0;
  color: #0f172a;
  font-weight: 600;
  font-size: 0.9rem;
}

/* ================= BILL FOOTER & CALCULATIONS ================= */
.bill-footer {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  padding: 16px 20px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 40px; /* Space for sticky footer */
}

.selectors-grid {
  display: flex;
  gap: 10px;
}

.select-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.select-group label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
}

.select-group select {
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.9rem;
  font-weight: 600;
  outline: none;
  cursor: pointer;
}

.select-group select:focus {
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}

.calc-block {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: #475569;
}

.calc-val {
  font-weight: 600;
  color: #0f172a;
}

.input-row input {
  width: 70px;
  padding: 4px 8px;
  text-align: center;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  background: #ffffff;
  color: #0f172a;
  outline: none;
}

.input-row input:focus {
  border-color: #0284c7;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}

.total-row {
  border-top: 1px dashed #cbd5e1;
  padding-top: 8px;
  margin-top: 2px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
}

.total-val {
  color: #0284c7;
  font-size: 1.2rem;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 10px;
  width: 100%;
}

.action-btn {
  flex: 1;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.action-btn:active {
  transform: scale(0.98);
}

.reject-btn {
  background-color: #ef4444;
  color: #ffffff;
}

.reject-btn:hover {
  background-color: #dc2626;
}

.pay-btn {
  background-color: #0284c7;
  color: #ffffff;
}

.pay-btn:hover {
  background-color: #0369a1;
}

.action-btn:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
  transform: none;
}

/* ================= STICKY BOTTOM SUMMARY BAR (z-index: 99) ================= */
.sticky-cart-summary {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100vw;
  height: 48px;
  background: #0f172a;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  border-top: 1px solid #1e293b;
}

.summary-content {
  width: 100%;
  max-width: 1200px;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
}

.summary-item .s-label {
  color: #94a3b8;
  font-size: 0.8rem;
  text-transform: uppercase;
  font-weight: 600;
}

.summary-item .s-val {
  color: #ffffff;
  font-weight: 600;
}

.summary-item .badge {
  background: #0284c7;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
}

.total-summary {
  background: #1e293b;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #334155;
}

.summary-item .s-val-total {
  color: #38bdf8;
  font-weight: 700;
  font-size: 1.05rem;
}

/* Common State Boxes (Loading / Empty) */
.state-box {
  padding: 40px 20px;
  text-align: center;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  font-size: 0.95rem;
}

.empty-bill {
  background: #f8fafc;
  border: 2px dashed #e2e8f0;
  margin: 20px;
  border-radius: 12px;
}

.empty-icon {
  font-size: 2rem;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e2e8f0;
  border-top-color: #0284c7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pending-list-container::-webkit-scrollbar,
.bill-items-container::-webkit-scrollbar {
  width: 6px;
}

.pending-list-container::-webkit-scrollbar-thumb,
.bill-items-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 10px;
}

.pending-list-container::-webkit-scrollbar-thumb:hover,
.bill-items-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
</style>
