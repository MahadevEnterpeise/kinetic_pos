<template>
<div class="user-management-container">
<!-- Search Header -->
<div class="search-box-wrapper">
<input 
type="text" 
v-model="searchquery" 
placeholder="Search by name or ID..." 
class="search-input"
/>
</div>

<!-- Data Table Display -->
<div class="table-card">
<div class="table-header"> 
<div class="col id-col">ID</div>
<div class="col name-col">Name</div>
<div class="col date-col">Date Joined</div>
<div class="col actions-col">Actions</div>
</div>

<div class="table-body">
<div v-if="isLoading" class="status-msg">Searching database...</div>
<div v-else-if="results.length === 0 && searchquery" class="status-msg">No records found.</div>
<div v-else-if="results.length === 0" class="status-msg text-muted">Type something to search linked users...</div>

<div 
v-for="item in results" 
:key="item.id" 
class="table-row"
>
<div class="col id-col font-mono">{{ item.id }}</div>
<div class="col name-col font-weight-bold">{{ item.name }}</div>
<div class="col date-col">{{ item.date }}</div>
<div class="col actions-col">
<button class="action-btn hold-btn" @click="updateUserStatus(item, 'HOLD')">Hold</button>
<button class="action-btn terminate-btn" @click="updateUserStatus(item, 'TERMINATED')">Terminate</button>
</div>
</div>
</div>
</div>
</div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { link } from '../assets/Link.js';

const searchquery = ref('');
const shopId = sessionStorage.getItem('shopId');
const userToken = sessionStorage.getItem('userToken');
const results = ref([]);
const isLoading = ref(false);

let debounceTimeout = null;

watch(searchquery, (newQuery) => {
clearTimeout(debounceTimeout);

if (!newQuery.trim()) {
results.value = [];
return;
}

debounceTimeout = setTimeout(async () => {
isLoading.value = true;
try {
const response = await fetch(`${link}/search?query=${encodeURIComponent(newQuery)}&shopId=${shopId}`, {
method: 'GET',
headers: {
'Content-Type': 'application/json'
}
});

if (!response.ok) {
throw new Error('Search request failed');
}

const data = await response.json();
results.value = data.records || []; 
} catch (error) {
console.error('Error during live database query:', error);
results.value = [];
} finally {
isLoading.value = false;
}
}, 300); 
});

async function updateUserStatus(item, newStatus) {
  const actionText = newStatus === 'HOLD' ? 'put this user on Hold' : 'Terminate (delete) this user record';
  if (!confirm(`Are you sure you want to ${actionText}?`)) return;

  try {
    let res;
    if (newStatus === 'TERMINATED') {
      res = await fetch(`${link}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
          'shop-id': shopId,
          'client-uid': userToken
        },
        body: JSON.stringify({ 
          id: item.id 
        })
      });
    } else {
      res = await fetch(`${link}/users/${item.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'shop-id': shopId,
          'Authorization': `Bearer ${userToken}`,
          'client-uid': userToken
        },
        body: JSON.stringify({ 
          status: newStatus,
          uid: userToken 
        })
      });
    }

    if (!res.ok) throw new Error('Failed to process action');

    // Trigger Audit Log API call using item.name instead of item.id
    await fetch(`${link}/addAuditLog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
        'shop-id': shopId,
        'client-uid': userToken
      },
      body: JSON.stringify({
        shopId: shopId,
        action: newStatus === 'HOLD' ? 'HOLD_USER' : 'TERMINATE_USER',
        details: `Marked user ${item.name} as ${newStatus}`,
        category: 'USER_MANAGEMENT',
        uid: userToken
      })
    }).catch(auditErr => {
      console.warn('Audit log failed to record, but action succeeded:', auditErr);
    });

    results.value = results.value.filter(u => u.id !== item.id);
    
    // Updated success alert to use the name
    const successMsg = newStatus === 'TERMINATED' 
      ? `User ${item.name} successfully terminated` 
      : `User ${item.name} successfully marked as ${newStatus}`;
    alert(successMsg);

  } catch (err) {
    console.error('Action error:', err);
    alert('Operation failed. Please try again.');
  }
}


</script>

<style scoped>
.user-management-container {
display: flex;
flex-direction: column;
align-items: center;
width: 100%;
padding: 20px;
box-sizing: border-box;
background-color: #f8fafc;
height: 100%;
font-family: inherit;
}

.search-box-wrapper {
width: 100%;
max-width: 800px;
margin-bottom: 20px;
}

.search-input {
width: 100%;
padding: 12px 16px;
font-size: 1rem;
border: 1px solid #cbd5e1;
border-radius: 8px;
outline: none;
background-color: #ffffff;
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
transition: border-color 0.2s, box-shadow 0.2s;
box-sizing: border-box;
}

.search-input:focus {
border-color: #0077B6;
box-shadow: 0 0 0 3px rgba(0, 119, 182, 0.15);
}

.table-card {
width: 100%;
max-width: 800px;
background: #ffffff;
border: 1px solid #e2e8f0;
border-radius: 12px;
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
overflow: hidden;
display: flex;
flex-direction: column;
max-height: 70vh;
}

.table-header {
display: flex;
background-color: #f1f5f9;
border-bottom: 2px solid #e2e8f0;
font-weight: 600;
color: #475569;
font-size: 0.85rem;
text-transform: uppercase;
letter-spacing: 0.05em;
padding: 12px 16px;
}

.table-body {
overflow-y: auto;
display: flex;
flex-direction: column;
}

.table-row {
display: flex;
align-items: center;
padding: 12px 16px;
border-bottom: 1px solid #f1f5f9;
font-size: 0.9rem;
color: #1e293b;
transition: background-color 0.15s;
}

.table-row:hover {
background-color: #f8fafc;
}

.col {
padding: 0 8px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;
}

.id-col {
flex: 1.2;
}

.name-col {
flex: 1.5;
}

.date-col {
flex: 1;
color: #64748b;
}

.actions-col {
flex: 1.3;
display: flex;
gap: 8px;
justify-content: flex-end;
}

.font-mono {
font-family: monospace;
font-size: 0.85rem;
color: #64748b;
}

.font-weight-bold {
font-weight: 600;
}

.status-msg {
padding: 30px;
text-align: center;
color: #94a3b8;
font-size: 0.95rem;
}

.action-btn {
padding: 6px 12px;
font-size: 0.8rem;
font-weight: 500;
border-radius: 6px;
border: none;
cursor: pointer;
transition: background-color 0.2s, transform 0.1s;
}

.action-btn:active {
transform: scale(0.96);
}

.hold-btn {
background-color: #fef08a;
color: #854d0e;
}

.hold-btn:hover {
background-color: #fde047;
}

.terminate-btn {
background-color: #fee2e2;
color: #991b1b;
}

.terminate-btn:hover {
background-color: #fecaca;
}
</style>
