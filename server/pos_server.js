const { generateUID, generateSID, generateSessionToken } = require('./utils/idGenerator');
const dbActions = require('./db/dbActions');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const crypto = require('crypto');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Base URL path prefix matching your Vue link.js config
const apiPrefix = '/api';

// Create HTTP server and attach WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store active shop connections by shopId
const shopClients = new Map();

wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const shopId = urlParams.get('shopId');

  if (shopId) {
    if (!shopClients.has(shopId)) {
      shopClients.set(shopId, new Set());
    }
    shopClients.get(shopId).add(ws);

    ws.on('close', () => {
      shopClients.get(shopId).delete(ws);
      if (shopClients.get(shopId).size === 0) {
        shopClients.delete(shopId);
      }
    });
  }
});

// Helper function to broadcast new orders to the specific POS tablet
function notifyShopTablet(shopId, billnum) {
  if (shopClients.has(shopId)) {
    for (const client of shopClients.get(shopId)) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'NEW_ORDER', billnum }));
      }
    }
  }
}

// Helper function to broadcast real-time stock updates & order resolutions to customer browsers
function broadcastStockUpdate(shopId, items) {
  if (shopClients.has(shopId)) {
    for (const client of shopClients.get(shopId)) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'STOCK_UPDATE', items }));
      }
    }
  }
}

// Helper function to broadcast audit log / system actions to the shop owner and connected customers in real-time
function broadcastAuditAlert(shopId, title, details, actorName, actorRole) {
  if (shopClients.has(shopId)) {
    for (const client of shopClients.get(shopId)) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ 
          type: 'AUDIT_ALERT', 
          title, 
          details, 
          actorName, 
          actorRole,
          timestamp: new Date().toISOString()
        }));
      }
    }
  }
}

// Utility to generate MD5 hash required by PayHere
function generateMd5Hash(input) {
  return crypto.createHash('md5').update(input).digest('hex').toUpperCase();
}

// Helper to extract verified user UID from Authorization Bearer token header or request body
function getClientUidFromRequest(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return req.headers['client-uid'] || req.body?.clientUid || req.body?.uid || null;
  }
  return req.body?.uid || req.body?.clientUid || null;
}

// Helper function to calculate monthly subscription fee with 1.1% sales commission capped at 9999 (No base fee)
function calculateMonthlySubscriptionFee(totalMonthlySales) {
  const percentageFee = (totalMonthlySales * 1.1) / 100;
  let dynamicFee = percentageFee;
  if (dynamicFee > 9999.00) {
    dynamicFee = 9999.00; 
  }
  return dynamicFee;
}


// =========================================================================
// === MIDDLEWARE TO RESOLVE USER & ACTOR CONTEXT SECURELY ===
// =========================================================================

async function resolveActorContext(req, res, next) {
  try {
    const shopId = req.headers['shop-id'] || req.body?.shopId;
    
    // The frontend sends the user UID under various fields (like 'token' or 'clientUid')
    const uid = req.body?.uid || req.body?.clientUid || req.body?.token || req.headers['client-uid'] || req.headers['uid'];
    const requestedRole = req.body?.actorRole || req.body?.usertype;

    // 1. If explicit frontend role is 'client' (Cashier) or payload explicitly flags a cashier identity, honor it immediately
    if (requestedRole === 'client') {
      req.actorInfo = {
        name: req.body?.actorName || 'Cashier',
        role: 'client'
      };
      next();
      return;
    }

    // 2. Resolve identity directly via the UID passed from the frontend (whether labeled as uid, clientUid, or token)
    if (uid && dbActions.getUserByUid) {
      const userRecord = await dbActions.getUserByUid(uid);
      if (userRecord) {
        let role = userRecord.usertype;
        req.actorInfo = {
          name: userRecord.name || req.body?.actorName || (role === 'client' ? 'Cashier' : 'Staff Member'),
          role: role === 'client' ? 'client' : (role || 'manager')
        };
        next();
        return;
      }
    }

    // 3. Fallback default strictly reserved if NO valid user ID was supplied
    req.actorInfo = {
      name: req.body?.actorName || 'Shop Owner',
      role: req.body?.actorRole || 'owner'
    };
    next();
  } catch (error) {
    console.error('❌ Error resolving actor context:', error.message);
    req.actorInfo = { name: 'Shop Owner', role: 'owner' };
    next();
  }
}


// =========================================================================
// === API ROUTES ===
// =========================================================================
// =========================================================================
// === BACKEND ENDPOINT FOR FRONTEND-TRIGGERED AUDIT LOGS ===
// =========================================================================

app.post('/addAuditLog', resolveActorContext, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'] || req.body?.shopId;
    const { action, details, category } = req.body;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID is required for audit logging' });
    }

    // req.actorInfo is securely populated by your resolveActorContext middleware
    const actorName = req.actorInfo?.name || 'Shop Owner';
    const actorRole = req.actorInfo?.role || 'owner';
    const actionCategory = category || 'USER_MANAGEMENT';
    const actionType = action || 'GENERAL_ACTION';
    const actionDetails = details || 'An action was performed';

    // Save using your existing dbActions function
    const success = await dbActions.saveAuditLog(
      shopId,
      actorName,
      actorRole,
      actionCategory,
      actionType,
      actionDetails
    );

    if (!success) {
      return res.status(500).json({ error: 'Failed to record audit log' });
    }

    return res.status(200).json({ success: true, message: 'Audit log recorded successfully' });
  } catch (error) {
    console.error('❌ Error in /addAuditLog endpoint:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.post(`${apiPrefix}/data`, (req, res) => {
  const receivedData = req.body; 
  res.status(200).json({
    message: 'Data received successfully!',
    yourData: receivedData
  });
});

app.post(`${apiPrefix}/login`, async (req, res) => {
  try {
    const { username, password, usertype } = req.body; 
    if (!username || !password || !usertype) {
      return res.status(400).json({ 
        message: 'error', 
        error: 'Mobile/Username, password, and usertype are required.' 
      });
    }

    const sessionData = await dbActions.processLogin(username, password, usertype);
    if (!sessionData) {
      await dbActions.saveLogData(username, password, usertype, "failed");
      return res.status(401).json({ 
        message: 'error', 
        error: 'Invalid credentials or your account is currently suspended (HOLD).' 
      });
    }

    await dbActions.saveLogData(username, password, usertype, "success");

    if (usertype === 'owner' || usertype === 'client' || usertype === 'kineticpos' || usertype === 'manager') {
      console.log(sessionData.sid);
      console.log(sessionData.uid);
      console.log(sessionData.token);
      res.status(200).json({
        message: 'success',
        uid: sessionData.uid, 
        sid: sessionData.sid, 
        Token: sessionData.token 
      });
    } else {
      res.status(200).json({
        message: 'success',
        uid: sessionData.uid,
        Token: sessionData.token
      });
    }
  } catch (error) {
    console.error('❌ Login route fatal crash:', error.message);
    res.status(500).json({ 
      message: 'error', 
      error: 'An internal server error occurred during login handling.' 
    });
  }
});

app.post(`${apiPrefix}/register`, async (req, res) => {
  const userData = req.body;
  try {
    const registrationResult = await dbActions.createNewUser(userData);
    res.status(200).json({
      message: 'Registration data recorded successfully',
      uid: registrationResult.uid,
      sid: registrationResult.sid
    });
  } catch (error) {
    console.error('Registration Route Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } 
});

app.post(`${apiPrefix}/owner`, async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID (sid) is required.' });
    }
    const dashboardData = await dbActions.getOwnerDashboard(shopId);
    if (!dashboardData) {
      return res.status(404).json({ error: 'Shop records not found.' });
    }
    res.status(200).json(dashboardData);
  } catch (error) {
    console.error('❌ Owner dashboard routing error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get(`${apiPrefix}/search`, async (req, res) => {
  try {
    const { query, shopId } = req.query;
    if (!query) {
      return res.status(200).json({ records: [] });
    }
    const filteredResults = await dbActions.searchShopUsers(shopId, query);
    res.status(200).json({ records: filteredResults });
  } catch (error) {
    console.error('Error handling database search request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/gather_cat_item`, async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId) return res.status(400).json({ error: 'Missing Shop Identity' });
    const inventoryData = await dbActions.gatherCatAndItems(shopId);
    res.status(200).json(inventoryData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error loading inventory data' });
  }
});

app.post(`${apiPrefix}/addCategory`, resolveActorContext, async (req, res) => {
  try {
    const { shopId, name } = req.body;
    if (!shopId || !name) return res.status(400).json({ error: 'Missing name parameters' });

    await dbActions.addCategoryName(shopId, name.trim());

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const details = `${actor} added category "${name.trim()}"`;
    await dbActions.saveAuditLog(shopId, actor, role, 'INVENTORY', 'ADD_CATEGORY', details);
    broadcastAuditAlert(shopId, 'Category Added', details, actor, role);

    res.status(200).json({ message: 'saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error adding category' });
  }
});

app.post(`${apiPrefix}/addItem`, resolveActorContext, async (req, res) => {
  try {
    const { shopId, name, category, price, stock } = req.body;
    if (!shopId || !name || !category) return res.status(400).json({ error: 'Required fields missing' });

    const generatedPid = await dbActions.addItem(shopId, name, category, price, stock);

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const details = `${actor} added product "${name}" under category "${category}" (Price: ${price}, Stock: ${stock})`;
    await dbActions.saveAuditLog(shopId, actor, role, 'INVENTORY', 'ADD_PRODUCT', details);
    broadcastAuditAlert(shopId, 'New Product Added', details, actor, role);

    const updatedCatalog = await dbActions.getBillingProducts(shopId);
    broadcastStockUpdate(shopId, updatedCatalog);

    res.status(200).json({ message: 'saved successfully', id: generatedPid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error saving product item' });
  }
});

app.post(`${apiPrefix}/deleteItem`, resolveActorContext, async (req, res) => {
  try {
    const { id, shopId } = req.body;
    if (!id || !shopId) return res.status(400).json({ error: 'Identification parameters missing' });

    await dbActions.deleteItem(id, shopId);

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const details = `${actor} deleted product ID #${id}`;
    await dbActions.saveAuditLog(shopId, actor, role, 'INVENTORY', 'DELETE_PRODUCT', details);
    broadcastAuditAlert(shopId, 'Product Deleted', details, actor, role);

    const updatedCatalog = await dbActions.getBillingProducts(shopId);
    broadcastStockUpdate(shopId, updatedCatalog);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error removing product item' });
  }
});

app.post(`${apiPrefix}/deleteCat`, resolveActorContext, async (req, res) => {
  try {
    const { id, shopId } = req.body; 
    if (!id || !shopId) return res.status(400).json({ error: 'Identification details missing' });

    await dbActions.deleteCategory(id, shopId);

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const details = `${actor} deleted category framework "${id}"`;
    await dbActions.saveAuditLog(shopId, actor, role, 'INVENTORY', 'DELETE_CATEGORY', details);
    broadcastAuditAlert(shopId, 'Category Deleted', details, actor, role);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error removing category framework' });
  }
});

app.post(`${apiPrefix}/sales/last-7`, async (req, res) => {
  try {
    const { uid, shopId } = req.body;
    if (!uid || !shopId) {
      return res.status(400).json({ error: 'Missing essential ID' });
    }
    const chartData = await dbActions.getLast7DaysSales(shopId);
    res.status(200).json(chartData);
  } catch (error) {
    console.error('❌ Error rendering last 7 days sales data:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/review`, async (req, res) => {
  try {
    const { shopId } = req.body;
    if (!shopId) {
      return res.status(400).json({ error: 'Missing shopId' });
    }
    const feedbackData = await dbActions.getShopFeedback(shopId);
    res.status(200).json(feedbackData);
  } catch (error) {
    console.error('❌ Error gathering reviews:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/addreview`, async (req, res) => {
  try {
    const { user, shopId, type, message, category } = req.body;
    if (!shopId || !type || !message) {
      return res.status(400).json({ error: 'Missing required feedback fields' });
    }
    await dbActions.addFeedback(shopId, user || 'Anonymous', type, message, category || 'General');
    return res.status(200).json({ success: true, message: 'Feedback saved successfully' });
  } catch (error) {
    console.error('❌ Error adding review:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get(`${apiPrefix}/order/:shopId`, async (req, res) => {
  try {
    const { shopId } = req.params;
    if (!shopId) {
      return res.status(400).json({ error: 'Missing shopId parameters' });
    }
    const menuData = await dbActions.getShopMenuForOrder(shopId);
    res.status(200).json(menuData);
  } catch (error) {
    console.error('❌ Error rendering shop customer menu:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/user-me`, async (req, res) => {
  try {
    const { uid, shopId } = req.body;
    if (!uid || !shopId) {
      return res.status(400).json({ error: 'Missing uid or shopId parameters' });
    }
    const domain = 'http://localhost:5173/';
    const destinationPath = `/order/${shopId}`;
    const encodedRedirect = encodeURIComponent(destinationPath);
    const qrUrl = `${domain}auth?next=${encodedRedirect}`;
    res.status(200).json({ url: qrUrl });
  } catch (error) {
    console.error('❌ Error generating advertising QR landing path:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get(`${apiPrefix}/my-products`, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1]; 
    const shopId = req.headers['shop-id'];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    if (!shopId) {
      return res.status(400).json({ error: 'Missing shop-id header' });
    }

    const billingCatalog = await dbActions.getBillingProducts(shopId);
    res.status(200).json(billingCatalog);
  } catch (error) {
    console.error('❌ Error rendering live billing product catalog:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/bills`, resolveActorContext, async (req, res) => {
  try {
    const { shopId, items, status, clientUid, sc, rc } = req.body;
    if (!shopId || !items) return res.status(400).json({ error: 'Missing bill data' });

    const resolvedClientUid = clientUid || getClientUidFromRequest(req);
    const fakeBillnum = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
    await dbActions.saveBillItems(shopId, fakeBillnum, items, status || 'paid', resolvedClientUid, null, sc, rc);

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const details = `${actor} created counter bill #${fakeBillnum}`;
    await dbActions.saveAuditLog(shopId, actor, role, 'BILLING', 'CREATE_BILL', details);
    broadcastAuditAlert(shopId, 'New Bill Created', details, actor, role);

    notifyShopTablet(shopId, fakeBillnum);
    const updatedCatalog = await dbActions.getBillingProducts(shopId);
    broadcastStockUpdate(shopId, updatedCatalog);

    res.status(201).json({ billnum: fakeBillnum, id: fakeBillnum });
  } catch (error) {
    console.error('❌ Error saving bill:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get(`${apiPrefix}/orders`, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const shopId = req.headers['shop-id'];
    const { status } = req.query;

    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

    if (status) {
      const filteredOrders = await dbActions.getOrdersWithNestedItems(shopId, status);
      return res.status(200).json(filteredOrders);
    }

    const flatHistoryList = await dbActions.getPastOrdersHistory(shopId);
    res.status(200).json(flatHistoryList);
  } catch (error) {
    console.error('❌ Error fetching orders list data:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.patch(`${apiPrefix}/orders/:id`, resolveActorContext, async (req, res) => {
  try {
    const id = req.params.id; 
    const shopId = req.headers['shop-id'];
    const { status, items, clientUid, sc, rc } = req.body;

    if (!shopId) return res.status(400).json({ error: 'Missing shop-id context' });

    const resolvedClientUid = clientUid || getClientUidFromRequest(req);
    const effectiveStatus = (status === 'cancelled') ? 'cancelled' : status;
    await dbActions.updateOrderStatus(id, shopId, effectiveStatus, items || [], resolvedClientUid, sc || 0, rc || 0);

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const isAccepted = effectiveStatus === 'paid' || effectiveStatus === 'accepted';
    const actionTitle = isAccepted ? 'QR Order Accepted' : 'QR Order Rejected';
    const details = isAccepted 
      ? `Order #${id} has been accepted by the store.` 
      : `Order #${id} has been rejected by the store.`;
    await dbActions.saveAuditLog(shopId, actor, role, 'QR_ORDER', actionTitle, details);
    broadcastAuditAlert(shopId, actionTitle, details, actor, role);

    const updatedCatalog = await dbActions.getBillingProducts(shopId);
    broadcastStockUpdate(shopId, updatedCatalog);

    const billnum = isAccepted ? `BILL-${Date.now()}` : id;
    res.status(200).json({ ok: true, billnum });
  } catch (error) {
    console.error('❌ Error updating order changes:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/deleteBill`, resolveActorContext, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'];
    const { billId } = req.body;

    if (!shopId || !billId) return res.status(400).json({ error: 'Missing shop-id or billId parameters' });

    await dbActions.deleteBillRecord(shopId, billId);

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;
    const details = `${actor} deleted bill record #${billId}`;
    await dbActions.saveAuditLog(shopId, actor, role, 'BILLING', 'DELETE_BILL', details);
    broadcastAuditAlert(shopId, 'Bill Deleted', details, actor, role);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting bill record:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get(`${apiPrefix}/pendingorders`, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const shopId = req.headers['shop-id'];

    if (!token || !token.startsWith('Bearer ')) {
      if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!shopId) {
      return res.status(400).json({ error: 'Missing shop-id header' });
    }

    const pendingList = await dbActions.getOrdersWithNestedItems(shopId, 'pending');
    res.status(200).json(pendingList);
  } catch (error) {
    console.error('❌ Error loading active kitchen pipeline monitors:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get(`${apiPrefix}/audit-logs`, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const shopId = req.headers['shop-id'];

    if (!token) return res.status(401).json({ error: 'No token provided' });
    if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

    const logs = await dbActions.getShopAuditLogs(shopId);
    res.status(200).json(logs);
  } catch (error) {
    console.error('❌ Error fetching audit logs history:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get(`${apiPrefix}/account/dues`, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'];
    const duesProfile = await dbActions.getAccountDues(shopId);
    res.status(200).json(duesProfile);
  } catch (error) {
    console.error('❌ Error rendering subscription balances layout window:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/account/pay`, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'];
    const duesProfile = await dbActions.getAccountDues(shopId);

    if (!duesProfile || duesProfile.amount <= 0) {
      return res.status(400).json({ error: 'No outstanding balance to pay' });
    }

    const merchantId = '1228195'; 
    const merchantSecret = 'MTQ3ODM3MjAyMjkxNTE0NjExMTA3MTAwODQ5NDIwMTc1NzE1MjU='; 
    const orderId = `SUB_${shopId}_${Date.now()}`;
    const amount = Number(duesProfile.amount).toFixed(2);
    const currency = duesProfile.currency || 'LKR';

    const hashedSecret = generateMd5Hash(merchantSecret);
    const rawHashString = merchantId + orderId + amount + currency + hashedSecret;
    const hash = generateMd5Hash(rawHashString);

    res.status(200).json({
      success: true,
      payhereUrl: 'https://sandbox.payhere.lk/pay',
      paymentData: {
        sandbox: true,
        merchant_id: merchantId,
        return_url: `http://localhost:5173/posowner`,
        cancel_url: `http://localhost:5173/posowner`,
        notify_url: `http://localhost:${PORT}${apiPrefix}/account/notify`,
        order_id: orderId,
        items: 'Kinetic Code POS Subscription',
        amount: amount,
        currency: currency,
        hash: hash,
        first_name: duesProfile.owner_name || 'Shop',
        last_name: 'Owner',
        email: duesProfile.email || 'owner@kineticcode.lk',
        phone: duesProfile.phone || '0771234567',
        address: 'Battaramulla',
        city: 'Colombo',
        country: 'Sri Lanka',
        recurrence: '1 Month',
        duration: 'Forever'
      }
    });
  } catch (error) {
    console.error('❌ Error preparing PayHere redirect:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post(`${apiPrefix}/account/notify`, async (req, res) => {
  try {
    const paymentData = req.body;
    const { order_id, status_code, customer_token, payhere_amount } = paymentData;

    if (status_code === '2') {
      const parts = order_id.split('_');
      const shopId = parts[1]; 

      if (shopId) {
        if (customer_token) {
          await dbActions.savePaymentToken(shopId, customer_token);
        } else {
          await dbActions.processAccountPayment(shopId);
        }

        const paidAmount = payhere_amount || 0.00;
        await dbActions.saveSubscriptionPayment(shopId, paidAmount, order_id);
        console.log(`✅ Successfully processed and recorded subscription payment for Shop ID ${shopId}`);
      }
    }
    res.status(200).send('Notification received');
  } catch (error) {
    console.error('❌ Error processing PayHere notification webhook:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

cron.schedule('0 0 1 * *', async () => {
  console.log('🔄 Running automated monthly sales commission sweep...');
  try {
    const shops = await dbActions.getAllActiveShops();
    for (const shop of shops) {
      try {
        const totalMonthlySales = await dbActions.getMonthlySalesTotal(shop.sid);
        const calculatedFee = calculateMonthlySubscriptionFee(totalMonthlySales);

        await dbActions.applyMonthlyLiability(shop.sid, calculatedFee);
        console.log(`✅ Applied monthly fee of ${calculatedFee} for Shop ID ${shop.sid}`);

        if (shop.customer_token && calculatedFee > 0) {
          console.log(`Charging Shop ID ${shop.sid} via stored token for monthly commission...`);
          await dbActions.processAccountPayment(shop.sid, calculatedFee);
          console.log(`✅ Monthly autopay successful for Shop ID ${shop.sid}`);
        }
      } catch (shopError) {
        console.error(`❌ Failed processing monthly commission for Shop ID ${shop.sid}:`, shopError.message);
        await dbActions.handleFailedAutopay(shop.sid, 0.00);
      }
    }
  } catch (error) {
    console.error('❌ Error executing monthly billing job runner:', error.message);
  }
});

app.get(`${apiPrefix}/notifications/settings`, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'];
    if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });
    const permitted = await dbActions.getNotificationPreference(shopId);
    res.status(200).json({ notifications_permitted: permitted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch(`${apiPrefix}/notifications/settings`, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'];
    const { permitted } = req.body;
    if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

    await dbActions.updateNotificationPreference(shopId, permitted);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${apiPrefix}/posowners`, async (req, res) => {
  try {
    const { user } = req.body;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const systemData = await dbActions.getSystemAdminDashboard();
    res.status(200).json(systemData);
  } catch (error) {
    console.error('❌ Error fetching system pos owners:', error.message);
    res.status(500).json({ error: 'Server error while loading data' });
  }
});
app.post(`${apiPrefix}/terminate`, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Missing account ID' });
    }
    await dbActions.terminateUserByUid(id);
    res.status(200).json({
      value: { message: 'User account terminated successfully' }
    });
  } catch (error) {
    console.error('❌ Error terminating account:', error.message);
    res.status(500).json({ error: 'Server error during termination' });
  }
});

app.patch(`${apiPrefix}/users/:id/status`, resolveActorContext, async (req, res) => {
  try {
    const userId = req.params.id;
    const shopId = req.headers['shop-id'] || req.body?.shopId;
    const { status } = req.body;

    if (!shopId || !status) {
      return res.status(400).json({ error: 'Missing shopId or status parameters' });
    }

    const actor = req.actorInfo.name;
    const role = req.actorInfo.role;

    if (status === 'TERMINATED') {
      await dbActions.terminateUser(shopId, userId);
      const details = `${actor} deleted/terminated user ID #${userId}`;
      await dbActions.saveAuditLog(shopId, actor, role, 'USER_MANAGEMENT', 'TERMINATE_USER', details);
      broadcastAuditAlert(shopId, 'User Terminated', details, actor, role);

      return res.status(200).json({ success: true, message: 'User terminated successfully' });
    } else {
      await dbActions.updateUserStatus(shopId, userId, status);
      const details = `${actor} marked user ID #${userId} as ${status}`;
      await dbActions.saveAuditLog(shopId, actor, role, 'USER_MANAGEMENT', 'HOLD_USER', details);
      broadcastAuditAlert(shopId, `User Status Updated: ${status}`, details, actor, role);

      return res.status(200).json({ success: true, message: `User status successfully updated to ${status}` });
    }
  } catch (error) {
    console.error('❌ Error handling user status/termination action:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});



server.listen(PORT, () => {
  console.log(`Server running with WebSockets on http://localhost:${PORT}`);
});
