<template>
  <div class="order-container">
    <!-- PAID ORDERS COLUMN -->
    <section class="order-column">
      <header class="column-header">
        <div class="header-title-group">
          <h2>Paid Orders</h2>
          <span class="badge-count">{{ paidOrders.length }}</span>
        </div>
        <span class="column-total-preview">{{ Number(paidTotal).toFixed(2) }} {{ currency }}</span>
      </header>

      <div class="orders-list">
        <div v-if="loading" class="state-message">
          <div class="spinner"></div>
          <p>Loading paid orders...</p>
        </div>
        <div v-else-if="paidOrders.length === 0" class="state-message">
          <span class="empty-icon">🧾</span>
          <p>No paid orders found</p>
        </div>

        <article 
          v-for="order in paidOrders" 
          :key="order.id" 
          class="order-card"
          :class="{ expanded: expandedOrderId === order.id }"
          @click="toggleExpand(order.id)"
        >
          <div class="card-summary">
            <div class="summary-top">
              <span class="bill-number">Bill #{{ order.billnum || order.id }}</span>
              <span class="order-total"><b>{{ Number(calculateOrderTotal(order)).toFixed(2) }} {{ currency }}</b></span>
            </div>
            <div class="summary-bottom">
              <span class="order-date">{{ formatDate(order.date) }}</span>
              <span class="status-badge paid">Paid</span>
            </div>
          </div>

          <!-- EXPANDED DETAILS -->
          <div class="card-details" v-if="expandedOrderId === order.id" @click.stop>
            <div class="actor-info">
              <div class="info-item"><span>Processed by:</span> <b>{{ order.staffName || order.actor || 'Cashier' }}</b></div>
              <div class="info-item"><span>Customer:</span> <b>{{ order.mobile || 'Walk-in' }}</b></div>
            </div>

            <div class="items-table-container">
              <div class="item-row header-row">
                <span class="col-item">Item & Charges</span>
                <span class="col-qty">Qty</span>
                <span class="col-price">Total</span>
              </div>

              <div v-for="(item, idx) in order.items" :key="item.itemid || item.id || idx" class="item-row-wrapper">
                <div class="item-row">
                  <div class="col-item item-info-col">
                    <span class="item-name" :title="item.name">{{ item.name }}</span>
                    <!-- Item-specific SC & RC tags -->
                    <div class="item-meta-charges" v-if="Number(item.sc) > 0 || Number(item.rc) > 0">
                      <span v-if="Number(item.sc) > 0" class="meta-tag sc-tag">SC: {{ item.sc }}%</span>
                      <span v-if="Number(item.rc) > 0" class="meta-tag rc-tag">Disc: {{ item.rc }}%</span>
                    </div>
                  </div>
                  <span class="col-qty item-qty">{{ item.qty }}</span>
                  <span class="col-price item-price">{{ (Number(item.price || 0) * Number(item.qty || 1)).toFixed(2) }}</span>
                </div>
              </div>
            </div>

            <!-- Bill level breakdown summary -->
            <div class="bill-breakdown" v-if="Number(order.sc) > 0 || Number(order.rc) > 0">
              <div v-if="Number(order.sc) > 0" class="breakdown-row">
                <span>Service Charge ({{ order.sc }}%):</span>
                <span>+{{ ((calculateSubtotal(order) * order.sc) / 100).toFixed(2) }}</span>
              </div>
              <div v-if="Number(order.rc) > 0" class="breakdown-row">
                <span>Discount ({{ order.rc }}%):</span>
                <span>-{{ (((calculateSubtotal(order) + (calculateSubtotal(order) * order.sc) / 100) * order.rc) / 100).toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>

      <footer class="column-footer">
        <span>Total Revenue</span>
        <span class="footer-amount">{{ Number(paidTotal).toFixed(2) }} {{ currency }}</span>
      </footer>
    </section>

    <!-- CANCELLED ORDERS COLUMN -->
    <section class="order-column">
      <header class="column-header">
        <div class="header-title-group">
          <h2>Cancelled Orders</h2>
          <span class="badge-count cancelled-count">{{ cancelledOrders.length }}</span>
        </div>
        <span class="column-total-preview">{{ Number(cancelledTotal).toFixed(2) }} {{ currency }}</span>
      </header>

      <div class="orders-list">
        <div v-if="loading" class="state-message">
          <div class="spinner"></div>
          <p>Loading cancelled orders...</p>
        </div>
        <div v-else-if="cancelledOrders.length === 0" class="state-message">
          <span class="empty-icon">📭</span>
          <p>No cancelled orders found</p>
        </div>

        <article 
          v-for="order in cancelledOrders" 
          :key="order.id" 
          class="order-card cancelled-card"
          :class="{ expanded: expandedOrderId === order.id }"
          @click="toggleExpand(order.id)"
        >
          <div class="card-summary">
            <div class="summary-top">
              <span class="bill-number">Bill #{{ order.billnum || order.id }}</span>
              <span class="order-total"><b>{{ Number(calculateOrderTotal(order)).toFixed(2) }} {{ currency }}</b></span>
            </div>
            <div class="summary-bottom">
              <span class="order-date">{{ formatDate(order.date) }}</span>
              <span class="status-badge cancelled">Cancelled</span>
            </div>
          </div>

          <!-- EXPANDED DETAILS -->
          <div class="card-details" v-if="expandedOrderId === order.id" @click.stop>
            <div class="actor-info">
              <div class="info-item"><span>Rejected by:</span> <b>{{ order.staffName || order.client || 'Cashier' }}</b></div>
              <div class="info-item"><span>Customer:</span> <b>{{ order.mobile || 'Walk-in' }}</b></div>
            </div>

            <div class="items-table-container">
              <div class="item-row header-row">
                <span class="col-item">Item & Charges</span>
                <span class="col-qty">Qty</span>
                <span class="col-price">Total</span>
              </div>

              <div v-for="(item, idx) in order.items" :key="item.itemid || item.id || idx" class="item-row-wrapper">
                <div class="item-row">
                  <div class="col-item item-info-col">
                    <span class="item-name" :title="item.name">{{ item.name }}</span>
                    <div class="item-meta-charges" v-if="Number(item.sc) > 0 || Number(item.rc) > 0">
                      <span v-if="Number(item.sc) > 0" class="meta-tag sc-tag">SC: {{ item.sc }}%</span>
                      <span v-if="Number(item.rc) > 0" class="meta-tag rc-tag">Disc: {{ item.rc }}%</span>
                    </div>
                  </div>
                  <span class="col-qty item-qty">{{ item.qty }}</span>
                  <span class="col-price item-price">{{ (Number(item.price || 0) * Number(item.qty || 1)).toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <footer class="column-footer">
        <span>Total Cancelled</span>
        <span class="footer-amount cancelled-amount">{{ Number(cancelledTotal).toFixed(2) }} {{ currency }}</span>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { link } from '../assets/Link.js';

const router = useRouter();
const paidOrders = ref([]);
const cancelledOrders = ref([]);
const loading = ref(true);
const currency = ref('LKR');
const expandedOrderId = ref(null);

const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId');

const formatDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA');
};

function calculateSubtotal(order) {
  if (!order.items || !Array.isArray(order.items)) return Number(order.subtotal || order.total || 0);
  return order.items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0);
}

function calculateOrderTotal(order) {
  const sub = calculateSubtotal(order);
  const sc = Number(order.sc || (order.items && order.items[0]?.sc) || 0);
  const rc = Number(order.rc || (order.items && order.items[0]?.rc) || 0);

  const chargeAmount = (sub * sc) / 100;
  let stotal = sub + chargeAmount;
  const reduce = (stotal * rc) / 100;
  const computedTotal = Math.max(0, stotal - reduce);

  return computedTotal > 0 ? computedTotal : Number(order.total || 0);
}

const paidTotal = computed(() => {
  return paidOrders.value.reduce((sum, o) => sum + calculateOrderTotal(o), 0);
});

const cancelledTotal = computed(() => {
  return cancelledOrders.value.reduce((sum, o) => sum + calculateOrderTotal(o), 0);
});

function toggleExpand(id) {
  expandedOrderId.value = expandedOrderId.value === id ? null : id;
}

onMounted(async () => {
  if (!Token) {
    router.push('/auth');
    return;
  }

  try {
    const res = await fetch(`${link}/orders`, {
      headers: {
        'Authorization': `Bearer ${Token}`,
        'shop-id': shopId
      }
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const allOrders = await res.json();

    paidOrders.value = allOrders.filter(o => o.status === 'paid');
    cancelledOrders.value = allOrders.filter(o => o.status === 'cancelled' || o.status === 'rejected');

    if (allOrders.length > 0 && allOrders[0].currency) {
      currency.value = allOrders[0].currency;
    }
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.order-container {
  width: 100vw;
  width: 100dvw;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  box-sizing: border-box;
  background-color: #f8fafc;
}

.order-column {
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  background-color: #f1f5f9;
  min-height: 0;
}

.order-column:last-child {
  border-right: none;
}

.column-header, .column-footer {
  width: 100%;
  padding: 14px 20px;
  background: white;
  z-index: 2;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.column-header {
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.column-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
  font-weight: 700;
}

.column-total-preview {
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.badge-count {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
}

.cancelled-count {
  background: #fee2e2;
  color: #dc2626;
}

.column-footer {
  border-top: 1px solid #e2e8f0;
  font-weight: 600;
  font-size: 0.95rem;
  color: #0f172a;
  background: #ffffff;
}

.footer-amount {
  color: #0284c7;
  font-weight: 700;
}

.cancelled-amount {
  color: #dc2626;
}

.orders-list {
  flex: 1;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  min-height: 0;
  box-sizing: border-box;
}

.order-card {
  width: 94%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.order-card:hover {
  border-color: #0284c7;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.cancelled-card {
  border-color: #fca5a5;
}

.cancelled-card:hover {
  border-color: #dc2626;
}

.card-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.summary-top, .summary-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.bill-number {
  font-size: 0.95rem;
  color: #0f172a;
  font-weight: 700;
}

.order-total {
  margin: 0;
  color: #0284c7;
  font-size: 0.95rem;
}

.cancelled-card .order-total {
  color: #dc2626;
}

.summary-bottom {
  font-size: 0.8rem;
  color: #64748b;
}

.status-badge {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.65rem;
  letter-spacing: 0.5px;
  padding: 3px 8px;
  border-radius: 6px;
}

.status-badge.paid { 
  background: #e0f2fe;
  color: #0284c7; 
}

.status-badge.cancelled { 
  background: #fee2e2;
  color: #dc2626; 
}

.card-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #cbd5e1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  font-size: 0.85rem;
}

.actor-info {
  color: #475569;
  background: #f8fafc;
  padding: 8px 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid #e2e8f0;
}

.info-item span {
  color: #64748b;
}

.items-table-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 4px;
}

.item-row {
  display: flex;
  align-items: flex-start;
  color: #334155;
  width: 100%;
  padding: 4px 0;
}

.header-row {
  font-weight: 600;
  color: #64748b;
  font-size: 0.75rem;
  text-transform: uppercase;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 6px;
  letter-spacing: 0.5px;
}

.item-row-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  border-bottom: 1px solid #f8fafc;
  padding: 4px 0;
}

.col-item {
  flex: 1;
  text-align: left;
}

.item-info-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 8px;
}

.item-name {
  font-weight: 500;
  color: #1e293b;
}

.item-meta-charges {
  display: flex;
  gap: 6px;
}

.meta-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
}

.sc-tag {
  background: #e0f2fe;
  color: #0284c7;
}

.rc-tag {
  background: #fee2e2;
  color: #dc2626;
}

.col-qty {
  width: 45px;
  text-align: center;
}

.item-qty {
  font-weight: 600;
  color: #0f172a;
}

.col-price {
  width: 75px;
  text-align: right;
}

.item-price {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.bill-breakdown {
  margin-top: 4px;
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: #64748b;
  background: #fdfdfd;
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
}

.state-message {
  padding: 50px 20px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
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

/* RESPONSIVE DESIGN */
@media screen and (max-width: 768px) {
  .order-container {
    flex-direction: column;
    overflow-y: auto;
    height: auto;
    min-height: 100vh;
  }

  .order-column {
    width: 100%;
    height: auto;
    min-height: 50vh;
    border-right: none;
    border-bottom: 2px solid #e2e8f0;
  }

  .orders-list {
    max-height: none;
  }
}
</style>
