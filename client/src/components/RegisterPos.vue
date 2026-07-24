<template>
<div class="regauth">
<div class="register">
<form @submit.prevent="getid">
<h3>Make Your identity</h3>
<div class="input-group">
<label>Name:</label>
<input type="text" placeholder="name please" v-model="registerForm.name" required>
</div>
<div class="input-group">
<label>UserName:</label>
<input type="text" placeholder="username please" v-model="registerForm.username" required>
</div>
<div class="input-group">
<label>Password:</label>
<input type="password" placeholder="Password please" v-model="registerForm.password" required>
</div>
<div class="input-group">
<label>Address:</label>
<input type="text" placeholder="Address" v-model="registerForm.address" required>
</div>
<div class="input-group">
<label>Mobile:</label>
<input type="tel" placeholder="Mobile" v-model="registerForm.mobile" required>
</div>
<div class="input-group">
<label>Landline:</label>
<input type="tel" placeholder="Landline(optional)" v-model="registerForm.landline">
</div>
<div class="input-group">
<label>E-Mail:</label>
<input type="email" placeholder="E-Mail" v-model="registerForm.email" required>
</div>
<div class="input-group">
<label>User:</label>
<select v-model="registerForm.usertype" required>
<option value="owner">owner</option>
<option value="manager">manager</option>
<option value="client">client</option>
<option value="customer">customer</option>
</select>
</div>
<div class="buttons">
<button class="submit-btn" type="submit">Confirm</button>
<button id="about" type="button">About Us</button>
</div>
</form>
</div>
<div class="current">
<RegisteredData/>
</div>
</div>
</template>

<script setup>
import { ref } from 'vue';
import { link } from '../assets/Link.js';
import RegisteredData from './RegisteredData.vue';

const shopId = sessionStorage.getItem('shopId');
const userToken = sessionStorage.getItem('userToken');

const registerForm = ref({
name: '',
username: '',
password: '',
address: '',
mobile: '',
landline: '',
email: '',
usertype: ''
});

async function getid() {
  try {
    // 1. Register the new user
    const response = await fetch(`${link}/register`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
        'shop-id': shopId,
        'client-uid': userToken
      },
      body: JSON.stringify({
        name: registerForm.value.name,
        username: registerForm.value.username,
        mobile: registerForm.value.mobile,
        password: registerForm.value.password,
        usertype: registerForm.value.usertype,
        address: registerForm.value.address,
        email: registerForm.value.email,
        landline: registerForm.value.landline,
        shopId: shopId
        // Notice: We intentionally do NOT send uid here to avoid messing up registration
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'register failed');
    }

    // 2. Trigger the Audit Log API call right after successful registration
    await fetch(`${link}/addAuditLog`, { // Replace '/addAuditLog' with your actual backend audit log endpoint route
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
        'shop-id': shopId,
        'client-uid': userToken
      },
      body: JSON.stringify({
        shopId: shopId,
        action: 'REGISTER_USER',
        details: `Created new ${registerForm.value.usertype} account for ${registerForm.value.name}`,
        userToken: userToken
      })
    }).catch(auditErr => {
      console.warn('Audit log failed to record, but registration succeeded:', auditErr);
    });

    alert(data.message || 'User registered successfully!'); 

    // Clear form inputs
    registerForm.value = {
      name: '',
      username: '',
      password: '',
      address: '',
      mobile: '',
      landline: '',
      email: '',
      usertype: ''
    };

  } catch (error) {
    alert('Error: ' + error.message);
    console.error('Registration network error:', error);
  }
}

</script>

<style scoped>
.regauth{
width:90%;
display: flex;
flex-direction: row;
align-items: start;
justify-content: start;
}
.register {
width: 50%;
display: flex;
flex-direction: column;
align-items: center;
justify-content: start;
padding: 10px;
overflow-y: scroll;
height: 250px;
}
.current{
width: 50%;
}
.input-group {
display: flex;
flex-direction: column;
align-items: center;
justify-content: start;
text-align: left;
}
label {
width: 100%;
text-align: left;
}
input, select {
padding: 10px;
border-radius: 12px;
border: 1px solid #cbd5e1;
width: 100%;
box-sizing: border-box;
}
.buttons {
width: 100%;
display: flex;
flex-direction: row-reverse;
align-items: center;
justify-content: start;
gap: 10px;
}
.submit-btn {
width: 100%;
height: 50px;
background-image: linear-gradient(120deg, rgb(4, 4, 44), rgb(12, 12, 66), rgb(4, 4, 44));
border-radius: 999px;
border: none;
color: aliceblue;
margin-top: 5px;
cursor: pointer;
}
#about {
width: 100%;
height: 50px;
border: 2px solid black;
border-radius: 999px;
cursor: pointer;
background: transparent;
}
</style>
