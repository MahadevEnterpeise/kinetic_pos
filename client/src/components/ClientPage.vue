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

        <button class="pay-btn" @click="bill()" :disabled="saving">{{ button }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { link } from '../assets/Link';

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
const currency = ref('');
const tempQtys = ref({});
const saving = ref(false);

const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId') || sessionStorage.getItem('shopid');
const clientUid = Token;

onMounted(async () => {
  if (!Token) {
    router.push('/');
    return;
  }

  if (!shopId) {
    console.warn("⚠️ Warning: shopId is missing from sessionStorage!");
  }

  try {
    loading.value = true;
    error.value = null;

    const res = await fetch(`${link}/my-products`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${Token}`,
        'shop-id': shopId,
        'client-uid': clientUid,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`API Error: ${res.status}`);
    }

    const result = await res.json();
    data.value = result.categories;
    currency.value = result.currency;
  } catch (err) {
    console.error("Fetch failed:", err);
    error.value = "Could not load products. Check connection.";
  } finally {
    loading.value = false;
  }
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

  const existingItem = selectedItems.value.find(i => i.id === item.itemid);
  const unitPrice = Number(item.price) || 0;

  if (existingItem) {
    existingItem.qty += finalQty;
    existingItem.price = existingItem.qty * unitPrice;
  } else {
    selectedItems.value.push({
      name: item.name,
      qty: finalQty,
      price: unitPrice * finalQty,
      id: item.itemid,
      itemid: item.itemid
    });
  }

  item.stock -= finalQty;
  tempQtys.value[item.itemid] = '';
};

function remove(rid) {
  const index = selectedItems.value.findIndex(item => item.id === rid);
  if (index !== -1) {
    const removedItem = selectedItems.value[index];
    for (const cat of data.value) {
      const prod = cat.items.find(i => i.itemid === rid);
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

async function bill() {
  if (selectedItems.value.length === 0) {
    alert('Cart is empty');
    return;
  }
  if (saving.value) {
    return;
  }
  saving.value = true;
  button.value = 'Saving...';

  const payload = {
    shopId: shopId,
    uid: clientUid,
    clientUid: clientUid,
    sc: Number(sc.value) || 0,
    rc: Number(rc.value) || 0,
    items: selectedItems.value.map(item => ({
      itemid: item.id || item.itemid,
      id: item.id || item.itemid,
      name: item.name,
      qty: item.qty,
      price: item.price / item.qty
    })),
    status: 'paid'
  };

  try {
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

    router.push({
      name: 'billprint',
      state: {
        arrays: JSON.parse(JSON.stringify(selectedItems.value)),
        rcvalue: Number(rc.value),
        scvalue: Number(sc.value),
        stotal: Number(subtotal.value),
        total: Number(total.value),
        billnum: result.billnum,
        currency: String(currency.value)
      }
    });

    selectedItems.value = [];
    rc.value = 0;
    sc.value = 0;
  } catch (err) {
    console.error("Bill save failed:", err);
    alert("Could not save bill: " + err.message);
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
  background-color: #f0f8ff;
  box-sizing: border-box;
  overflow: hidden;
}

/* Left Workspace Panel */
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.item-box1:hover {
  border-color: #0077B6;
  background-color: rgba(0, 119, 182, 0.04);
  transform: translateY(-2px);
}

.folder-icon {
  font-size: 1.8rem;
}

.folder-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e293b;
  text-align: center;
  word-break: break-word;
}

.item-box {
  width: 140px;
  height: 160px;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.item-box:hover {
  border-color: #0077B6;
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
  color: #1e293b;
  text-align: center;
  word-break: break-word;
}

.stock-label {
  font-size: 0.75rem;
  color: #64748b;
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
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.9rem;
  background: #ffffff;
  color: #1e293b;
  outline: none;
}

#input1[type="number"]:focus {
  border-color: #0077B6;
  box-shadow: 0 0 0 2px rgba(0, 119, 182, 0.15);
}

#b1 {
  width: 100%;
  padding: 6px;
  font-size: 0.85rem;
  background-color: #0077B6;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}

#b1:hover {
  background-color: #026094;
}

.back-box {
  cursor: pointer;
  background-color: #ffffff;
  border: 1px dashed #cbd5e1;
  justify-content: center;
  gap: 6px;
}

.back-box:hover {
  background-color: #f8fafc;
  border-color: #0077B6;
}

#arrow {
  font-size: 1.2rem;
  color: #0077B6;
}

.back-text {
  font-weight: 600;
  color: #334155;
  font-size: 0.9rem;
}

/* Right Billing Panel */
.client-bill {
  width: 40%;
  background-color: #ffffff;
  color: #1e293b;
  border-left: 1px solid #e2e8f0;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.bill-header {
  padding: 15px 20px;
  border-bottom: 1px solid #f1f5f9;
}

#h1 {
  margin: 0;
  font-size: 1.2rem;
  color: #041528;
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
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 8px;
  margin-bottom: 10px;
}

.heads h3 {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
}

#n { width: 50%; text-align: left; }
#q { width: 15%; text-align: center; }
#p { width: 35%; text-align: right; }

.empty-cart {
  text-align: center;
  padding: 30px;
  color: #94a3b8;
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
  border-bottom: 1px solid #f8fafc;
  transition: background 0.15s;
}

.bdata:hover {
  background: rgba(239, 68, 68, 0.06);
  border-radius: 6px;
}

.bdata .n {
  width: 50%;
  text-align: left;
  color: #334155;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bdata .q {
  width: 15%;
  text-align: center;
  color: #64748b;
}

.bdata .p {
  width: 35%;
  text-align: right;
  color: #1e293b;
  font-weight: 600;
}

/* Footer Calculation Section */
.last {
  padding: 15px 20px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
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
  color: #475569;
  font-weight: 500;
}

.input-calc-row input {
  width: 60px;
  padding: 4px;
  text-align: center;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #ffffff;
  color: #1e293b;
  outline: none;
}

.input-calc-row input:focus {
  border-color: #0077B6;
}

.total-row {
  font-size: 1.1rem;
  font-weight: 700;
  color: #041528;
  border-top: 1px dashed #cbd5e1;
  padding-top: 8px;
  margin-top: 2px;
}

.pay-btn {
  background-color: #0077B6;
  color: #ffffff;
  padding: 12px;
  font-size: 1.05rem;
  font-weight: 600;
  width: 100%;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 5px;
}

.pay-btn:hover {
  background-color: #026094;
}

.pay-btn:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}
</style>
