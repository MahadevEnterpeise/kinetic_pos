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
<p id="white">No product categories available (Check shop ID / backend connection)</p>
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
<h1 id="h1">Current Bill</h1>
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
<!-- Order Type & Payment Type Selectors -->
<div class="calc-row select-row">
<span>Order Type</span>
<select v-model="orderType" class="pos-select">
<option value="table">Table</option>
<option value="takeaway">Takeaway</option>
<option value="delivery">Delivery</option>
</select>
</div>

<div class="calc-row select-row">
<span>Payment Type</span>
<select v-model="paymentType" class="pos-select">
<option value="cash">Cash</option>
<option value="card">Card</option>
<option value="online">Online</option>
</select>
</div>

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
<button class="pay-btn" @click="bill('paid')" :disabled="saving">{{ button }}</button>
</div>
</div>
</div>
</div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { link, printReceipt } from '../assets/Link';

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

const orderType = ref('takeaway');
const paymentType = ref('cash');
const shopProfile = ref({
  shop_name: 'KINETIC POS',
  s_mobile: '',
  s_address: ''
});

const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId') || sessionStorage.getItem('shopid');

async function fetchProducts() {
  try {
    loading.value = true;
    error.value = null;

    console.log("Fetching products with shopId:", shopId);

    const res = await fetch(`${link}/my-products`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${Token}`,
        'shop-id': shopId,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);

    const result = await res.json();
    console.log("Fetched products result:", result);

    data.value = result.categories || [];
    currency.value = result.currency || 'LKR';

    shopProfile.value = {
      shop_name: result.shopname || result.shop_name || 'KINETIC POS',
      s_mobile: result.s_mobile || result.mobile || '',
      s_address: result.s_address || result.address || ''
    };
  } catch (err) {
    console.error('Failed to load products from server:', err);
    error.value = "Could not load products from server.";
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!Token) {
    router.push('/');
    return;
  }
  await fetchProducts();
});

const subtotal = computed(() => {
  return selectedItems.value.reduce((sum, item) => sum + item.price, 0);
});

function opens(a) {
  const category = data.value.find(c => c.id === a);
  if (category) {
    openeditems.value = category.items || [];
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

async function printKOT(items, billNum) {
  try {
    const kotPayload = {
      arrays: JSON.parse(JSON.stringify(items)),
      billnum: billNum,
      orderType: orderType.value.toUpperCase(),
      paymentType: paymentType.value.toUpperCase(),
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      shopname: shopProfile.value.shop_name,
      s_mobile: shopProfile.value.s_mobile,
      s_address: shopProfile.value.s_address
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
  button.value = 'Saving...';

  const payload = {
    shopId: shopId,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0,
    orderType: orderType.value,
    paymentType: paymentType.value,
    items: selectedItems.value.map(item => ({
      pid: item.id || item.itemid,
      name: item.name,
      qty: item.qty,
      price: item.unitPrice
    })),
    status: statusType
  };

  try {
    const res = await fetch(`${link}/bills`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Token}`,
        'Content-Type': 'application/json',
        'shop-id': shopId
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Save failed: ${res.status}`);
    }

    const result = await res.json();
    const billnumResult = result.billnum || `BILL-${Date.now().toString().slice(-6)}`;

    if (result.shopname || result.shop_name) shopProfile.value.shop_name = result.shopname || result.shop_name;
    if (result.s_mobile || result.mobile) shopProfile.value.s_mobile = result.s_mobile || result.mobile;
    if (result.s_address || result.address) shopProfile.value.s_address = result.s_address || result.address;

    await printKOT(selectedItems.value, billnumResult);

    if (statusType === 'paid') {
      const printPayload = {
        arrays: JSON.parse(JSON.stringify(selectedItems.value)),
        rcvalue: Number(rc.value),
        scvalue: Number(sc.value),
        stotal: Number(subtotal.value),
        total: Number(total.value),
        billnum: billnumResult,
        currency: currency.value,
        shopname: shopProfile.value.shop_name,
        s_mobile: shopProfile.value.s_mobile,
        s_address: shopProfile.value.s_address,
        orderType: orderType.value,
        paymentType: paymentType.value,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      };

      await printReceipt(printPayload);
    }

    selectedItems.value = [];
    rc.value = 0;
    sc.value = 0;

    await fetchProducts(); // Refresh live stock from server
  } catch (err) {
    console.error("Bill save failed:", err);
    alert(err.message || "Could not save bill. Please check your connection.");
  } finally {
    saving.value = false;
    button.value = 'Save & Pay';
  }
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
overflow-y: scroll;
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

.pos-select {
width: 110px;
padding: 4px 6px;
border: 1px solid #475569;
border-radius: 6px;
font-size: 0.85rem;
background: #1e293b;
color: #f8fafc;
outline: none;
}

.pos-select:focus {
border-color: #38bdf8;
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

.pay-btn {
background-color: #0284c7;
color: #ffffff;
padding: 12px;
font-size: 0.95rem;
font-weight: 600;
width: 100%;
border: none;
border-radius: 8px;
cursor: pointer;
transition: background-color 0.2s;
}

.pay-btn:hover {
background-color: #0369a1;
}

.pay-btn:disabled {
background-color: #334155;
cursor: not-allowed;
}

#white {
color: white;
}
</style>
