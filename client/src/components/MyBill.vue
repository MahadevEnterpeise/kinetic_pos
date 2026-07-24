<style scoped>
.hold-wrapper { width: 100dvw; height: 100dvh; display: flex; align-items: center; justify-content: center; background: #111; color: #fff; font-family: system-ui; }
.card { width: 90%; max-width: 420px; background: #1a1a1a; border: 2px solid; border-radius: 16px; padding: 24px; text-align: center; transition: border-color 0.3s ease; }
.warn { font-size: 3rem; margin-bottom: 8px; }
h2 { margin: 0 0 12px; transition: color 0.3s ease; }
.amount { font-size: 2.5rem; font-weight: 800; margin: 16px 0; color: #ffb400; }
.meta { color: #aaa; font-size: 0.9rem; margin-bottom: 20px; }
.btn { width: 100%; padding: 16px; border: none; border-radius: 12px; background: #00b37e; color: #000; font-weight: 800; font-size: 1.1rem; cursor: pointer; }
.btn:disabled { background: #444; cursor: not-allowed; }
.small { font-size: 0.8rem; color: #aaa; margin-top: 12px; }

/* Dynamic Theme Classes */
.theme-green { border-color: #00b37e; }
.theme-green h2 { color: #00b37e; }

.theme-day-2 { border-color: #ffb400; }
.theme-day-2 h2 { color: #ffb400; }

.theme-day-3 { border-color: #c00; }
.theme-day-3 h2 { color: #ff4d4d; }
</style>

<template>
<div class="hold-wrapper">
<div class="card" :class="cardThemeClass">
<div class="warn">{{ streakDay >= 3 ? '⛔' : '⚠️' }}</div>
<h2>{{ statusTitle }}</h2>
<p>Due: {{ currency }} {{ (Number(outstanding) || 0).toFixed(2) }}</p>


<p class="meta">Streak: Day {{ streakDay }} • Shop: {{ shopId }}</p>

<button class="btn" @click="payNow" :disabled="paying">
{{ paying ? 'Redirecting...' : 'Pay Now' }}
</button>

<p class="small">After payment, access restores instantly.</p>
</div>
</div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { link } from '../assets/Link';

const router = useRouter();
const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId');

const outstanding = ref(0);
const streakDay = ref(0);
const currency = ref('LKR');
const paying = ref(false);

// Dynamic border and heading color theme based on streak day
const cardThemeClass = computed(() => {
  if (streakDay.value <= 1) return 'theme-green'; // Day 0 and Day 1 are green
  if (streakDay.value === 2) return 'theme-day-2';
  return 'theme-day-3'; // Day 3 or higher
});

// Dynamic heading message based on streak count
const statusTitle = computed(() => {
  if (streakDay.value === 0) return 'Account Active (Day 0)';
  if (streakDay.value === 1) return 'Payment Reminder (Day 1)';
  if (streakDay.value === 2) return 'Warning: Due Soon (Day 2)';
  return 'Account On Hold (Day 3+)';
});

onMounted(async () => {
  try {
    const res = await fetch(`${link}/account/dues`, {
      headers: { 'Authorization': `Bearer ${Token}`, 'shop-id': shopId }
    });
    const data = await res.json();
    outstanding.value = Number(data.amount);
    streakDay.value = data.streakDay;
    currency.value = data.currency || 'LKR';
  } catch (err) {
    console.error('Error fetching account dues:', err);
  }
});

async function payNow(){
if(paying.value) return;
paying.value = true;
try {
const res = await fetch(`${link}/account/pay`, {
method: 'POST',
headers: { 'Authorization': `Bearer ${Token}`, 'shop-id': shopId }
});
const data = await res.json();
if (!res.ok || !data.success) throw new Error(data.error || 'Payment processing failed');

// Ensure window.payhere is loaded
if (typeof payhere === 'undefined') {
    throw new Error('PayHere SDK failed to load. Check your internet connection or script tag.');
}

// Configure PayHere event handlers
payhere.onCompleted = function onCompleted(orderId) {
    console.log("Payment completed. OrderID:" + orderId);
    alert('Payment successful! Access restored.');
    router.push('/posowner');
};

payhere.onDismissed = function onDismissed() {
    console.log("Payment dismissed");
    paying.value = false;
};

payhere.onError = function onError(error) {
    console.log("Error:" + error);
    alert('Payment Error: ' + error);
    paying.value = false;
};

// Add "sandbox: true" explicitly to the payment parameters object
const paymentObject = {
    ...data.paymentData,
    sandbox: true 
};

// Open the official PayHere secure popup window
payhere.startPayment(paymentObject);

} catch (err) {
alert('Error: ' + err.message);
paying.value = false;
}
}


</script>
