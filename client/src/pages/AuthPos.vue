<template>
<div class="container">
  <div class="auth-card">
    <div class="auth-header">
      <h2>Kinetic POS</h2>
      <p>Sign in to your account</p>
    </div>

    <form @submit.prevent="getin" class="auth-form">
      <h3>Confirm Your Identity</h3>

      <div class="input-group">
        <label>Username</label>
        <input type="text" placeholder="Enter your username" v-model="loginForm.username" required>
      </div>

      <div class="input-group">
        <label>Password</label>
        <input type="password" placeholder="Enter your password" v-model="loginForm.password" required>
      </div>

      <div class="input-group">
        <label>User Type</label>
        <select v-model="loginForm.usertype" required>
          <option disabled value="">Select user type</option>
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="client">Client</option>
          <option value="customer">Customer</option>
          <option value="kineticpos">KineticPOS</option>
        </select>
      </div>

      <div class="buttons">
        <button class="submit-btn" type="submit">Confirm</button>
      </div>
    </form>
  </div>
</div>
</template>

<script setup>
import { ref } from 'vue';
import { link } from '../assets/Link.js'; 
import { useRouter } from 'vue-router';

const router = useRouter();
const DUMMY_SHOP_ID = 274903; // Fixed 6 digit

const loginForm = ref({
  username: '',
  password: '',
  usertype: ''
});

async function getin() {
  try {
    const response = await fetch(`${link}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: loginForm.value.username, 
        password: loginForm.value.password, 
        usertype: loginForm.value.usertype 
      })
    });

    if (!response.ok) throw new Error('Authentication failed');
    const data = await response.json();

    if (data.uid) {
      sessionStorage.setItem('userToken', data.uid);
      if (data.sid) sessionStorage.setItem('shopId', data.sid);
    } else {
      router.push('/');
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    let redirectUrl = urlParams.get('next');

    if (redirectUrl) {
      const match = redirectUrl.match(/\/order\/([a-zA-Z0-9]+)/);
      if (match) {
        window.location.href = redirectUrl;
      } else {
        window.location.href = `/order/${DUMMY_SHOP_ID}`;
      }
    } else {
      switch (loginForm.value.usertype) {
        case 'owner':
          router.push('/posowner');
          break;
        case 'client':
          router.push('/client');
          break;
        case 'kineticpos':
          router.push('/kineticpos');
          break;
        case 'manager':
          router.push('/manager-dashboard');
          break;
        default:
          router.push('/');
          break;
      }
    }
  } catch (error) {
    console.error('Error during authentication:', error);
    alert(error);
  }
}
</script>

<style scoped>
html, body {
  margin: 0;
  padding: 0;
  height: 100vh;
  background-color: #f0f8ff;
}

.container {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f8ff;
  box-sizing: border-box;
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-header {
  text-align: center;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 15px;
}

.auth-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #041528;
}

.auth-header p {
  margin: 5px 0 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.auth-form h3 {
  margin: 0 0 5px 0;
  font-size: 1.1rem;
  color: #041528;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

label {
  font-weight: 500;
  font-size: 0.9rem;
  color: #334155;
  text-align: left;
  width: 100%;
}

input, select {
  width: 100%;
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.95rem;
  background-color: #ffffff;
  color: #1e293b;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus, select:focus {
  outline: none;
  border-color: #0077B6;
  box-shadow: 0 0 0 3px rgba(0, 119, 182, 0.15);
}

.buttons {
  width: 100%;
  margin-top: 10px;
}

.submit-btn {
  width: 100%;
  height: 46px;
  background-color: #0077B6;
  border-radius: 8px;
  border: none;
  color: #ffffff;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.submit-btn:hover {
  background-color: #026094;
}
</style>
