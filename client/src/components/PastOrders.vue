<template>
  <div class="order-container">
    <!-- PAID ORDERS COLUMN -->
    <section class="order-column">
      <header class="column-header">
        <h2>Paid Orders</h2>
      </header>

      <div class="orders-list">
        <div v-if="loading" class="state-message">Loading...</div>
        <div v-else-if="paidOrders.length === 0" class="state-message">No paid orders</div>

        <article 
          v-for="order in paidOrders" 
          :key="order.id" 
          class="order-card"
          :class="{ expanded: expandedOrderId === order.id }"
          @click="toggleExpand(order.id)"
        >
          <div class="card-summary">
            <div class="summary-top">
              <h4>Bill #{{ order.billnum || order.id }}</h4>
              <p class="order-total"><b>{{ Number(order.total || 0).toFixed(2) }} {{ currency }}</b></p>
            </div>
            <div class="summary-bottom">
              <span class="order-date">{{ formatDate(order.date) }}</span>
              <span class="status-badge paid">Paid</span>
            </div>
          </div>

          <!-- EXPANDED DETAILS -->
          <div class="card-details" v-if="expandedOrderId === order.id" @click.stop>
            <div class="actor-info" v-if="order.staffName || order.actor">
              <small>Processed by: <b>{{ order.staffName || order.actor || 'Cashier' }}</b></small>
              <small>Ordered by: <b>{{ order.mobile || 'Unknown' }}</b></small>
            </div>

            <div class="items-divider"></div>

            <div class="item-row header-row">
              <span class="col-item">Item</span>
              <span class="col-qty">Qty</span>
              <span class="col-price">Price</span>
            </div>

            <div v-for="(item, idx) in order.items" :key="item.itemid || item.id || idx" class="item-row">
              <span class="col-item item-name" :title="item.name">{{ item.name }}</span>
              <span class="col-qty item-qty">{{ item.qty }}</span>
              <span class="col-price item-price">{{ Number(item.price || 0).toFixed(2) }}</span>
            </div>
          </div>
        </article>
      </div>

      <footer class="column-footer">
        <span>Total Paid</span>
        <span>{{ Number(paidTotal).toFixed(2) }} {{ currency }}</span>
      </footer>
    </section>

    <!-- CANCELLED ORDERS COLUMN -->
    <section class="order-column">
      <header class="column-header">
        <h2>Cancelled Orders</h2>
      </header>

      <div class="orders-list">
        <div v-if="loading" class="state-message">Loading...</div>
        <div v-else-if="cancelledOrders.length === 0" class="state-message">No cancelled orders</div>

        <article 
          v-for="order in cancelledOrders" 
          :key="order.id" 
          class="order-card cancelled-card"
          :class="{ expanded: expandedOrderId === order.id }"
          @click="toggleExpand(order.id)"
        >
          <div class="card-summary">
            <div class="summary-top">
              <h4>Bill #{{ order.billnum || order.id }}</h4>
              <p class="order-total"><b>{{ Number(order.total || 0).toFixed(2) }} {{ currency }}</b></p>
            </div>
            <div class="summary-bottom">
              <span class="order-date">{{ formatDate(order.date) }}</span>
              <span class="status-badge cancelled">Cancelled</span>
            </div>
          </div>

          <!-- EXPANDED DETAILS -->
          <div class="card-details" v-if="expandedOrderId === order.id" @click.stop>
            <div class="actor-info" v-if="order.staffName || order.actorName">
              <small>Rejected by: <b>{{ order.staffName || order.client || 'Cashier' }}</b></small>
              <small>Ordered by: <b>{{ order.mobile || 'Unknown' }}</b></small>
            </div>

            <div class="items-divider"></div>

            <div class="item-row header-row">
              <span class="col-item">Item</span>
              <span class="col-qty">Qty</span>
              <span class="col-price">Price</span>
            </div>

            <div v-for="(item, idx) in order.items" :key="item.itemid || item.id || idx" class="item-row">
              <span class="col-item item-name" :title="item.name">{{ item.name }}</span>
              <span class="col-qty item-qty">{{ item.qty }}</span>
              <span class="col-price item-price">{{ Number(item.price || 0).toFixed(2) }}</span>
            </div>
          </div>
        </article>
      </div>
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

const paidTotal = computed(() => {
  return paidOrders.value.reduce((sum, o) => sum + Number(o.total || 0), 0);
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
    alert(err.message || err);
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
}

.order-column {
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 4px solid #ccc;
  background-color: #f8fafc;
  min-height: 0;
}

.order-column:last-child {
  border-right: none;
}

.column-header, .column-footer {
  width: 100%;
  padding: 16px 20px;
  background: white;
  z-index: 2;
  flex-shrink: 0;
  box-sizing: border-box;
}

.column-header {
  border-bottom: 1px solid #eee;
}

.column-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #0f172a;
}

.column-footer {
  border-top: 2px solid #148;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  color: #0f172a;
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
  width: 92%;
  border: 2px solid #148;
  border-radius: 8px;
  background: #fff;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  box-sizing: border-box;
}

.cancelled-card {
  border-color: #d32f2f;
}

.order-card:hover {
  background: #f1f5f9;
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

.summary-top h4 {
  margin: 0;
  font-size: 1rem;
  color: #041528;
}

.order-total {
  margin: 0;
  color: #0f172a;
}

.summary-bottom {
  font-size: 0.85rem;
  color: #555;
}

.order-date {
  margin: 0;
}

.status-badge {
  font-weight: bold;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.5px;
}

.status-badge.paid { color: #0284c7; }
.status-badge.cancelled { color: #dc2626; }

.card-details {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #cbd5e1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  font-size: 0.85rem;
}

.actor-info {
  color: #475569;
  background: #f1f5f9;
  padding: 6px 10px;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.items-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 4px 0;
}

.item-row {
  display: flex;
  align-items: center;
  color: #334155;
  width: 100%;
}

.header-row {
  font-weight: 600;
  color: #64748b;
  font-size: 0.75rem;
  text-transform: uppercase;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 4px;
  letter-spacing: 0.5px;
}

.col-item {
  flex: 1;
  text-align: left;
}

.col-qty {
  width: 50px;
  text-align: center;
}

.col-price {
  width: 70px;
  text-align: right;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-qty {
  font-weight: 600;
  color: #0f172a;
}

.item-price {
  font-variant-numeric: tabular-nums;
}

.state-message {
  padding: 40px;
  text-align: center;
  color: #888;
  font-size: 0.95rem;
}
</style>
