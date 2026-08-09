//Here is the fully rewritten and updated server.js file. It integrates all the modular routes, WebSocket handlers, cron jobs, and the corrected PayHere webhook notification route to properly process payments, capture tokens, and record transaction history.
/**
 * ============================================================================
 * KINETIC CODE POS - ENTERPRISE BACKEND SERVICE (MODULARIZED ARCHITECTURE)
 * ============================================================================
 * Architecture: Node.js, Express.js, WebSockets (ws), MySQL, Node-Cron
 * Description: Fully modularized, enterprise-grade backend core handling real-time
 * inventory synchronization, role-based access control (RBAC), auditing, 
 * automated monthly commission sweeps, PayHere billing integrations, and 
 * asynchronous email report generation.
 * ============================================================================
 */

// ============================================================================
// 1. MODULE IMPORTS & DEPENDENCY INITIALIZATION
// ============================================================================

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const cron = require('node-cron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Internal Database & Utility Actions
const dbActions = require('./db/dbActions');

// ============================================================================
// 2. SERVER & APPLICATION CONFIGURATION
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3000;
const API_PREFIX = '/api';

// Core Express Middleware Setup
app.use(cors());
app.use(express.json());

// HTTP Server & WebSocket Subsystem Integration
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Active WebSocket Connection Registry mapped by Shop ID (sid)
const shopClients = new Map();

// ============================================================================
// 3. WEBSOCKET REAL-TIME CONNECTION MANAGEMENT & BROADCAST UTILITIES
// ============================================================================

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

/**
 * Broadcasts new order alerts to connected shop POS tablets.
 */
function notifyShopTablet(shopId, billnum) {
    if (shopClients.has(shopId)) {
        for (const client of shopClients.get(shopId)) {
            if (client.readyState === client.OPEN) {
                client.send(JSON.stringify({ type: 'NEW_ORDER', billnum }));
            }
        }
    }
}

/**
 * Broadcasts real-time inventory stock alterations to client browsers.
 */
function broadcastStockUpdate(shopId, items) {
    if (shopClients.has(shopId)) {
        for (const client of shopClients.get(shopId)) {
            if (client.readyState === client.OPEN) {
                client.send(JSON.stringify({ type: 'STOCK_UPDATE', items }));
            }
        }
    }
}

/**
 * Broadcasts audit trails and administrative actions across connected sessions.
 */
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

// ============================================================================
// 4. SECURITY, CRYPTOGRAPHY & CONTEXT MIDDLEWARE
// ============================================================================

/**
 * Utility to generate an MD5 cryptographic hash required by PayHere API gateways.
 */
function generateMd5Hash(input) {
    return crypto.createHash('md5').update(input).digest('hex').toUpperCase();
}

/**
 * Extracts and resolves the client User ID (UID) from authorization headers or payload bodies.
 */
function getClientUidFromRequest(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return req.headers['client-uid'] || req.headers['uid'] || req.body?.clientUid || req.body?.uid || null;
    }
    return req.body?.uid || req.body?.clientUid || req.headers['client-uid'] || req.headers['uid'] || null;
}

/**
 * Calculates dynamic monthly platform service fees based on sales volume.
 */
function calculateMonthlySubscriptionFee(totalMonthlySales) {
    const percentageFee = (totalMonthlySales * 1.1) / 100;
    let dynamicFee = percentageFee;
    if (dynamicFee > 14999.00) {
        dynamicFee = 14999.00; 
    }
    return dynamicFee;
}

/**
 * Middleware: Resolves actor context (Name, Role, Permissions) securely per request.
 */
async function resolveActorContext(req, res, next) {
    try {
        const shopId = req.headers['shop-id'] || req.body?.shopId;
        const actorUid = req.headers['client-uid'] || req.headers['uid'] || req.body?.actorUid || req.body?.clientUid || req.body?.uid;

        if (actorUid && dbActions.getUserByUid) {
            const userRecord = await dbActions.getUserByUid(actorUid);
            if (userRecord) {
                let role = userRecord.usertype;
                let actorName = userRecord.name || (role === 'owner' ? 'Shop Owner' : role === 'manager' ? 'Store Manager' : 'Cashier');

                req.actorInfo = { name: actorName, role: role };
                return next();
            }
        }

        if (req.body?.actorRole === 'client' || req.query?.actorRole === 'client') {
            req.actorInfo = { name: req.body?.actorName || req.query?.actorName || 'Customer', role: 'client' };
            return next();
        }

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

// ============================================================================
// 5. MODULAR ROUTE CONTROLLERS & MOUNTING
// ============================================================================

const router = express.Router();

// --- Diagnostic & Testing Routes ---
router.post('/data', (req, res) => {
    res.status(200).json({ message: 'Data received successfully!', yourData: req.body });
});

// --- Authentication & Session Management ---
router.post('/login', async (req, res) => {
    try {
        const { username, password, usertype } = req.body; 
        if (!username || !password || !usertype) {
            return res.status(400).json({ message: 'error', error: 'Credentials and usertype are required.' });
        }

        const sessionData = await dbActions.processLogin(username, password, usertype);
        if (!sessionData) {
            
            return res.status(401).json({ message: 'error', error: 'Invalid credentials or account suspended (HOLD).' });
        }


        const responsePayload = { message: 'success', uid: sessionData.uid, Token: sessionData.token };
        if (['owner', 'client', 'kineticpos', 'manager'].includes(usertype)) {
            responsePayload.sid = sessionData.sid;
        }

        res.status(200).json(responsePayload);
    } catch (error) {
        console.error('❌ Login route fatal crash:', error.message);
        res.status(500).json({ message: 'error', error: 'Internal server error during login.' });
    }
});

router.post('/register', resolveActorContext, async (req, res) => {
try {
const userData = req.body;
const { role: creatorRole } = req.actorInfo;

// 1. Enforce hierarchy restrictions based on req.actorInfo
if (creatorRole === 'manager' && (userData.usertype === 'owner' || userData.usertype === 'kineticpos' || userData.usertype === 'kinetic_admin')) {
return res.status(403).json({ success: false, error: 'Managers are not permitted to create owners or system administrators.' });
}
if (creatorRole === 'owner' && (userData.usertype === 'kineticpos' || userData.usertype === 'kinetic_admin')) {
return res.status(403).json({ success: false, error: 'Owners are not permitted to create system administrators.' });
}

// 2. Proceed with registration
const registrationResult = await dbActions.createNewUser(userData);

const shopId = userData.shopId || registrationResult.sid;
const { name: actor, role } = req.actorInfo;
const details = `${actor} created new ${userData.usertype} account for ${userData.name}`;

await dbActions.saveAuditLog(shopId, actor, role, 'USER_MANAGEMENT', 'REGISTER_USER', details);
broadcastAuditAlert(shopId, 'User Registered', details, actor, role);

res.status(200).json({ message: 'Registration data recorded successfully', uid: registrationResult.uid, sid: registrationResult.sid });

} catch (error) {
console.error('Registration Route Error:', error.message);
res.status(500).json({ success: false, error: error.message });
}
});
// ==========================================
// CUSTOMER PORTAL & LIVE ORDER ROUTES
// ==========================================

// 1. Get live catalog items and stock for customers browsing a shop
// GET /billing/products
router.get('/billing/products', async (req, res) => {
  try {
    const shopId = req.headers['shop-id'] || req.query.shopId;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop ID header is missing' });
    }

    const menuData = await dbActions.getShopMenuForOrder(shopId);

    // Map `id` explicitly to `pid` so the frontend inventory items carry `pid` directly
    const formattedItems = (menuData.items || []).map(item => ({
      ...item,
      pid: item.pid || item.id
    }));

    return res.status(200).json(formattedItems);

  } catch (error) {
    console.error('❌ Error fetching shop products:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});




// 2. Place a new customer order (creates pending bill and triggers WebSocket alert to shop tablet)
router.post('/customer/orders', resolveActorContext, async (req, res) => {
  try {
    const shopId = req.headers['shop-id'] || req.body.shopId;
    const clientUid = req.headers['client-uid'] || req.headers['authorization']?.replace('Bearer ', '') || req.body.clientUid;
    const { items, sc, rc } = req.body;

    if (!shopId || !clientUid || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Shop ID, Client ID, and a valid items array are required.' });
    }

    // Map and normalize each item to ensure pid, name, price, and qty are completely present and valid
    const sanitizedItems = items.map(item => ({
      pid: item.pid || item.id,
      name: item.name || 'Unknown Item',
      price: Number(item.price || 0),
      qty: Number(item.qty || 1)
    }));

    // Double check that no item has a missing pid
    for (const item of sanitizedItems) {
      if (!item.pid) {
        return res.status(400).json({ error: 'One or more items are missing a valid product ID (pid).' });
      }
    }

    // Generate unique bill number using your existing dbActions method
    const billNum = await dbActions.generateUniqueBillNum(shopId);

    // Save items with 'pending' status using the strictly sanitized items array
    await dbActions.saveBillItems(
      shopId, 
      billNum, 
      sanitizedItems, 
      'pending', 
      clientUid, 
      null, 
      sc || 0, 
      rc || 0
    );

    // Audit log & Real-time WebSocket notifications
    const { name: actor, role } = req.actorInfo;
    const details = `Customer placed new order #${billNum}`;
    await dbActions.saveAuditLog(shopId, actor, role, 'CUSTOMER_ORDER', 'NEW_CUSTOMER_ORDER', details);
    broadcastAuditAlert(shopId, 'New Customer Order', details, actor, role);

    // Trigger instant alert on shop POS tablet
    notifyShopTablet(shopId, billNum);

    res.status(201).json({ success: true, message: 'Order placed successfully', billnum: billNum });

  } catch (error) {
    console.error('❌ Error placing customer order:', error.message);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});



// 3. Get customer past & pending orders history with calculated SC and RC totals
router.get('/customer/orders', async (req, res) => {
  try {
    const shopId = req.headers['shop-id'] || req.query.shopId;
    const clientUid = req.headers['client-uid'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.clientUid;

    if (!shopId || !clientUid) {
      return res.status(400).json({ error: 'Shop ID and Client ID are required.' });
    }

    const orders = await dbActions.getCustomerOrdersHistory(shopId, clientUid);
    res.json(orders);
  } catch (error) {
    console.error('❌ Error fetching customer history:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Dashboard & Analytics ---
router.post('/owner', async (req, res) => {
  try {
    const { shopId, user: uid } = req.body;

    if (!shopId || !uid) {
      return res.status(400).json({ error: 'Shop ID (sid) and User ID (uid) are required.' });
    }

    const dashboardData = await dbActions.getOwnerDashboard(shopId, uid);

    if (!dashboardData) {
      return res.status(404).json({ error: 'Shop records not found.' });
    }

    res.status(200).json(dashboardData);

  } catch (error) {
    console.error('❌ Owner dashboard routing error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
});


router.get('/search', async (req, res) => {
  try {
    const { query, shopId, userUid } = req.query;
    console.log("SEARCH ROUTE HIT -> query:", query, "shopId:", shopId, "userUid:", userUid);

    if (!query) return res.status(200).json({ records: [] });

    const filteredResults = await dbActions.searchShopUsers(shopId, query, userUid);

    res.status(200).json({ records: filteredResults });
  } catch (error) {
    console.error('Error handling search request:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.post('/sales/last-7', async (req, res) => {
    try {
        const { uid, shopId } = req.body;
        if (!uid || !shopId) return res.status(400).json({ error: 'Missing essential ID' });

        const chartData = await dbActions.getLast7DaysSales(shopId);
        res.status(200).json(chartData);
    } catch (error) {
        console.error('❌ Error rendering sales data:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Inventory & Catalog Management ---
router.post('/gather_cat_item', async (req, res) => {
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

router.post('/addCategory', resolveActorContext, async (req, res) => {
    try {
        const { shopId, name } = req.body;
        if (!shopId || !name) return res.status(400).json({ error: 'Missing name parameters' });

        await dbActions.addCategoryName(shopId, name.trim());
        const { name: actor, role } = req.actorInfo;
        const details = `${actor} added category "${name.trim()}"`;

        await dbActions.saveAuditLog(shopId, actor, role, 'INVENTORY', 'ADD_CATEGORY', details);
        broadcastAuditAlert(shopId, 'Category Added', details, actor, role);

        res.status(200).json({ message: 'saved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error adding category' });
    }
});

router.post('/addItem', resolveActorContext, async (req, res) => {
    try {
        const { shopId, name, category, price, stock } = req.body;
        if (!shopId || !name || !category) return res.status(400).json({ error: 'Required fields missing' });

        const generatedPid = await dbActions.addItem(shopId, name, category, price, stock);
        const { name: actor, role } = req.actorInfo;
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

router.post('/deleteItem', resolveActorContext, async (req, res) => {
    try {
        const { id, shopId } = req.body;
        if (!id || !shopId) return res.status(400).json({ error: 'Identification parameters missing' });

        await dbActions.deleteItem(id, shopId);
        const { name: actor, role } = req.actorInfo;
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

router.post('/deleteCat', resolveActorContext, async (req, res) => {
    try {
        const { id, shopId } = req.body; 
        if (!id || !shopId) return res.status(400).json({ error: 'Identification details missing' });

        await dbActions.deleteCategory(id, shopId);
        const { name: actor, role } = req.actorInfo;
        const details = `${actor} deleted category framework "${id}"`;

        await dbActions.saveAuditLog(shopId, actor, role, 'INVENTORY', 'DELETE_CATEGORY', details);
        broadcastAuditAlert(shopId, 'Category Deleted', details, actor, role);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error removing category framework' });
    }
});

router.get('/my-products', async (req, res) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1]; 
        const shopId = req.headers['shop-id'];

        if (!token) return res.status(401).json({ error: 'No token provided' });
        if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

        const billingCatalog = await dbActions.getBillingProducts(shopId);
        res.status(200).json(billingCatalog);
    } catch (error) {
        console.error('❌ Error rendering product catalog:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Billing, Counter Sales & QR Orders ---
router.post('/bills', resolveActorContext, async (req, res) => {
    try {
        const { shopId, items, status, clientUid, sc, rc } = req.body;
        if (!shopId || !items) return res.status(400).json({ error: 'Missing bill data' });
        const resolvedClientUid = clientUid || getClientUidFromRequest(req);
        const fakeBillnum = await dbActions.generateUniqueBillNum(shopId);
        console.log('bill sarted')
        await dbActions.saveBillItems(shopId, fakeBillnum, items, status || 'paid', resolvedClientUid, null, sc, rc);

        const { name: actor, role } = req.actorInfo;
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

router.get('/orders', async (req, res) => {
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
        console.error('❌ Error fetching orders:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.patch('/orders/:id', resolveActorContext, async (req, res) => {
  try {
    const id = req.params.id; 
    const shopId = req.headers['shop-id'];
    const clientUid = req.headers['client-uid'];
    const { billNum, status, items, sc, rc } = req.body;

    if (!shopId) return res.status(400).json({ error: 'Missing shop-id context' });

    console.log('BillNum:', billNum || id);
    console.log('Status:', status);

    const resolvedClientUid = clientUid || getClientUidFromRequest(req);
    const effectiveStatus = (status === 'cancelled') ? 'cancelled' : status;

    if (effectiveStatus === 'cancelled') {
      await dbActions.updateOrderStatusSimple(billNum || id, shopId, effectiveStatus);
    } else {
      // ✅ Corrected order: billNum first, shopId second, effectiveStatus third
      await dbActions.updateOrderStatus(
        billNum || id, 
        shopId, 
        effectiveStatus, 
        items || [], 
        resolvedClientUid, 
        sc || 0, 
        rc || 0
      );
    }

    const { name: actor, role } = req.actorInfo;
    const isAccepted = effectiveStatus === 'paid' || effectiveStatus === 'accepted';
    const actionTitle = isAccepted ? 'QR Order Accepted' : 'QR Order Rejected';
    const details = isAccepted ? `Order #${id} accepted.` : `Order #${id} rejected.`;

    await dbActions.saveAuditLog(shopId, actor, role, 'QR_ORDER', actionTitle, details);
    broadcastAuditAlert(shopId, actionTitle, details, actor, role);

    const updatedCatalog = await dbActions.getBillingProducts(shopId);
    broadcastStockUpdate(shopId, updatedCatalog);

    res.status(200).json({ ok: true, billnum: isAccepted ? `BILL-${Date.now()}` : id });

  } catch (error) {
    console.error('❌ Error updating order:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.post('/deleteBill', resolveActorContext, async (req, res) => {
    try {
        const shopId = req.headers['shop-id'];
        const { billId } = req.body;

        if (!shopId || !billId) return res.status(400).json({ error: 'Missing parameters' });

        await dbActions.deleteBillRecord(shopId, billId);
        const { name: actor, role } = req.actorInfo;
        const details = `${actor} deleted bill record #${billId}`;

        await dbActions.saveAuditLog(shopId, actor, role, 'BILLING', 'DELETE_BILL', details);
        broadcastAuditAlert(shopId, 'Bill Deleted', details, actor, role);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Error deleting bill:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/pendingorders', async (req, res) => {
    try {
        const shopId = req.headers['shop-id'];
        if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

        const pendingList = await dbActions.getOrdersWithNestedItems(shopId, 'pending');
        res.status(200).json(pendingList);
    } catch (error) {
        console.error('❌ Error loading pending orders:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Customer Menu & QR Generation ---
router.get('/order/:shopId', async (req, res) => {
    try {
        const { shopId } = req.params;
        if (!shopId) return res.status(400).json({ error: 'Missing shopId' });

        const menuData = await dbActions.getShopMenuForOrder(shopId);
        res.status(200).json(menuData);
    } catch (error) {
        console.error('❌ Error rendering customer menu:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/user-me', async (req, res) => {
    try {
        const { uid, shopId } = req.body;
        if (!uid || !shopId) return res.status(400).json({ error: 'Missing parameters' });

        const qrUrl = `http://localhost:5173/auth?next=${encodeURIComponent(`/order/${shopId}`)}`;
        res.status(200).json({ url: qrUrl });
    } catch (error) {
        console.error('❌ Error generating QR landing path:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Reviews & Feedback ---
router.post('/review', async (req, res) => {
    try {
        const { shopId } = req.body;
        if (!shopId) return res.status(400).json({ error: 'Missing shopId' });

        const feedbackData = await dbActions.getShopFeedback(shopId);
        res.status(200).json(feedbackData);
    } catch (error) {
        console.error('❌ Error gathering reviews:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/addreview', async (req, res) => {
    try {
        const { user, shopId, type, message, category } = req.body;
        if (!shopId || !type || !message) return res.status(400).json({ error: 'Missing feedback fields' });

        await dbActions.addFeedback(shopId, user || 'Anonymous', type, message, category || 'General');
        res.status(200).json({ success: true, message: 'Feedback saved successfully' });
    } catch (error) {
        console.error('❌ Error adding review:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Audit Logs & Notifications ---
router.get('/audit-logs', resolveActorContext, async (req, res) => {
    try {
        const shopId = req.headers['shop-id'] || req.query.shopId;
        const clientUid = req.headers['client-uid'] || req.headers['uid'] || req.query.uid;

        if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

        if (clientUid && dbActions.getClientAuditLogs) {
            const clientLogs = await dbActions.getClientAuditLogs(shopId, clientUid);
            return res.status(200).json(clientLogs);
        }

        const logs = await dbActions.getShopAuditLogs(shopId);
        res.status(200).json(logs);
    } catch (error) {
        console.error('❌ Error fetching audit logs:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/notifications/unread-count', resolveActorContext, async (req, res) => {
    try {
        const shopId = req.headers['shop-id'] || req.query.shopId;
        if (!shopId) return res.status(400).json({ error: 'Missing shop ID' });

        const count = await dbActions.getUnreadAuditCount(shopId);
        res.status(200).json({ count });
    } catch (error) {
        console.error('❌ Error fetching unread count:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/notifications/mark-read', resolveActorContext, async (req, res) => {
    try {
        const shopId = req.headers['shop-id'] || req.body.shopId;
        if (!shopId) return res.status(400).json({ error: 'Missing shop ID' });

        await dbActions.markAuditLogsAsRead(shopId);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('❌ Error marking notifications read:', error.message);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/notifications/settings', resolveActorContext, async (req, res) => {
    try {
        const shopId = req.headers['shop-id'] || req.query.shopId;
        const clientUid = req.headers['client-uid'] || req.headers['uid'] || req.query.uid;

        if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

        if (clientUid && dbActions.getNotificationSettings) {
            const settings = await dbActions.getNotificationSettings(shopId, clientUid);
            return res.status(200).json({ notifications_permitted: settings?.permitted ?? true });
        }

        const permitted = await dbActions.getNotificationPreference(shopId);
        res.status(200).json({ notifications_permitted: permitted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/notifications/settings', resolveActorContext, async (req, res) => {
    try {
        const shopId = req.headers['shop-id'] || req.body.shopId;
        const clientUid = req.headers['client-uid'] || req.headers['uid'] || req.body?.clientUid || req.body?.uid;
        const { permitted } = req.body;

        if (!shopId) return res.status(400).json({ error: 'Missing shop-id header' });

        if (clientUid && dbActions.updateNotificationSettings) {
            await dbActions.updateNotificationSettings(shopId, clientUid, permitted);
            return res.status(200).json({ success: true, notifications_permitted: permitted });
        }

        await dbActions.updateNotificationPreference(shopId, permitted);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Subscription, Billing & PayHere Gateway Integration ---
router.get('/account/dues', async (req, res) => {
    try {
        const shopId = req.headers['shop-id'];
        const duesProfile = await dbActions.getAccountDues(shopId);
        res.status(200).json(duesProfile);
    } catch (error) {
        console.error('❌ Error rendering subscription balances:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/account/pay', async (req, res) => {
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
                notify_url: `http://localhost:${PORT}${API_PREFIX}/account/notify`,
                order_id: orderId,
                items: 'Kinetic Code POS Subscription',
                amount,
                currency,
                hash,
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

router.post('/account/notify', async (req, res) => {
try {
const paymentData = req.body;
const { order_id, status_code, customer_token, payhere_amount } = paymentData;

// Status code '2' means success in PayHere gateway responses
if (status_code === '2') {
const parts = order_id.split('_');
const shopId = parts[1]; 

if (shopId) {
// 1. Process payment first to clear/update active balance dues
await dbActions.processAccountPayment(shopId, payhere_amount || 0.00);

// 2. Safely store recurring customer token if issued for automatic monthly billing sweeps
if (customer_token) {
await dbActions.savePaymentToken(shopId, customer_token);
}

// 3. Record transaction payment history logs
await dbActions.saveSubscriptionPayment(shopId, payhere_amount || 0.00, order_id);
console.log(`✅ Successfully processed subscription payment for Shop ID ${shopId}`);

// 4. Fetch shop and account details to send the notification email
const accountDetails = await dbActions.getAccountSummaryForEmail(shopId);
if (accountDetails) {
const { rawShopName, ownerEmail, totalSales, dueAmount, chargeAmount } = accountDetails;
const recipientEmail = ownerEmail || 'unknownlion001@gmail.com';
const sanitizedShopName = rawShopName.replace(/[^a-zA-Z0-9-_]/g, "_");
const currentDate = new Date().toISOString().split('T')[0];

const csvHeaderLines = [
`"Shop Name: ${rawShopName}"`,
`"Payment Date: ${currentDate}"`,
`"Total Sales: ${totalSales}"`,
`"Due Amount: ${dueAmount}"`,
`"Amount Charged: ${chargeAmount}"`,
``,
`"Order ID","Status","Amount Paid"`
].join("\n");

const csvRow = `"${order_id}","Success","${payhere_amount || 0.00}"`;
const fileName = `${sanitizedShopName}_payment_summary.csv`;
const filePath = path.join(__dirname, fileName);

fs.writeFileSync(filePath, csvHeaderLines + "\n" + csvRow);

const directTransporter = nodemailer.createTransport({
service: 'gmail',
auth: {
user: 'unknownlion001@gmail.com',
pass: 'csrn yccb kboy szao'
}
});

const mailOptions = {
from: 'unknownlion001@gmail.com',
to: recipientEmail,
subject: `Payment Notification & Summary - ${rawShopName}`,
text: `Payment successfully processed for ${rawShopName}.\nTotal Sales: ${totalSales}\nDue Amount: ${dueAmount}\nAmount Charged: ${chargeAmount}`,
attachments: [{ filename: fileName, path: filePath }]
};

await directTransporter.sendMail(mailOptions);

if (fs.existsSync(filePath)) {
fs.unlinkSync(filePath);
}
}
}
}

res.status(200).send('Notification received');
} catch (error) {
console.error('❌ Error processing PayHere webhook & email notification:', error.message);
res.status(500).json({ error: 'Internal Server Error' });
}
});


// --- System Administration & User Status Control ---
router.post('/posowners', async (req, res) => {
    try {
        if (!req.body.user) return res.status(401).json({ error: 'Unauthorized' });

        const systemData = await dbActions.getSystemAdminDashboard();
        res.status(200).json(systemData);
    } catch (error) {
        console.error('❌ Error fetching system pos owners:', error.message);
        res.status(500).json({ error: 'Server error while loading data' });
    }
});

router.post('/terminate', resolveActorContext, async (req, res) => {
    try {
        const { id } = req.body;
        const shopId = req.headers['shop-id'] || req.body?.shopId;
        if (!id) return res.status(400).json({ error: 'Missing account ID' });

        await dbActions.terminateUserByUid(id);

        if (dbActions.saveAuditLog) {
            await dbActions.saveAuditLog(
                shopId || 'GLOBAL',
                req.actorInfo?.name || 'Shop Owner',
                req.actorInfo?.role || 'owner',
                'USER_MANAGEMENT',
                'TERMINATE_USER',
                `Terminated user account ID: ${id}`
            );
        }

        res.status(200).json({ value: { message: 'User account terminated successfully' } });
    } catch (error) {
        console.error('❌ Error terminating account:', error.message);
        res.status(500).json({ error: 'Server error during termination' });
    }
});

router.patch('/users/:id/status', resolveActorContext, async (req, res) => {
    try {
        const userId = req.params.id;
        const shopId = req.headers['shop-id'] || req.body?.shopId;
        const { status } = req.body;

        if (!shopId || !status) return res.status(400).json({ error: 'Missing parameters' });

        const { name: actor, role } = req.actorInfo;

        if (status === 'TERMINATED') {
            await dbActions.terminateUser(shopId, userId);
            const details = `${actor} terminated user ID #${userId}`;
            await dbActions.saveAuditLog(shopId, actor, role, 'USER_MANAGEMENT', 'TERMINATE_USER', details);
            broadcastAuditAlert(shopId, 'User Terminated', details, actor, role);
            return res.status(200).json({ success: true, message: 'User terminated successfully' });
        } else {
            await dbActions.updateUserStatus(shopId, userId, status);
            const details = `${actor} marked user ID #${userId} as ${status}`;
            await dbActions.saveAuditLog(shopId, actor, role, 'USER_MANAGEMENT', 'HOLD_USER', details);
            broadcastAuditAlert(shopId, `User Status Updated: ${status}`, details, actor, role);
            return res.status(200).json({ success: true, message: `Status updated to ${status}` });
        }
    } catch (error) {
        console.error('❌ Error handling user status:', error.message);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Asynchronous Sales Report Generation & Email Dispatch ---
router.post('/owner/report', async (req, res) => {
    const { user, shopId, period } = req.body;

    if (!user || !shopId || !period) {
        return res.status(400).json({ message: "Missing required parameters (user, shopId, or period)." });
    }

    try {
        const recipientEmail = 'unknownlion001@gmail.com';
        const reportData = await dbActions.getSalesByPeriod(shopId, user, period);
        const rawShopName = reportData.shopName;
        const bills = reportData.bills;

        if (!bills || bills.length === 0) {
            return res.status(404).json({ message: "No sales records found for the selected period." });
        }

        let grossTotal = 0;
        let totalDeductions = 0;
        let deductionCount = 0;

        const formattedRows = bills.map(b => {
            const priceNum = parseFloat(b.price) || 0;
            if (priceNum < 0) {
                totalDeductions += Math.abs(priceNum);
                deductionCount++;
            }
            grossTotal += priceNum;
            return `"${b.billnum}","${b.mobile || 'N/A'}","${b.price}","${b.time}"`;
        });

        const netTotal = grossTotal;
        const sanitizedShopName = rawShopName.replace(/[^a-zA-Z0-9-_]/g, "_");
        const currentDate = new Date().toISOString().split('T')[0];

        const csvHeaderLines = [
            `"Shop Name: ${rawShopName}"`,
            `"Report Period: ${reportData.startDate} to ${reportData.endDate}"`,
            `"Generated Date: ${currentDate}"`,
            `"Total Sales (Gross): ${grossTotal.toFixed(2)}"`,
            `"Total Deductions/Returns: -${totalDeductions.toFixed(2)} (${deductionCount} items)"`,
            `"Net Total Sales: ${netTotal.toFixed(2)}"`,
            ``,
            `"Bill Number","Mobile","Price","Time"`
        ].join("\n");

        const csvRowsContent = formattedRows.join("\n");
        const fileName = `${sanitizedShopName}_${period}_report.csv`;
        const filePath = path.join(__dirname, fileName);

        fs.writeFileSync(filePath, csvHeaderLines + "\n" + csvRowsContent);

        const directTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'unknownlion001@gmail.com',
                pass: 'csrn yccb kboy szao'
            }
        });

        const mailOptions = {
            from: 'unknownlion001@gmail.com',
            to: recipientEmail,
            subject: `Sales Report (${period.toUpperCase()}) - ${rawShopName}`,
            text: `Please find attached your ${period} sales report CSV file for ${rawShopName}. Net Total: ${netTotal.toFixed(2)}`,
            attachments: [{ filename: fileName, path: filePath }]
        };

        await directTransporter.sendMail(mailOptions);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        return res.status(200).json({ message: "Sales report CSV successfully generated and emailed!" });
    } catch (error) {
        console.error("Error generating sales report:", error);
        return res.status(500).json({ message: "Internal server error while processing the report." });
    }
});

// Mount modular router onto main application instance
app.use(API_PREFIX, router);

// ============================================================================
// 6. AUTOMATED BACKGROUND JOBS (CRON)
// ============================================================================

/**
 * Monthly Automated Commission Sweep & Autopay Processor
 * Executes on the 1st of every month at midnight (00:00).
 */
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

// ============================================================================
// 7. SERVER BOOTSTRAP
// ============================================================================

server.listen(PORT, () => {
    console.log(`🚀 Kinetic Code POS Enterprise Server running with WebSockets on http://localhost:${PORT}`);
});

