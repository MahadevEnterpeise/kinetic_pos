<template>
<div class="portal-container">
  <!-- Sticky Header Bar -->
  <header class="portal-header">
    <div class="header-main">
      <h1>{{ activeTab === 'catalog' ? 'Menu & Stock' : 'Bills & Status' }}</h1>
      <div class="header-badges">
        <span class="badge-pill">Shop: <strong>{{ shopId }}</strong></span>
        <span v-if="customerMobile" class="badge-pill">📱 {{ customerMobile }}</span>
      </div>
    </div>

    <!-- Navigation Toggle Tabs -->
    <nav class="nav-tabs">
      <button 
        type="button" 
        :class="{ active: activeTab === 'catalog' }" 
        @click="activeTab = 'catalog'"
      >
        🛍️ Menu & Stock
      </button>
      <button 
        type="button" 
        :class="{ active: activeTab === 'orders' }" 
        @click="activeTab = 'orders'"
      >
        📋 Bills & Status
        <span v-if="pendingCount > 0" class="tab-indicator"></span>
      </button>
    </nav>
  </header>

  <!-- TAB 1: CATALOG & LIVE STOCK -->
  <main v-show="activeTab === 'catalog'" class="tab-pane">
    <div v-if="loadingCatalog" class="loading-state">
      <div class="spinner"></div>
      <p>Loading live stock...</p>
    </div>

    <div v-else-if="catalogError" class="error-box">
      <p>⚠️ {{ catalogError }}</p>
      <button class="primary-btn" @click="fetchCatalog">Try Again</button>
    </div>

    <div v-else class="catalog-content">
      <div v-if="products.length === 0" class="empty-box">
        <p>No active products available for this shop.</p>
        <button class="primary-btn" @click="fetchCatalog" style="margin-top: 10px;">Reload</button>
      </div>

      <div class="products-grid">
        <div 
          v-for="product in products" 
          :key="product.pid || product.id" 
          class="product-card"
          :class="{ 'disabled-card': Number(product.stock) <= 0 }"
        >
          <div class="product-details">
            <h3>{{ product.name }}</h3>
            <p class="product-price">{{ Number(product.price || 0).toFixed(2) }} {{ currency }}</p>
            <span class="stock-status" :class="Number(product.stock) > 0 ? 'stock-ok' : 'stock-empty'">
              {{ Number(product.stock) > 0 ? `Stock: ${product.stock}` : 'Out of Stock' }}
            </span>
          </div>

          <div class="product-actions" v-if="Number(product.stock) > 0">
            <div class="counter-group">
              <button @click="decrementCart(product)" :disabled="getCartQty(product) === 0">-</button>
              <span>{{ getCartQty(product) }}</span>
              <button @click="incrementCart(product)" :disabled="getCartQty(product) >= Number(product.stock)">+</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Checkout Cart Footer -->
    <footer class="cart-floating-footer" v-if="cartItems.length > 0">
      <div class="cart-info">
        <span class="cart-count">{{ totalCartCount }} items selected</span>
        <span class="cart-sum">Total: {{ cartTotal.toFixed(2) }} {{ currency }}</span>
      </div>
      <button class="checkout-btn" @click="placeOrder" :disabled="submittingOrder">
        {{ submittingOrder ? 'Placing Order...' : 'Place Order 🚀' }}
      </button>
    </footer>
  </main>

  <!-- TAB 2: BILLS & ORDER STATUS -->
  <main v-show="activeTab === 'orders'" class="tab-pane">
    <div class="section-heading">
      <h2>Order History & Status</h2>
      <button class="refresh-action-btn" @click="fetchCustomerOrders" :disabled="loadingOrders">
        🔄 Refresh
      </button>
    </div>

    <div v-if="loadingOrders" class="loading-state">
      <div class="spinner"></div>
      <p>Syncing your bills...</p>
    </div>

    <div v-else-if="ordersError" class="error-box">
      <p>⚠️ {{ ordersError }}</p>
      <button class="primary-btn" @click="fetchCustomerOrders">Try Again</button>
    </div>

    <div v-else class="orders-container">
      <!-- PENDING BILLS -->
      <section class="order-group">
        <div class="group-title">
          <h3>Pending Review</h3>
          <span class="count-pill pending-pill">{{ pendingOrders.length }}</span>
        </div>

        <div v-if="pendingOrders.length === 0" class="empty-box small">
          <p>No active pending bills.</p>
        </div>

        <div class="orders-list">
          <article 
            v-for="order in pendingOrders" 
            :key="order.id || order.billnum" 
            class="order-item-card border-pending"
            @click="toggleExpand(order.id)"
          >
            <div class="order-row-top">
              <span class="bill-number">Bill #{{ order.billnum }}</span>
              <span class="status-pill pending">Pending</span>
            </div>
            <div class="order-row-bottom">
              <span class="order-timestamp">{{ formatDate(order.date) }}</span>
              <span class="order-amount">{{ Number(order.total).toFixed(2) }} {{ order.currency || currency }}</span>
            </div>

            <!-- Expanded Order Line Items (View Only - Delete functionality removed) -->
            <div class="order-details-drawer" v-if="expandedId === order.id" @click.stop>
              <div class="drawer-header">
                <span>Item</span>
                <span>Qty</span>
                <span>Subtotal</span>
              </div>
              <div v-for="(item, idx) in order.items" :key="idx" class="drawer-row">
                <span class="item-title-col">{{ item.name }}</span>
                <span class="item-qty-col">{{ item.qty }}</span>
                <span class="item-price-col">{{ (item.price * item.qty).toFixed(2) }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- PAST BILLS -->
      <section class="order-group">
        <div class="group-title">
          <h3>Past Bills & Updates</h3>
          <span class="count-pill history-pill">{{ pastOrders.length }}</span>
        </div>

        <div v-if="pastOrders.length === 0" class="empty-box small">
          <p>No past order history found.</p>
        </div>

        <div class="orders-list">
          <article 
            v-for="order in pastOrders" 
            :key="order.id || order.billnum" 
            class="order-item-card"
            :class="getCardBorderClass(order.status)"
            @click="toggleExpand(order.id)"
          >
            <div class="order-row-top">
              <span class="bill-number">Bill #{{ order.billnum }}</span>
              <span class="status-pill" :class="order.status">{{ order.status }}</span>
            </div>
            <div class="order-row-bottom">
              <span class="order-timestamp">{{ formatDate(order.date) }}</span>
              <span class="order-amount">{{ Number(order.total).toFixed(2) }} {{ order.currency || currency }}</span>
            </div>

            <!-- Expanded Order Line Items -->
            <div class="order-details-drawer" v-if="expandedId === order.id" @click.stop>
              <div class="drawer-header">
                <span>Item</span>
                <span>Qty</span>
                <span>Subtotal</span>
              </div>
              <div v-for="(item, idx) in order.items" :key="idx" class="drawer-row">
                <span class="item-title-col">{{ item.name }}</span>
                <span class="item-qty-col">{{ item.qty }}</span>
                <span class="item-price-col">{{ (item.price * item.qty).toFixed(2) }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { link } from '../assets/Link.js';

const route = useRoute();

const shopId = computed(() => route.params.shopId || sessionStorage.getItem('shopId') || '');
const clientUid = sessionStorage.getItem('userToken');

const activeTab = ref('catalog');
const currency = ref('LKR');
const customerMobile = ref('');

// Catalog data
const products = ref([]);
const cart = ref({});
const loadingCatalog = ref(true);
const catalogError = ref('');
const submittingOrder = ref(false);

// Orders data
const rawOrders = ref([]);
const loadingOrders = ref(true);
const ordersError = ref('');
const expandedId = ref(null);

const formatDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
};

const pendingOrders = computed(() => rawOrders.value.filter(o => o.status === 'pending'));
const pastOrders = computed(() => rawOrders.value.filter(o => o.status !== 'pending'));
const pendingCount = computed(() => pendingOrders.value.length);

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

function getCardBorderClass(status) {
  if (status === 'paid') return 'border-paid';
  if (status === 'cancelled' || status === 'rejected') return 'border-danger';
  return '';
}

// Cart management
function getCartQty(product) {
  const identifier = product.pid || product.id;
  return cart.value[identifier] || 0;
}

function incrementCart(product) {
  const identifier = product.pid || product.id;
  const current = cart.value[identifier] || 0;
  if (current < Number(product.stock)) {
    cart.value[identifier] = current + 1;
  }
}

function decrementCart(product) {
  const identifier = product.pid || product.id;
  const current = cart.value[identifier] || 0;
  if (current > 1) {
    cart.value[identifier] = current - 1;
  } else {
    delete cart.value[identifier];
  }
}

const cartItems = computed(() => {
  return Object.keys(cart.value).map(cartKey => {
    const product = products.value.find(p => String(p.pid || p.id) === String(cartKey));
    const resolvedPid = product ? (product.pid || product.id) : cartKey;
    
    return {
      pid: resolvedPid,
      name: product ? product.name : 'Item',
      price: product ? Number(product.price || 0) : 0,
      qty: cart.value[cartKey]
    };
  });
});

const totalCartCount = computed(() => Object.values(cart.value).reduce((a, b) => a + b, 0));
const cartTotal = computed(() => cartItems.value.reduce((sum, item) => sum + (item.price * item.qty), 0));

// API Fetchers
async function fetchCatalog() {
  const currentShopId = shopId.value;
  if (!currentShopId) {
    catalogError.value = 'Shop ID is missing.';
    loadingCatalog.value = false;
    return;
  }

  try {
    loadingCatalog.value = true;
    catalogError.value = '';

    const res = await fetch(`${link}/billing/products`, {
      headers: {
        'shop-id': currentShopId,
        'Authorization': `Bearer ${clientUid}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Failed to load stock.');
    }
    
    const data = await res.json();
    products.value = Array.isArray(data) ? data : (data.products || []);

    if (products.value.length > 0 && products.value[0].currency) {
      currency.value = products.value[0].currency;
    }
  } catch (err) {
    catalogError.value = err.message;
    products.value = [];
  } finally {
    loadingCatalog.value = false;
  }
}

async function fetchCustomerOrders() {
  const currentShopId = shopId.value;
  if (!clientUid) {
    ordersError.value = 'Missing session userToken.';
    loadingOrders.value = false;
    return;
  }

  try {
    loadingOrders.value = true;
    ordersError.value = '';

    const response = await fetch(`${link}/customer/orders`, {
      headers: {
        'Authorization': `Bearer ${clientUid}`,
        'shop-id': currentShopId,
        'client-uid': clientUid
      }
    });

    if (!response.ok) throw new Error('Failed to fetch bills.');
    const data = await response.json();
    rawOrders.value = Array.isArray(data) ? data : [];

    if (rawOrders.value.length > 0 && rawOrders.value[0].mobile) {
      customerMobile.value = rawOrders.value[0].mobile;
    }
  } catch (err) {
    ordersError.value = err.message;
  } finally {
    loadingOrders.value = false;
  }
}

async function placeOrder() {
  if (cartItems.value.length === 0) return;
  const currentShopId = shopId.value;

  if (!clientUid) {
    alert('Session userToken missing. Please log in.');
    return;
  }

  try {
    submittingOrder.value = true;
    const payload = { items: cartItems.value, sc: 0, rc: 0 };

    const res = await fetch(`${link}/customer/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientUid}`,
        'shop-id': currentShopId,
        'client-uid': clientUid
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Order submission failed.');

    alert('Order placed successfully!');
    cart.value = {};
    activeTab.value = 'orders';
    fetchCustomerOrders();
    fetchCatalog();
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    submittingOrder.value = false;
  }
}

onMounted(() => {
  fetchCatalog();
  fetchCustomerOrders();
});
</script>

<style scoped>
.portal-container {
  width: 100vw;
  min-height: 100vh;
  background-color: #f8fafc;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  font-family: system-ui, -apple-system, sans-serif;
  padding-bottom: 90px;
}

.portal-header {
  background: #ffffff;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.portal-header h1 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
  font-weight: 700;
}

.header-badges {
  display: flex;
  gap: 6px;
  align-items: center;
}

.badge-pill {
  font-size: 0.7rem;
  background: #f1f5f9;
  padding: 3px 7px;
  border-radius: 6px;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.nav-tabs {
  display: flex;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 8px;
  gap: 4px;
}

.nav-tabs button {
  flex: 1;
  background: transparent;
  border: none;
  padding: 7px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  pointer-events: auto;
}

.nav-tabs button.active {
  background: #ffffff;
  color: #0284c7;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.tab-indicator {
  position: absolute;
  top: 6px;
  right: 10px;
  width: 7px;
  height: 7px;
  background: #eab308;
  border-radius: 50%;
}

.tab-pane {
  padding: 14px;
  max-width: 700px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.product-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
}

.product-card.disabled-card {
  opacity: 0.55;
  background: #f1f5f9;
}

.product-details h3 {
  margin: 0 0 3px 0;
  font-size: 0.9rem;
  color: #1e293b;
}

.product-price {
  margin: 0 0 5px 0;
  font-weight: 700;
  color: #0284c7;
  font-size: 0.85rem;
}

.stock-status {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  text-transform: uppercase;
}

.stock-ok { background: #dcfce7; color: #15803d; }
.stock-empty { background: #fee2e2; color: #dc2626; }

.product-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #f1f5f9;
  padding-top: 6px;
}

.counter-group {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 2px 5px;
}

.counter-group button {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
}

.cart-floating-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #ffffff;
  border-top: 1px solid #cbd5e1;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 -4px 10px rgba(0,0,0,0.05);
  z-index: 101;
}

.cart-info {
  display: flex;
  flex-direction: column;
}

.cart-info span:first-child {
  font-size: 0.7rem;
  color: #64748b;
}

.cart-sum {
  font-weight: 700;
  font-size: 0.9rem;
  color: #0f172a;
}

.checkout-btn {
  background: #16a34a;
  color: white;
  border: none;
  padding: 7px 14px;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.8rem;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-heading h2 {
  margin: 0;
  font-size: 0.95rem;
  color: #1e293b;
}

.refresh-action-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  color: #334155;
}

.orders-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.order-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-title h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #334155;
}

.count-pill {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
}

.pending-pill { background: #fef08a; color: #854d0e; }
.history-pill { background: #e2e8f0; color: #334155; }

.orders-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.order-item-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
}

.border-pending { border-left: 4px solid #eab308; }
.border-paid { border-left: 4px solid #0284c7; }
.border-danger { border-left: 4px solid #dc2626; }

.order-row-top, .order-row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-row-bottom {
  margin-top: 3px;
  font-size: 0.8rem;
}

.bill-number {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.85rem;
}

.order-timestamp {
  color: #64748b;
  font-size: 0.7rem;
}

.order-amount {
  font-weight: 700;
  color: #0f172a;
}

.status-pill {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
}

.status-pill.pending { background: #fef9c3; color: #854d0e; }
.status-pill.paid { background: #e0f2fe; color: #0284c7; }
.status-pill.cancelled, .status-pill.rejected { background: #fee2e2; color: #dc2626; }

.order-details-drawer {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
}

.drawer-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: #334155;
  padding: 1px 0;
}

.item-title-col { flex: 1; }
.item-qty-col { width: 25px; text-align: center; font-weight: 600; }
.item-price-col { width: 50px; text-align: right; font-weight: 600; }

.loading-state, .error-box, .empty-box {
  padding: 30px 15px;
  text-align: center;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-box.small { padding: 12px; font-size: 0.75rem; }

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e2e8f0;
  border-top-color: #0284c7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.primary-btn {
  background: #0284c7;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.75rem;
}
</style>
