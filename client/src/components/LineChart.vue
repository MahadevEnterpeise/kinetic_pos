<template>
<div class="chart-container">
<apexchart
type="area"
height="200"
:options="chartOptions"
:series="series"
v-if="!isLoading"></apexchart>
<animation-loader :message="message1" size="md" v-if="isLoading"/>
</div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AnimationLoader from './AnimationLoader.vue';
import { link } from '../assets/Link';

const message1 = ref('');
const isLoading = ref(true);
const series = ref([{
name: 'Revenue',
data: [0, 0, 0, 0, 0, 0, 0] 
}]);

const chartOptions = ref({
chart: {
toolbar: { show: false },
zoom: { enabled: false },
},
colors: ['#2563eb'], 
dataLabels: { enabled: false },
stroke: {
curve: 'smooth',
width: 3
},
fill: {
type: 'gradient',
gradient: {
shadeIntensity: 1,
opacityFrom: 0.5,
opacityTo: 0,
stops: [0, 90, 100]
}
},
xaxis: {
categories: ['...', '...', '...', '...', '...', '...', '...'], 
},
grid: {
borderColor: '#f1f1f1',
}
});

const fetchSalesData = async (uid, shopId) => {
// Guard clause: If there's no uid in sessionStorage, don't ping the server
if (!uid) {
console.error("No user");
return;
}

try {
message1.value = '7 day report fetching';
const response = await fetch(`${link}/sales/last-7`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ uid: uid, shopId: shopId })
});
const result = await response.json();

if (response.ok) {
isLoading.value = false;

// 1. Update the chart data array
series.value = [{
name: 'Revenue',
data: result.data
}];

// 2. Completely re-assign chartOptions to force ApexCharts to re-render the X-axis categories
chartOptions.value = {
...chartOptions.value,
xaxis: {
...chartOptions.value.xaxis,
categories: result.categories
}
};
}
} catch (error) {
console.error("Failed fetching sales data:", error);
}
};

onMounted(() => {
const targetUid = sessionStorage.getItem('userToken');
// Fallback to 'GLOBAL' if shopId is missing, allowing the admin dashboard to fetch aggregated sales across all shops
const shopId = sessionStorage.getItem('shopId') || sessionStorage.getItem('shopid') || 'GLOBAL';
fetchSalesData(targetUid, shopId);
alert(shopId);
});

</script>

<style scoped>
.chart-container {
background: white;
padding: 20px;
border-radius: 12px;
box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
</style>
