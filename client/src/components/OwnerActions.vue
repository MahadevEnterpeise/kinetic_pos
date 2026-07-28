<template>
<div class="container">
<div class="head">
<h3>Special Actions</h3>
</div>
<div class="buttons">
<button class="action-btn" @click="today_sales">Today Sales</button>
<button class="action-btn" @click="yesterday_sales">Yesterday Sales</button>
<button class="action-btn" @click="thisweek_sales">This Week</button>
<button class="action-btn" @click="month_sales">This Month</button> 
</div>
</div>
</template>

<script setup>
import { ref } from 'vue';
import { link } from '../assets/Link.js';

const Token = ref(sessionStorage.getItem('userToken'));
const shopId = ref(sessionStorage.getItem('shopId'));

const isGeneratingReport = ref(false);

async function requestReport(period) {
  if (isGeneratingReport.value) return;

  if (!Token.value || !shopId.value) {
    alert("Authentication credentials missing. Please log in again.");
    return;
  }

  isGeneratingReport.value = true;
  alert(`Token${Token.value}`);
  try {
    const response = await fetch(`${link}/owner/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user: Token.value, 
        shopId: shopId.value, 
        period: period // e.g., 'today', 'yesterday', 'week', 'month'
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to generate and email report');
    }

    alert(`Success: ${result.message || 'Sales report CSV generated and emailed successfully!'}`);
  } catch (error) {
    console.error("Report generation error:", error);
    alert(`Error: ${error.message}`);
  } finally {
    isGeneratingReport.value = false;
  }
}

function today_sales() {
  requestReport('today');
}

function yesterday_sales() {
  requestReport('yesterday');
}

function thisweek_sales() {
  requestReport('week');
}

function month_sales() {
  requestReport('month');
}

</script>

<style scoped>
.container {
  width: 90%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: #ffffff;
  border-top: 2px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
}

.head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 15px;
}

.head h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #041528;
}

.buttons {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 15px;
  padding-bottom: 8px;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.buttons::-webkit-scrollbar {
  height: 6px;
}

.buttons::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.action-btn {
  flex: 0 0 auto;
  height: 65px;
  width: 130px;
  border: none;
  border-radius: 10px;
  background-color: #0077B6;
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.action-btn:hover {
  background-color: #0284c7;
}

.action-btn:active {
  transform: scale(0.97);
}
</style>
