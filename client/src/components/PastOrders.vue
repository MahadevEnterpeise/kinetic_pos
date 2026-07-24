<style scoped>
.order-container{
    width: 100dvw;
    display: flex;
    flex-direction: row;
    height: 100dvh;
    overflow: hidden; /* 1. Kill page scroll */
}
.paid-orders,.cancelled-orders{
    width: 50%;
    border-right: 4px solid #ccc;
    height: 100%;
    display: flex;
    flex-direction: column; /* 2. Header + List + Footer stack */
    align-items:center;
    min-height: 0; /* 3. KEY: Allows children to overflow */
    
}
.cancelled-orders{ border-right: none; }

.paid-head,.paid-foot{
    width: 100%;
    padding: 16px 20px;
    background: white;
    z-index: 1;
    flex-shrink: 0; /* 4. Stop header/footer from shrinking */
}
.paid-head{
    position: sticky;
    top: 0;
    border-bottom: 1px solid #eee;
}
.paid-foot{ /* 5. Only Paid gets this */
    position: sticky;
    bottom: 0;
    border-top: 2px solid #148;
    font-weight: 700;
    display: flex;
    justify-content: space-between;
}

/* 6. THIS IS THE SCROLL WRAPPER */
.orders-list{
    height: 200px;
    width: 100%;
    overflow-y: auto; /* 7. Only this scrolls */
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    align-items:center;
    gap: 8px;
    padding: 8px 0 20px 0;
    min-height: 0; /* 8. KEY: Allows this div to shrink and scroll */
}

.order-card{
    border: 2px solid #148;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 92%;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
    flex-shrink: 0;
}
.data{ display: flex; flex-direction: row; align-items:center; justify-content: space-between; width: 95%; padding: 0 10px; }
.status{ display: flex; flex-direction: row; align-items: center; justify-content: space-between; width: 95%; padding: 0 10px; font-size: 0.9rem; color: #555; }
.loading{ padding: 40px; }
</style>

<template>
    <div class="order-container">
        <!-- PAID SIDE -->
        <div class="paid-orders">
            <div class="paid-head">
                <h2>Paid Orders</h2>
            </div>

            <div class="orders-list"> <!-- 9. NEW WRAPPER = SCROLLS -->
                <div v-if="loading" class="loading">Loading...</div>
                <div v-else-if="paidOrders.length === 0" class="loading">No paid orders</div>

                <div v-for="order in paidOrders" :key="order.id" class="order-card">
                    <div class="data">
                        <h4>{{ order.name }}</h4>
                        <p>{{ order.units }} unit</p>
                        <p>{{ order.total }}{{ currency }}</p>
                    </div>
                    <div class="status">
                        <p>{{ formatDate(order.date) }}</p>
                        <p><b>paid</b></p>
                    </div>
                </div>
            </div>

            <div class="paid-foot"> <!-- 10. Sticky Footer Total -->
                <span>Total Paid</span>
                <span>{{ paidTotal }}{{ currency }}</span>
            </div>
        </div>

        <!-- CANCELLED SIDE -->
        <div class="cancelled-orders">
            <div class="paid-head">
                <h2>Cancelled Orders</h2>
            </div>

            <div class="orders-list"> <!-- 11. SAME WRAPPER = SCROLLS -->
                <div v-if="loading" class="loading">Loading...</div>
                <div v-else-if="cancelledOrders.length === 0" class="loading">No cancelled orders</div>

                <div v-for="order in cancelledOrders" :key="order.id" class="order-card">
                    <div class="data">
                        <h4>{{ order.name }}</h4>
                        <p>{{ order.units }} unit</p>
                        <p>{{ order.total }}{{ currency }}</p>
                    </div>
                    <div class="status">
                        <p>{{ formatDate(order.date) }}</p>
                        <p><i>cancelled</i></p>
                    </div>
                </div>
            </div>
            <!-- No footer here -->
        </div>
    </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'; // 12. added computed
import { useRouter } from 'vue-router';
import {link} from '../assets/Link.js'
const router = useRouter();
const apiPrefix = link;

const paidOrders = ref([]);
const cancelledOrders = ref([]);
const loading = ref(true);
const currency = ref('LKR');
const Token = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId');

const formatDate = (iso) => new Date(iso).toLocaleDateString('en-CA');

// 13. NEW: Computed total for paid side only
const paidTotal = computed(() => {
  return paidOrders.value.reduce((sum, o) => sum + Number(o.total || 0), 0);
});

onMounted(async () => {
    if(!Token){
        router.push('/');
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
        cancelledOrders.value = allOrders.filter(o => o.status === 'cancelled');

        if(allOrders.length > 0) currency.value = allOrders[0].currency || 'LKR';

    } catch (err) {
        alert(err.message||err);
        
    } finally {
        loading.value = false;
    }
});
</script>