<template>
<div class="cont">
<h3>Inventory Manager</h3>

<div class="catogory">
<input v-model="newCategoryName" placeholder="New category" />
<button class="cat-btn" @click="addCat">Add category</button>
</div>

<div class="changes">
<input v-model="item" placeholder="New Item" />
<input v-model.number="price" type="number" placeholder="Unit price" />
<input v-model.number="stock" type="number" placeholder="Stock" />
<select v-model="selectedCategory">
<option value="" disabled>Select Category</option>
<option v-for="c in categories" :key="c.id" :value="c.name">
{{ c.name }}
</option>
</select>
<button @click="addItem" class="item-btn">Add item</button>
</div>

<div class="list">
<h4>Categories:</h4>
<span v-if="!opened && !loading" v-for="c in categories" :key="c.id" class="box" @click="openCategory(c.id)">
{{ c.name }}
<button class="del-btn" @click.stop="deletecat(c.id)">Delete</button>
</span>

<button v-if="opened" @click="opened = false">← Back</button>

<div v-if="opened" class="box item-box" v-for="i in filteredItems" :key="i.id">
<div>{{ i.name }}</div>
<div>{{ i.price }} LKR - Stock: {{ i.stock }}</div>
<button class="del-btn" @click.stop="deleteItem(i.id)">Delete</button>
</div>

<div v-if="loading"><AnimationLoader/></div>
</div>
</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { link } from '../assets/Link.js';
import AnimationLoader from './AnimationLoader.vue'

const categories = ref([]);
const items = ref([]);
const opened = ref(false);
const activeCatId = ref(null);

const newCategoryName = ref('');
const selectedCategory = ref('');
const item = ref('');
const price = ref(0);
const stock = ref(0);
const loading = ref(true);

let nextId = 1;
const userToken = sessionStorage.getItem('userToken');
const shopId = sessionStorage.getItem('shopId');

onMounted(async () => {
loading.value = true; 
if (!userToken || !shopId) {
console.error("No userToken/shopId in sessionStorage");
loading.value = false; 
return;
}

try {
const response = await fetch(`${link}/gather_cat_item`, {
method: 'POST',
headers: { 
'Content-Type': 'application/json',
'Authorization': `Bearer ${userToken}`,
'shop-id': shopId,
'client-uid': userToken
},
body: JSON.stringify({ user: userToken, shopId: shopId, uid: userToken })
});

const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Failed');

categories.value = result.categories || [];
items.value = result.items || [];
const maxId = Math.max(0, ...categories.value.map(c => c.id || 0), ...items.value.map(i => i.id || 0));
nextId = maxId + 1;

} catch (err) {
console.error('Failed to load data:', err);
alert('Load error: ' + err.message);
} finally {
loading.value = false; 
}
});

const filteredItems = computed(() => {
if (!activeCatId.value) return [];
const catName = categories.value.find(c => c.id === activeCatId.value)?.name;
return items.value.filter(i => i.category === catName);
});

async function addCat() {
if (!newCategoryName.value.trim()) return alert('Enter category name');
try {
const res = await fetch(`${link}/addCategory`, {
method: 'POST',
headers: { 
'Content-Type': 'application/json',
'Authorization': `Bearer ${userToken}`,
'shop-id': shopId,
'client-uid': userToken
},
body: JSON.stringify({ 
name: newCategoryName.value.trim(), 
shopId, 
uid: userToken 
})
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Failed');

categories.value.push({ id: nextId++, name: newCategoryName.value.trim() });
newCategoryName.value = '';
} catch (err) {
alert('Error: ' + err.message);
}
}

async function addItem() {
if (!item.value || !selectedCategory.value) return alert('Fill item + category');
try {
const res = await fetch(`${link}/addItem`, {
method: 'POST',
headers: { 
'Content-Type': 'application/json',
'Authorization': `Bearer ${userToken}`,
'shop-id': shopId,
'client-uid': userToken
},
body: JSON.stringify({
name: item.value,
category: selectedCategory.value,
price: Number(price.value),
stock: Number(stock.value),
shopId: shopId,
uid: userToken
})
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Failed');

items.value.push({
id: nextId++,
name: item.value,
category: selectedCategory.value,
price: price.value,
stock: stock.value
});

item.value = '';
price.value = 0;
stock.value = 0;
selectedCategory.value = '';
} catch (err) {
alert('Error: ' + err.message);
}
}

async function deleteItem(id) {
if (!confirm('Delete this item?')) return;
try {
const res = await fetch(`${link}/deleteItem`, {
method: 'POST',
headers: { 
'Content-Type': 'application/json',
'Authorization': `Bearer ${userToken}`,
'shop-id': shopId,
'client-uid': userToken
},
body: JSON.stringify({ 
id: id, 
shopId: shopId, 
uid: userToken 
})
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Failed');

items.value = items.value.filter(i => i.id !== id);
} catch (err) {
alert('Error deleting: ' + err.message);
}
}

async function deletecat(id) {
if (!confirm('Delete this category?')) return;
try {
const res = await fetch(`${link}/deleteCat`, {
method: 'POST',
headers: { 
'Content-Type': 'application/json',
'Authorization': `Bearer ${userToken}`,
'shop-id': shopId,
'client-uid': userToken
},
body: JSON.stringify({ 
id: id, 
shopId: shopId, 
uid: userToken 
})
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Failed');

categories.value = categories.value.filter(i => i.id !== id);
} catch (err) {
alert('Error deleting: ' + err.message);
}
}

function openCategory(id) {
activeCatId.value = id;
opened.value = true;
}
</script>

<style scoped>
.cont { max-width: 700px; margin: 0 auto; padding: 20px; font-family: system-ui; }
.catogory, .changes { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
input, select { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; flex: 1; min-width: 120px; }
button { padding: 8px 14px; border: none; border-radius: 6px; background: #2563eb; color: white; cursor: pointer; }
button:hover { background: #1d4ed8; }
.list { margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 8px; display: flex; flex-wrap: wrap; gap: 10px; overflow-y: scroll; height: 250px; }
.box { width: 150px; height: 100px; flex-direction: column; display: flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; background: white; }
.box:hover { background: #eff6ff; }
.item-box { flex-direction: column; gap: 4px; position: relative; }
.del-btn { padding: 4px 8px; font-size: 0.75rem; background: #dc2626; }
.del-btn:hover { background: #b91c1c; }
@media (max-width: 600px) { .catogory,.changes { flex-direction: column; } }
</style>
