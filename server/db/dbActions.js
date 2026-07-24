const db = require('./db');
const { generateUID, generateSID, generateSessionToken, generatePID } = require('../utils/idGenerator');

// ==========================================
// INTERNAL HELPERS
// ==========================================

async function checkIdExists(id, type) {
  const allowedColumns = { uid: 'uid', sid: 'sid', token: 'token' };
  const columnName = allowedColumns[type];
  if (!columnName) throw new Error(`Invalid ID validation type: ${type}`);

  const queryText = `SELECT 1 FROM users WHERE ${columnName} = ? LIMIT 1`;
  const [rows] = await db.query(queryText, [id]);
  return rows.length > 0;
}

// Helper calculation function for the 1.1% sales commission capped at 9999
function calculateMonthlyFee(totalMonthlySales) {
  const baseMonthlyFee = 1200.00;
  const percentageFee = (totalMonthlySales * 1.1) / 100;
  let dynamicFee = percentageFee;
  if (dynamicFee > 9999.00) {
    dynamicFee = 9999.00;
  }
  return Math.max(baseMonthlyFee, dynamicFee);
}

// ==========================================
// DATABASE ACTIONS MODULE
// ==========================================

module.exports = {

  // ------------------------------------------
  // AUTHENTICATION & USER MANAGEMENT
  // ------------------------------------------

  createNewUser: async (userData) => {
    const { username, name, email, password, mobile, landline, pay_token, usertype, status, shopId } = userData;

    try {
      let uid;
      let uidDuplicate = true;
      while (uidDuplicate) {
        uid = generateUID();
        uidDuplicate = await checkIdExists(uid, 'uid');
      }

      let sid = null;
      if (usertype === 'owner' || usertype === 'kineticpos') {
        let sidDuplicate = true;
        while (sidDuplicate) {
          sid = generateSID();
          sidDuplicate = await checkIdExists(sid, 'sid');
        }
      } else if (shopId) {
        sid = shopId;
      }

      const billdate = new Date();
      billdate.setMonth(billdate.getMonth() + 1); // Set initial bill date to 1 month from now

      const queryText = `
        INSERT INTO users (
          uid, sid, username, name, email, password, 
          mobile, landline, token, token_expires_at, pay_token, usertype, status, billdate, due, notifications_permitted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?)
      `;

      const [result] = await db.query(queryText, [
        uid, sid, username, name, email, password,
        mobile || null, landline || null, 
        null, null, pay_token || null,
        usertype || 'customer', status || 'active', billdate, 1
      ]);

      return { result, uid, sid };
    } catch (error) {
      throw new Error(`[DB Error] Failed to insert new user: ${error.message}`);
    }
  },

  processLogin: async (username, password, usertype) => {
    try {
      const findUserQuery = `
        SELECT uid, sid, status 
        FROM users 
        WHERE username = ? AND password = ? AND usertype = ?
      `;
      const [users] = await db.query(findUserQuery, [username, password, usertype]);

      if (users.length === 0 || users[0].status.toUpperCase() === 'HOLD') {
        return null;
      }

      const user = users[0];
      let incomingToken;
      let tokenDuplicate = true;
      while (tokenDuplicate) {
        incomingToken = generateSessionToken();
        tokenDuplicate = await checkIdExists(incomingToken, 'token');
      }

      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + 24);

      const updateTokenQuery = `
        UPDATE users 
        SET token = ?, token_expires_at = ? 
        WHERE uid = ?
      `;
      await db.query(updateTokenQuery, [incomingToken, expiryTime, user.uid]);

      return {
        uid: user.uid,
        sid: user.sid || null,
        token: incomingToken
      };
    } catch (error) {
      throw new Error(`[DB Error] Login processing failed: ${error.message}`);
    }
  },

  saveLogData: async (username, password, usertype, status) => {
    try {
      const queryText = `
        INSERT INTO log_data (username, password, usertype, status) 
        VALUES (?, ?, ?, ?)
      `;
      const [result] = await db.query(queryText, [username, password, usertype, status || null]);
      return result;
    } catch (error) {
      console.error(`[DB Warning] Failed to save log_data: ${error.message}`);
      return null;
    }
  },

  checkId: async (id, type) => {
    try {
      return await checkIdExists(id, type);
    } catch (error) {
      console.error('❌ Failed to check id:', error.message);
      return null;
    }
  },

  searchShopUsers: async (shopId, searchTerm) => {
    try {
      const cleanSearch = searchTerm.trim();
      const namePattern = `%${cleanSearch}%`;

      let queryText = `
        SELECT 
          uid AS id, 
          name, 
          DATE_FORMAT(created_at, '%Y-%m-%d') AS date, 
          sid AS shop_id,
          usertype
        FROM users 
        WHERE (name LIKE ? OR uid = ?)
      `;
      let params = [namePattern, cleanSearch];

      if (shopId && shopId !== 'null' && shopId !== 'undefined' && shopId !== 'GLOBAL') {
        queryText += ` AND sid = ?`;
        params.push(shopId);
      } else {
        queryText += ` AND usertype = 'owner'`;
      }

      const [rows] = await db.query(queryText, params);
      return rows;
    } catch (error) {
      throw new Error(`[DB Error] Search processing failed: ${error.message}`);
    }
  },

  terminatePosOwner: async (shopId) => {
    try {
      await db.query(`DELETE FROM shopbill WHERE sid = ?`, [shopId]);
      await db.query(`DELETE FROM products WHERE sid = ?`, [shopId]);
      await db.query(`DELETE FROM shop_audit_logs WHERE shop_id = ?`, [shopId]);
      const [result] = await db.query(`DELETE FROM users WHERE sid = ?`, [shopId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to terminate POS owner: ${error.message}`);
    }
  },

  // ------------------------------------------
  // DASHBOARDS & ANALYTICS
  // ------------------------------------------

  getOwnerDashboard: async (sid) => {
    try {
      const shopQuery = `SELECT name, currency FROM users WHERE sid = ? AND usertype = 'owner' LIMIT 1`;
      const [shopRows] = await db.query(shopQuery, [sid]);
      const shopName = shopRows.length > 0 ? shopRows[0].name : 'Unknown Shop';
      const activeCurrency = shopRows.length > 0 ? shopRows[0].currency : 'LKR';

      const metricsQuery = `
        SELECT 
          IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)), 0) as total_sales,
          COUNT(DISTINCT billid) as bill_count
        FROM shopbill 
        WHERE sid = ? AND status != 'subscription_paid'
      `;
      const [metricsRows] = await db.query(metricsQuery, [sid]);
      const sales = metricsRows[0].total_sales;
      const count = metricsRows[0].bill_count;

      const billsQuery = `
        SELECT 
          mobile, 
          DATE_FORMAT(time, '%Y/%m/%d,%H:%i:%s') as time, 
          SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)) as price, 
          billnum 
        FROM shopbill 
        WHERE sid = ? AND status != 'subscription_paid'
        GROUP BY billnum 
        ORDER BY time DESC 
        LIMIT 5
      `;
      const [bills] = await db.query(billsQuery, [sid]);

      const trendsQuery = `
        SELECT pid as name 
        FROM shopbill 
        WHERE sid = ? AND status != 'subscription_paid'
        GROUP BY pid 
        ORDER BY SUM(qty) DESC 
        LIMIT 3
      `;
      const [trends] = await db.query(trendsQuery, [sid]);

      return {
        bills,
        trends: trends.length > 0 ? trends : [{ name: 'No items sold yet' }],
        shop: shopName,
        sales,
        count,
        currency: activeCurrency
      };
    } catch (error) {
      throw new Error(`[DB Error] Failed to generate owner dashboard data: ${error.message}`);
    }
  },

  getSystemAdminDashboard: async () => {
    try {
      const [salesRows] = await db.query(`
        SELECT IFNULL(SUM(due), 0) as total_sales 
        FROM users 
        WHERE usertype = 'owner'
      `);
      const totalSales = salesRows[0].total_sales;

      const [ownersRows] = await db.query(`
        SELECT 
          sid AS id,
          name,
          DATE_FORMAT(created_at, '%Y-%m-%d') AS date,
          IFNULL(due, 0.00) AS due,
          status
        FROM users 
        WHERE usertype = 'owner'
        ORDER BY created_at DESC
      `);

      return {
        sales: totalSales,
        salecount: ownersRows.length,
        posowners: ownersRows
      };
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch system admin data: ${error.message}`);
    }
  },

  getLast7DaysSales: async (shopId) => {
    try {
      let queryText = '';
      let params = [];

      if (shopId === 'GLOBAL' || !shopId || shopId === 'null' || shopId === 'undefined') {
        queryText = `
          SELECT 
            DATE_FORMAT(time, '%a') AS day_name,
            DATE(time) AS raw_date,
            IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)) * 0.011, 0) AS revenue
          FROM shopbill
          WHERE time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND status != 'subscription_paid'
          GROUP BY DATE(time)
          ORDER BY raw_date ASC
        `;
      } else {
        queryText = `
          SELECT 
            DATE_FORMAT(time, '%a') AS day_name,
            DATE(time) AS raw_date,
            IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)), 0) AS revenue
          FROM shopbill
          WHERE sid = ? AND time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND status != 'subscription_paid'
          GROUP BY DATE(time)
          ORDER BY raw_date ASC
        `;
        params.push(shopId);
      }

      const [rows] = await db.query(queryText, params);
      const salesMap = {};
      rows.forEach(row => {
        salesMap[row.day_name] = row.revenue;
      });

      const categories = [];
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        categories.push(dayName);
        data.push(salesMap[dayName] || 0);
      }

      return { categories, data };
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch last 7 days sales/dues: ${error.message}`);
    }
  },

  getMonthlySalesTotal: async (shopId) => {
    try {
      const queryText = `
        SELECT IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)), 0) AS monthly_sales
        FROM shopbill
        WHERE sid = ? AND time >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) AND status != 'subscription_paid'
      `;
      const [rows] = await db.query(queryText, [shopId]);
      return rows.length > 0 ? Number(rows[0].monthly_sales) : 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch monthly sales total: ${error.message}`);
    }
  },

  // ------------------------------------------
  // PRODUCTS & INVENTORY
  // ------------------------------------------

  gatherCatAndItems: async (shopId) => {
    try {
      const queryText = `SELECT pid, name, category, price, stock FROM products WHERE sid = ?`;
      const [rows] = await db.query(queryText, [shopId]);

      const categories = [];
      const items = [];

      rows.forEach(row => {
        if (row.pid.startsWith('CAT-')) {
          categories.push({ id: row.name, name: row.name });
        } else {
          items.push({
            id: row.pid,
            name: row.name,
            category: row.category,
            price: row.price,
            stock: row.stock
          });
        }
      });

      return { categories, items };
    } catch (error) {
      throw new Error(`[DB Error] Failed to gather inventory: ${error.message}`);
    }
  },

  getBillingProducts: async (shopId) => {
    try {
      const [shopUser] = await db.query(
        `SELECT currency FROM users WHERE sid = ? LIMIT 1`, 
        [shopId]
      );
      const currency = shopUser.length > 0 ? shopUser[0].currency : 'LKR';

      const [products] = await db.query(
        `SELECT pid, name, category, price, stock FROM products WHERE sid = ? AND pid NOT LIKE 'CAT-%'`, 
        [shopId]
      );

      const categoryMap = {};
      products.forEach(p => {
        const catName = p.category || 'General';
        if (!categoryMap[catName]) {
          categoryMap[catName] = {
            id: catName.toLowerCase().replace(/\s+/g, '_'),
            name: catName,
            items: []
          };
        }
        categoryMap[catName].items.push({
          itemid: p.pid,
          name: p.name,
          price: p.price,
          stock: p.stock
        });
      });

      return {
        currency: currency,
        categories: Object.values(categoryMap)
      };
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch billing products: ${error.message}`);
    }
  },

  addCategoryName: async (shopId, categoryName) => {
    try {
      const catPid = `CAT-${categoryName.toUpperCase().replace(/\s+/g, '_')}`;
      const queryText = `
        INSERT INTO products (pid, sid, name, category, price, stock)
        VALUES (?, ?, ?, 'CATEGORY_METADATA', 0, 0)
        ON DUPLICATE KEY UPDATE name = name
      `;
      await db.query(queryText, [catPid, shopId, categoryName]);
      return catPid;
    } catch (error) {
      throw new Error(`[DB Error] Failed to record category: ${error.message}`);
    }
  },

  addItem: async (shopId, name, category, price, stock) => {
    try {
      let pid = generatePID();
      const queryText = `
        INSERT INTO products (pid, sid, name, category, price, stock)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await db.query(queryText, [pid, shopId, name, category, price || 0, stock || 0]);
      return pid;
    } catch (error) {
      throw new Error(`[DB Error] Failed to add item: ${error.message}`);
    }
  },

  deleteItem: async (pid, shopId) => {
    try {
      const queryText = 'DELETE FROM products WHERE pid = ? AND sid = ?';
      const [result] = await db.query(queryText, [pid, shopId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to delete item: ${error.message}`);
    }
  },

  deleteCategory: async (identifier, shopId) => {
    try {
      const safeStr = String(identifier || '');
      const catPid = safeStr.startsWith('CAT-') 
        ? safeStr 
        : `CAT-${safeStr.toUpperCase().replace(/\s+/g, '_')}`;
        
      const queryText = 'DELETE FROM products WHERE (pid = ? OR category = ?) AND sid = ?';
      const [result] = await db.query(queryText, [catPid, identifier, shopId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to completely wipe category context: ${error.message}`);
    }
  },

  // ------------------------------------------
  // BILLING & ORDERS
  // ------------------------------------------

  getShopMenuForOrder: async (shopId) => {
    try {
      const shopQuery = `SELECT name AS shopName, currency, mobile FROM users WHERE sid = ? LIMIT 1`;
      const [shopRows] = await db.query(shopQuery, [shopId]);
      const shopName = shopRows.length > 0 ? shopRows[0].shopName : 'dummy Shop';
      const currency = shopRows.length > 0 ? shopRows[0].currency : 'Rs.';
      const clientMobile = shopRows.length > 0 ? (shopRows[0].mobile || null) : null;

      const itemsQuery = `
        SELECT pid AS id, name, price, stock, IFNULL(image, '') AS image 
        FROM products 
        WHERE sid = ? AND pid NOT LIKE 'CAT-%'
      `;
      const [itemRows] = await db.query(itemsQuery, [shopId]);

      const billsQuery = `
        SELECT billnum AS number, DATE_FORMAT(time, '%Y/%m/%d,%H:%i:%s') AS date, status 
        FROM shopbill 
        WHERE sid = ? AND status != 'subscription_paid'
        GROUP BY billnum, time, status
        ORDER BY time DESC 
        LIMIT 5
      `;
      const [billRows] = await db.query(billsQuery, [shopId]);

      return {
        shopId: shopId,
        shopName: shopName,
        currency: currency,
        mobile: clientMobile,
        items: itemRows,
        bills: billRows.map(b => ({ ...b, status: b.status || 'active' }))
      };
    } catch (error) {
      throw new Error(`[DB Error] Failed to generate menu: ${error.message}`);
    }
  },

  saveBillItems: async (shopId, billNum, items, status = 'paid', clientUid = null, customerMobile = null, sc = 0, rc = 0) => {
    try {
      let resolvedMobile = customerMobile;
      if (!resolvedMobile) {
        const [shopRows] = await db.query(`SELECT mobile FROM users WHERE sid = ? LIMIT 1`, [shopId]);
        if (shopRows.length > 0) {
          resolvedMobile = shopRows[0].mobile || null;
        }
      }

      const queryText = `
        INSERT INTO shopbill (billid, billnum, sid, mobile, pid, name, qty, price, sc, rc, status, client, time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      for (const item of items) {
        const itemId = item.itemid || item.id;
        const name = item.name;
        const qty = Number(item.qty) || 1;
        const price = Number(item.price) || 0;

        await db.query(queryText, [
          billNum, 
          billNum, 
          shopId, 
          resolvedMobile, 
          itemId, 
          name, 
          qty, 
          price, 
          Number(sc) || 0,
          Number(rc) || 0,
          status, 
          clientUid || null
        ]);

        await db.query(
          `UPDATE products SET stock = stock - ? WHERE pid = ? AND sid = ?`,
          [qty, itemId, shopId]
        );
      }

      return true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to save bill and update stock: ${error.message}`);
    }
  },

  getPastOrdersHistory: async (shopId) => {
    try {
      const shopQuery = `SELECT currency FROM users WHERE sid = ? AND usertype = 'owner' LIMIT 1`;
      const [shopRows] = await db.query(shopQuery, [shopId]);
      const currency = shopRows.length > 0 ? shopRows[0].currency : 'Rs.';

      const queryText = `
        SELECT 
          billnum AS id,
          GROUP_CONCAT(name SEPARATOR ' & ') AS name,
          SUM(qty) AS units,
          SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)) AS total,
          DATE_FORMAT(MIN(time), '%Y-%m-%d') AS date,
          status,
          MAX(client) AS client,
          MAX(mobile) AS mobile,
          MAX(sc) AS sc,
          MAX(rc) AS rc
        FROM shopbill
        WHERE sid = ? AND status != 'subscription_paid'
        GROUP BY billnum, status
        ORDER BY MIN(time) DESC
      `;
      const [rows] = await db.query(queryText, [shopId]);
      return rows.map(row => ({ ...row, currency }));
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch historical orders: ${error.message}`);
    }
  },

  getOrdersWithNestedItems: async (shopId, status = 'pending') => {
    try {
      const shopQuery = `SELECT currency FROM users WHERE sid = ? AND usertype = 'owner' LIMIT 1`;
      const [shopRows] = await db.query(shopQuery, [shopId]);
      const currency = shopRows.length > 0 ? shopRows[0].currency : 'Rs.';

      const queryText = `
        SELECT billnum, pid, name, qty, price, sc, rc, status, mobile, client, DATE_FORMAT(time, '%Y-%m-%dT%H:%i:%sz') AS date
        FROM shopbill
        WHERE sid = ? AND status = ?
        ORDER BY time ASC
      `;
      const [rows] = await db.query(queryText, [shopId, status]);

      const ordersMap = {};
      rows.forEach(row => {
        if (!ordersMap[row.billnum]) {
          ordersMap[row.billnum] = {
            id: row.billnum,
            shopId: shopId.toString(),
            customer: 'Customer',
            mobile: row.mobile || '',
            client: row.client || '',
            currency: currency,
            date: row.date,
            status: row.status,
            servicePct: row.sc || 0,
            discount: row.rc || 0,
            total: 0,
            items: []
          };
        }
        const lineTotal = row.price * row.qty;
        ordersMap[row.billnum].items.push({
          itemid: row.pid,
          id: row.pid,
          name: row.name,
          qty: row.qty,
          price: lineTotal
        });
      });

      Object.values(ordersMap).forEach(order => {
        const subtotal = order.items.reduce((sum, item) => sum + item.price, 0);
        const chargeAmount = (subtotal * order.servicePct) / 100;
        const stotal = subtotal + chargeAmount;
        const reduce = (stotal * order.discount) / 100;
        order.total = Math.max(0, stotal - reduce);
      });

      return Object.values(ordersMap);
    } catch (error) {
      throw new Error(`[DB Error] Failed to compile pending items list: ${error.message}`);
    }
  },

  updateOrderStatus: async (billNum, shopId, status, items, clientUid = null, sc = 0, rc = 0) => {
    try {
      let resolvedMobile = null;
      const [shopRows] = await db.query(`SELECT mobile FROM users WHERE sid = ? LIMIT 1`, [shopId]);
      if (shopRows.length > 0) {
        resolvedMobile = shopRows[0].mobile || null;
      }

      await db.query('DELETE FROM shopbill WHERE billnum = ? AND sid = ?', [billNum, shopId]);
      const queryText = `
        INSERT INTO shopbill (billid, billnum, sid, mobile, pid, name, qty, price, sc, rc, status, client, time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      for (const item of items) {
        const itemId = item.itemid || item.id;
        const name = item.name;
        const qty = Number(item.qty) || 1;
        const incomingPrice = Number(item.price) || 0;
        const unitPrice = qty > 0 ? incomingPrice / qty : 0;

        await db.query(queryText, [
          billNum, 
          billNum, 
          shopId, 
          resolvedMobile, 
          itemId, 
          name, 
          qty, 
          unitPrice, 
          Number(sc) || 0,
          Number(rc) || 0,
          status, 
          clientUid || null
        ]);

        if (status === 'paid') {
          await db.query(
            `UPDATE products SET stock = stock - ? WHERE pid = ? AND sid = ?`,
            [qty, itemId, shopId]
          );
        }
      }

      return true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to update order state: ${error.message}`);
    }
  },

  deleteBillRecord: async (shopId, billId) => {
    try {
      const queryText = 'DELETE FROM shopbill WHERE billnum = ? AND sid = ?';
      const [result] = await db.query(queryText, [billId, shopId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to delete bill record: ${error.message}`);
    }
  },

  // ------------------------------------------
  // SUBSCRIPTIONS, DUES & PAYMENTS
  // ------------------------------------------

  getAccountDues: async (shopId) => {
    try {
      const query = `
        SELECT 
          billdate,
          IFNULL(due, 0.00) AS due_amount,
          status,
          currency,
          CASE 
            WHEN IFNULL(due, 0.00) > 0 THEN DATEDIFF(CURDATE(), billdate)
            ELSE 0 
          END AS streakDay 
        FROM users 
        WHERE sid = ? AND usertype = 'owner' 
        LIMIT 1
      `;
      const [rows] = await db.query(query, [shopId]);

      if (rows.length === 0) {
        return { amount: 0.00, streakDay: 0, currency: 'Rs.', isLocked: true };
      }

      const row = rows[0];
      let isLocked = row.status === 'locked';
      let currentStreak = Number(row.streakDay) || 0;

      if (currentStreak < 0) currentStreak = 0;

      if (row.billdate && row.due_amount > 0) {
        if (currentStreak >= 3) {
          isLocked = true;
        }
      }

      return {
        amount: Number(row.due_amount),
        streakDay: currentStreak,
        currency: row.currency || 'LKR',
        status: isLocked ? 'locked' : row.status,
        billdate: row.billdate,
        isLocked: isLocked
      };
    } catch (error) {
      throw new Error(`[DB Error] Failed to read account subscription dues: ${error.message}`);
    }
  },

  savePaymentToken: async (shopId, payToken) => {
    try {
      const query = `
        UPDATE users 
        SET pay_token = ?, 
            due = 0.00,
            status = 'active', 
            billdate = DATE_ADD(CURDATE(), INTERVAL 1 MONTH) 
        WHERE sid = ? AND usertype = 'owner'
      `;
      const [result] = await db.query(query, [payToken, shopId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to capture payment credentials: ${error.message}`);
    }
  },

  getPendingAutopayShops: async () => {
    try {
      const query = `
        SELECT sid, due, pay_token 
        FROM users 
        WHERE usertype = 'owner' 
          AND pay_token IS NOT NULL 
          AND billdate <= CURDATE()
      `;
      const [rows] = await db.query(query);
      return rows;
    } catch (error) {
      throw new Error(`[DB Error] Failed to collect pending autopay queue: ${error.message}`);
    }
  },

  processAccountPayment: async (shopId, calculatedFee = 1200.00) => {
    try {
      const query = `
        UPDATE users 
        SET due = 0.00, 
            status = 'active',
            billdate = DATE_ADD(IF(billdate < CURDATE(), CURDATE(), billdate), INTERVAL 1 MONTH)
        WHERE sid = ? AND usertype = 'owner'
      `;
      const [result] = await db.query(query, [shopId]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to settle automatic payment values: ${error.message}`);
    }
  },

  applyMonthlyLiability: async (shopId, calculatedFee) => {
    try {
      const query = `
        UPDATE users 
        SET due = due + ?, 
            billdate = DATE_ADD(billdate, INTERVAL 1 MONTH)
        WHERE sid = ? AND usertype = 'owner'
      `;
      await db.query(query, [calculatedFee, shopId]);
      return true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to apply monthly liability fee: ${error.message}`);
    }
  },

  applyDailyLiabilitiesAndCheckLocks: async () => {
    try {
      const checkLocksQuery = `
        UPDATE users 
        SET status = 'locked'
        WHERE usertype = 'owner' 
          AND due > 0.00 
          AND DATEDIFF(CURDATE(), billdate) >= 3
      `;
      await db.query(checkLocksQuery);
      return true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to run automated grace period checks: ${error.message}`);
    }
  },

  handleFailedAutopay: async (shopId, fee) => {
    try {
      const query = `
        UPDATE users 
        SET due = due + ?, 
            status = CASE WHEN DATEDIFF(CURDATE(), billdate) >= 3 THEN 'locked' ELSE status END
        WHERE sid = ? AND usertype = 'owner'
      `;
      await db.query(query, [fee, shopId]);
      return true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to update failed autopay liability: ${error.message}`);
    }
  },

  getAllActiveShops: async () => {
    try {
      const query = `SELECT sid, customer_token FROM users WHERE usertype = 'owner' AND status != 'locked'`;
      const [rows] = await db.query(query);
      return rows;
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch active shops: ${error.message}`);
    }
  },

  saveSubscriptionPayment: async (shopId, amount, paymentOrderId) => {
    try {
      const queryText = `
        INSERT INTO shopbill (billid, billnum, sid, mobile, pid, name, qty, price, sc, rc, status, client, time)
        VALUES (?, ?, ?, NULL, 'SUB_FEE', 'POS Monthly Subscription', 1, ?, 0, 0, 'subscription_paid', NULL, NOW())
      `;
      await db.query(queryText, [
        paymentOrderId, 
        paymentOrderId, 
        shopId, 
        Number(amount)
      ]);
      return true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to record subscription payment history: ${error.message}`);
    }
  },

  // ------------------------------------------
  // FEEDBACK & NOTIFICATIONS
  // ------------------------------------------

  addFeedback: async (shopId, userIdentifier, type, message, category = null) => {
    try {
      const queryText = `
        INSERT INTO feedback (sid, user_identifier, type, category, message)
        VALUES (?, ?, ?, ?, ?)
      `;
      const [result] = await db.query(queryText, [shopId, userIdentifier, type, category, message]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to save feedback: ${error.message}`);
    }
  },

  getShopFeedback: async (shopId) => {
    try {
      const queryText = `
        SELECT id, user_identifier AS user, category, message, type 
        FROM feedback 
        WHERE sid = ? 
        ORDER BY created_at DESC
      `;
      const [rows] = await db.query(queryText, [shopId]);

      const complaints = [];
      const suggestions = [];

      rows.forEach(row => {
        if (row.type.toLowerCase().includes('complaint')) {
          complaints.push({
            id: row.id,
            user: row.user,
            category: row.category || 'General',
            message: row.message
          });
        } else {
          suggestions.push({
            id: row.id,
            user: row.user,
            message: row.message
          });
        }
      });

      return { complaints, suggestions };
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch shop feedback: ${error.message}`);
    }
  },

  getNotificationPreference: async (shopId) => {
    try {
      const [rows] = await db.query(
        `SELECT notifications_permitted FROM users WHERE sid = ? LIMIT 1`, 
        [shopId]
      );
      return rows.length > 0 ? Boolean(rows[0].notifications_permitted) : true;
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch notification preference: ${error.message}`);
    }
  },

  updateNotificationPreference: async (shopId, permitted) => {
    try {
      const [result] = await db.query(
        `UPDATE users SET notifications_permitted = ? WHERE sid = ?`, 
        [permitted ? 1 : 0, shopId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to update notification preference: ${error.message}`);
    }
  },

  // ------------------------------------------
  // AUDIT LOGS & PERMANENT NOTIFICATIONS
  // ------------------------------------------

  saveAuditLog: async (shopId, actorName, actorRole, actionCategory, actionType, details) => {
    try {
      const queryText = `
        INSERT INTO shop_audit_logs (shop_id, actor_name, actor_role, action_category, action_type, details) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const [result] = await db.query(queryText, [shopId, actorName, actorRole, actionCategory, actionType, details]);
      return result.affectedRows > 0;
    } catch (error) {
      throw new Error(`[DB Error] Failed to save audit log: ${error.message}`);
    }
  },

  getShopAuditLogs: async (shopId) => {
    try {
      const queryText = `
        SELECT id, shop_id, actor_name, actor_role, action_category, action_type, details, is_read, 
               DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM shop_audit_logs 
        WHERE shop_id = ? 
        ORDER BY created_at DESC
      `;
      const [rows] = await db.query(queryText, [shopId]);
      return rows;
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch shop audit logs: ${error.message}`);
    }
  },

    getUserByUid: async (uid) => {
    try {
      const queryText = `SELECT uid, name, usertype, sid FROM users WHERE uid = ? LIMIT 1`;
      const [rows] = await db.query(queryText, [uid]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch user by UID: ${error.message}`);
    }
  },
  terminateUserByUid: async (userId) => {
  try {
    const queryText = `DELETE FROM users WHERE uid = ?`;
    const [result] = await db.query(queryText, [userId]);
    console.log('terminated ',result.affectedRows);
    return result.affectedRows > 0;
  } catch (error) {
    throw new Error(`[DB Error] Failed to terminate user: ${error.message}`);
  }
}
,

updateUserStatus: async (shopId, userId, status) => {
  try {
    const queryText = `UPDATE users SET status = ? WHERE uid = ? AND sid = ?`;
    const [result] = await db.query(queryText, [status, userId, shopId]);
    return result.affectedRows > 0;
  } catch (error) {
    throw new Error(`[DB Error] Failed to update user status: ${error.message}`);
  }
},


};
