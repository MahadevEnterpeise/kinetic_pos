<style scoped>
.container {
  display: flex;
  justify-content: start;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f0f4f8;
  color: #333;
}

.bills {
  background: #ffffff;
  width: 100%;
  max-width: 400px;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 50, 100, 0.1);
  border-top: 8px solid #1e40af;
}

header {
  text-align: center;
  margin-bottom: 20px;
}

header h1 {
  margin: 0;
  color: #1e3a8a;
  text-transform: uppercase;
  letter-spacing: 1px;
}

header p {
  margin: 5px 0;
  font-style: italic;
  color: #64748b;
}

.bhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px dashed #cbd5e1;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

.bhead h4 {
  margin: 0;
  color: #1e40af;
}

.bhead p {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
}

.bill {
  margin-bottom: 20px;
}

.thead {
  display: flex;
  font-weight: bold;
  background-color: #eff6ff;
  color: #1e40af;
  padding: 8px;
  border-radius: 4px;
}

.tdata {
  display: flex;
  padding: 10px 8px;
  border-bottom: 1px solid #f1f5f9;
}

.n { flex: 2; }
.q { flex: 1; text-align: center; }
.p { flex: 1; text-align: right; }

.bfoot {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bfoot1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bfoot1 h6 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 500;
  color: #475569;
}

.bfoot1 p {
  margin: 0;
  font-weight: 600;
}

.bfoot1:last-of-type {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 2px solid #1e40af;
  color: #1e40af;
  font-size: 1.1rem;
}

#atlast {
  text-align: center;
  margin-top: 30px;
  padding-top: 15px;
  border-top: 1px solid #e2e8f0;
}

#atlast h6 {
  margin: 0;
  font-size: 1rem;
  color: #1e3a8a;
}

#atlast p {
  margin-top: 5px;
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: start;
  justify-content: center;
  overflow-y: auto;
}
</style>

<template>
<div class="container" @click="returnToClient">
<div class="bills" @click.stop>
<header>
<h1>{{ shopdata.shopname }}</h1>
<p>{{ shopdata.caption }}</p>
</header>
<div class="bhead">
<h4>Bill-{{ billnum || 1 }}</h4>
<p>2026/06/05</p>
</div>
<div class="bill">
<div class="thead">
<div class="n">Name</div>
<div class="q">Qty</div>
<div class="p">Price</div>
</div>
<div class="tdata" v-for="i in receivedItems" :key="i.id">
<div class="n">{{ i.name }}</div>
<div class="q">{{ i.qty }}</div>
<div class="p">{{ i.price }}</div>
</div>
</div>
<div class="bfoot">
<span class="bfoot1">
<h6>SubTotal</h6>
<p>{{ stotal }} {{ currency }}</p>
</span>
<span class="bfoot1">
<h6>Servicecharge</h6>
<p>{{ sc }}%</p>
</span>
<span class="bfoot1">
<h6>Discount</h6>
<p>{{ rc }}%</p>
</span>
<span class="bfoot1">
<h6>Total</h6>
<p>{{ total }} {{ currency }}</p>
</span>
<span id="atlast">
<h6>Thank you come again</h6>
<p>Powered By Kinetic Code</p>
</span>
</div>
</div>
</div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const receivedItems = ref([]);
const rc = ref(null);
const sc = ref(null);
const stotal = ref(null);
const total = ref(null);
const billnum = ref(null);
const currency = ref(null);

function returnToClient() {
  router.push('/client'); // Replace with your actual cashier page route path if different
}

onMounted(() => {
  const state = history.state;

  if (state) {
    receivedItems.value = state.arrays;
    rc.value = state.rcvalue;
    sc.value = state.scvalue;
    stotal.value = state.stotal;
    total.value = state.total;
    billnum.value = state.billnum;
    currency.value = state.currency;
  } else {
    console.warn("No state data found! Did you refresh the page?");
    returnToClient();
  }
});

const shopdata = ({
  shopname: 'I Bar',
  caption: 'ice cream shop',
});
</script>
