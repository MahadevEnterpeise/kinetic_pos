const db = require('./db');
const crypto = require('crypto');
const { generateUID, generateSID, generateBillID, generateSessionToken, generatePID } = require('../utils/idGenerator');
const { SocketAddress } = require('net');

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

function calculateMonthlyFee(totalMonthlySales) {
    const baseMonthlyFee = 1200.00;
    const percentageFee = (totalMonthlySales * 1.1) / 100;
    let dynamicFee = percentageFee;
    if (dynamicFee > 9999.00) {
        dynamicFee = 9999.00;
    }
    return Math.max(baseMonthlyFee, dynamicFee);
}

const hashPassword = (password) => {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
};

const verifyPassword = (password, storedHash) => {
    return new Promise((resolve, reject) => {
        const [salt, key] = storedHash.split(':');
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err);
            resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey));
        });
    });
};
// 1. Define saveLogData as a helper function or make sure it's in scope
const saveLogData = async (username, reason, usertype, status) => {
    try {
        const queryText = `
            INSERT INTO log_data (username, reason, usertype, status) 
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.query(queryText, [username, reason, usertype, status || null]);
        return result;
    } catch (error) {
        console.error(`[DB Warning] Failed to save log_data: ${error.message}`);
        return null;
    }
};
// ==========================================
// DATABASE ACTIONS MODULE
// ==========================================

module.exports = {

    // ------------------------------------------
    // AUTHENTICATION & USER MANAGEMENT
    // ------------------------------------------

    createNewUser: async (userData) => {
        const { username, name, email, password, mobile, landline,address, pay_token, usertype, status, shopId } = userData;

        try {
            let uid;
            let uidDuplicate = true;
            while (uidDuplicate) {
                uid = generateUID();
                uidDuplicate = await checkIdExists(uid, 'uid');
            }

            let sid = null;

            if (usertype === 'kineticpos') {
                let sidDuplicate = true;
                while (sidDuplicate) {
                    sid = generateSID();
                    sidDuplicate = await checkIdExists(sid, 'sid');
                }
            } else if (shopId && shopId !== 'null' && shopId !== 'undefined' && shopId !== 'GLOBAL') {
                sid = shopId;
            } else if (usertype === 'owner') {
                let sidDuplicate = true;
                while (sidDuplicate) {
                    sid = generateSID();
                    sidDuplicate = await checkIdExists(sid, 'sid');
                }
            }

            let billdate = null;
            if (usertype === 'owner') {
                billdate = new Date();
                billdate.setMonth(billdate.getMonth() + 1);
            }

            const hashedPassword = await hashPassword(password);

            const queryText = `
                INSERT INTO users (
                    uid, sid, username, name, email, password, 
                    mobile, landline, address,token, token_expires_at, pay_token, usertype, status, billdate, due, notifications_permitted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, 0.00, ?)
            `;

            const [result] = await db.query(queryText, [
                uid, 
                sid, 
                username, 
                name, 
                email, 
                hashedPassword,
                mobile || null, 
                landline || null, 
                address,
                null, 
                null, 
                pay_token || null,
                usertype || 'customer', 
                status || 'active', 
                billdate, 
                1
            ]);

            return { result, uid, sid };

        } catch (error) {
            throw new Error(`[DB Error] Failed to insert new user: ${error.message}`);
        }
    },

    processLogin: async (username, password, usertype) => {
    let reason = 'undefined';

    try {
        const findUserQuery = `
            SELECT uid, sid, status, password 
            FROM users 
            WHERE username = ? AND usertype = ?
        `;
        const [users] = await db.query(findUserQuery, [username, usertype]);

        if (users.length === 0) {
            reason = 'not permited';
            await saveLogData(username, reason, usertype, 'failed');
            return null;
        }

        const user = users[0];
        const statusUpper = user.status ? user.status.toUpperCase() : '';
        
        if (statusUpper === 'HOLD' || statusUpper === 'LOCKED') {
            reason = 'sid under hold';
            await saveLogData(username, reason, usertype, 'failed');
            return null;
        }

        const isPasswordValid = await verifyPassword(password, user.password);
        
        if (!isPasswordValid) {
            reason = 'invalid input';
            await saveLogData(username, reason, usertype, 'failed');
            return null;
        }

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

        reason = 'correct inputs';
        await saveLogData(username, reason, usertype, 'success');

        return {
            uid: user.uid,
            sid: user.sid || null,
            token: incomingToken
        };

    } catch (error) {
        throw new Error(`[DB Error] Login processing failed: ${error.message}`);
    }
},

saveLogData: async (username, reason, usertype, status) => {
    try {
        console.log(`[DEBUG] Attempting to save log for: ${username}, status: ${status}, reason: ${reason}`);
        
        const queryText = `
            INSERT INTO log_data (username, reason, usertype, status) 
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.query(queryText, [username, reason, usertype, status || null]);
        
        console.log(`[DEBUG] Log saved successfully! Insert ID:`, result.insertId);
        return result;
    } catch (error) {
        console.error(`[DB Warning] Failed to save log_data: ${error.message}`);
        return null;
    }
}

,

    checkId: async (id, type) => {
        try {
            return await checkIdExists(id, type);
        } catch (error) {
            console.error('❌ Failed to check id:', error.message);
            return null;
        }
    },

    searchShopUsers: async (shopId, searchTerm, userUid) => {
        try {
            const cleanSearch = searchTerm ? searchTerm.trim() : '';
            const namePattern = `%${cleanSearch}%`;

            let queryText = `
                SELECT 
                    uid AS id, 
                    name, 
                    username,
                    usertype,
                    DATE_FORMAT(created_at, '%Y-%m-%d') AS date, 
                    sid AS shop_id
                FROM users 
                WHERE (name LIKE ? OR username LIKE ? OR uid LIKE ?)
            `;
            let params = [namePattern, namePattern, namePattern];

            if (userUid && userUid !== 'null' && userUid !== 'undefined') {
                const [userRows] = await db.query(`SELECT usertype FROM users WHERE uid = ? LIMIT 1`, [userUid]);
                if (userRows.length > 0) {
                    const requestingUserType = userRows[0].usertype;
                    if (requestingUserType === 'manager') {
                        queryText += ` AND usertype NOT IN ('owner', 'kinetic_admin')`;
                    } else if (requestingUserType === 'owner') {
                        queryText += ` AND usertype != 'kinetic_admin'`;
                    }
                }
            }

            if (shopId && shopId !== 'null' && shopId !== 'undefined' && shopId !== 'GLOBAL') {
                queryText += ` AND sid = ?`;
                params.push(shopId);
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
            await db.query(`DELETE FROM subscription_log WHERE sid = ?`, [shopId]);
            const [result] = await db.query(`DELETE FROM users WHERE sid = ?`, [shopId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`[DB Error] Failed to terminate POS owner: ${error.message}`);
        }
    },

    // ------------------------------------------
    // DASHBOARDS & ANALYTICS
    // ------------------------------------------

    /*getOwnerDashboard: async (sid, uid) => {
        try {
            const shopQuery = `SELECT name, currency FROM users WHERE sid = ? AND uid = ? AND usertype = 'owner' LIMIT 1`;
            const [shopRows] = await db.query(shopQuery, [sid, uid]);

            if (shopRows.length === 0) {
                return null;
            }

            const shopName = shopRows[0].name || 'Unknown Shop';
            const activeCurrency = shopRows[0].currency || 'LKR';

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
                SELECT name
                FROM shopbill 
                WHERE sid = ? AND status != 'subscription_paid' AND time >= NOW() - INTERVAL 30 DAY
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
    },//use when anything goes wrong*/
    getOwnerDashboard: async (sid, uid) => {
        try {
            //const shopQuery = `SELECT name, currency FROM users WHERE sid = ? AND uid = ? AND usertype = 'owner' OR 'client' LIMIT 1`;
            const shopQuery = `
    SELECT name, currency 
    FROM users 
    WHERE sid = ? AND uid = ? AND (usertype = 'owner' OR usertype = 'client') 
    LIMIT 1
`;
            const [shopRows] = await db.query(shopQuery, [sid, uid]);

            if (shopRows.length === 0) {
                return null;
            }

            const shopName = shopRows[0].name || 'Unknown Shop';
            const activeCurrency = shopRows[0].currency || 'LKR';

            const metricsQuery = `
                SELECT 
                    IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - ((price * qty * rc) / 100)), 0) as total_sales,
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
                    SUM((price * qty) + ((price * qty * sc) / 100) - ((price * qty * rc) / 100)) as price, 
                    billnum 
                FROM shopbill 
                WHERE sid = ? AND status != 'subscription_paid'
                GROUP BY billnum 
                ORDER BY time DESC 
                LIMIT 5
            `;
            const [bills] = await db.query(billsQuery, [sid]);

            const trendsQuery = `
                SELECT name
                FROM shopbill 
                WHERE sid = ? AND status != 'subscription_paid' AND time >= NOW() - INTERVAL 30 DAY
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


    getAccountSummaryForEmail: async (shopId) => {
        try {
            const userQuery = `SELECT name, email, due, currency FROM users WHERE sid = ? AND usertype = 'owner' LIMIT 1`;
            const [userRows] = await db.query(userQuery, [shopId]);

            if (userRows.length === 0) {
                return null;
            }

            const rawShopName = userRows[0].name || 'Unknown Shop';
            const ownerEmail = userRows[0].email;
            const dueAmount = Number(userRows[0].due || 0).toFixed(2);

            const metricsQuery = `
                SELECT IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - (((price * qty * sc) / 100) * rc / 100)), 0) as total_sales
                FROM shopbill 
                WHERE sid = ? AND status != 'subscription_paid'
            `;
            const [metricsRows] = await db.query(metricsQuery, [shopId]);
            const totalSales = Number(metricsRows[0].total_sales || 0).toFixed(2);

            const paymentQuery = `
                SELECT amount AS price 
                FROM subscription_log 
                WHERE sid = ? 
                ORDER BY period_end DESC 
                LIMIT 1
            `;
            const [paymentRows] = await db.query(paymentQuery, [shopId]);
            const chargeAmount = paymentRows.length > 0 ? Number(paymentRows[0].price || 0).toFixed(2) : '0.00';

            return {
                rawShopName,
                ownerEmail,
                totalSales,
                dueAmount,
                chargeAmount
            };
        } catch (error) {
            throw new Error(`[DB Error] Failed to fetch account summary for email: ${error.message}`);
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

        if (shopId === 'A5496enueV47' || !shopId || shopId === 'null' || shopId === 'undefined') {
            queryText = `
                SELECT 
                    DATE_FORMAT(created_at, '%a') AS day_name,
                    DATE(created_at) AS raw_date,
                    COUNT(*) AS revenue
                FROM users
                WHERE usertype = 'owner' 
                  AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                GROUP BY DATE(created_at)
                ORDER BY raw_date ASC
            `;
        } else {
            queryText = `
                SELECT 
                    DATE_FORMAT(time, '%a') AS day_name,
                    DATE(time) AS raw_date,
                    IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - ((price * qty * rc) / 100)), 0) AS revenue
                FROM shopbill
                WHERE sid = ? 
                  AND time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
                  AND status != 'subscription_paid'
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
                SELECT IFNULL(SUM((price * qty) + ((price * qty * sc) / 100) - ((price * qty * rc) / 100)), 0) AS monthly_sales
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
            const [shopUser] = await db.query(`SELECT currency FROM users WHERE sid = ? LIMIT 1`, [shopId]);
            const currency = shopUser.length > 0 ? shopUser[0].currency : 'LKR';

            const [products] = await db.query(`SELECT pid, name, category, price, stock FROM products WHERE sid = ? AND pid NOT LIKE 'CAT-%'`, [shopId]);

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

    generateUniqueBillNum: async (shopId) => {
        let isUnique = false;
        let billNum = '';

        while (!isUnique) {
            billNum = generateBillID(); 
            const [existing] = await db.query(
                `SELECT billnum FROM shopbill WHERE billnum = ? AND sid = ? LIMIT 1`,
                [billNum, shopId]
            );
            if (existing.length === 0) {
                isUnique = true;
            }
        }
        return billNum;
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
            const queryText = 'DELETE FROM products WHERE (pid = ? || category = ?) AND sid = ?';
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

    // Include both pid and pid AS id, while filtering out category metadata/CAT rows
    const itemsQuery = `
      SELECT pid, pid AS id, name, price, stock, IFNULL(image, '') AS image 
      FROM products 
      WHERE sid = ? AND pid NOT LIKE 'CAT-%' AND category != 'CATEGORY_METADATA'
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
}
,
      // Fetch categorized order history for a specific customer with accurate SC/RC calculations
  getCustomerOrdersHistory: async (shopId, clientUid) => {
    try {
      const query = `
        SELECT 
          b.billnum, 
          b.sid, 
          b.mobile, 
          b.pid, 
          b.name, 
          b.qty, 
          b.price, 
          b.sc, 
          b.rc, 
          b.status, 
          b.client, 
          b.time,
          u.name AS actorName
        FROM shopbill b
        LEFT JOIN users u ON b.client = u.uid AND b.sid = u.sid
        WHERE b.sid = ? AND b.client = ?
        ORDER BY b.time DESC
      `;
      
      const [rows] = await db.query(query, [shopId, clientUid]);
      const groupedMap = {};

      rows.forEach(row => {
        const orderId = row.billnum;

        if (!groupedMap[orderId]) {
          groupedMap[orderId] = {
            id: orderId,
            billnum: row.billnum,
            sc: Number(row.sc) || 0,
            rc: Number(row.rc) || 0,
            subtotal: 0,
            total: 0,
            date: row.time,
            status: row.status,
            mobile: row.mobile,
            staffName: row.actorName || 'Customer Portal',
            currency: 'LKR',
            items: []
          };
        }

        const itemTotalPrice = Number(row.price) * Number(row.qty);
        groupedMap[orderId].subtotal += itemTotalPrice;

        if (row.name || row.pid) {
          groupedMap[orderId].items.push({
            itemid: row.pid,
            name: row.name,
            qty: Number(row.qty) || 1,
            price: Number(row.price) || 0,
            sc: Number(row.sc) || 0,
            rc: Number(row.rc) || 0
          });
        }
      });

      // Calculate accurate totals factoring in Service Charge and Discount percentages
      const resultOrders = Object.values(groupedMap).map(order => {
        const chargeAmount = (order.subtotal * order.sc) / 100;
        let stotal = order.subtotal + chargeAmount;
        const reduce = (stotal * order.rc) / 100;
        order.total = Math.max(0, stotal - reduce);
        return order;
      });

      return resultOrders;
    } catch (error) {
      throw new Error(`[DB Error] Failed to fetch customer order history: ${error.message}`);
    }
  },


    saveBillItems: async (shopId, billNum, items, status = 'paid', clientUid = null, customerMobile = null, sc = 0, rc = 0) => {
try {
let resolvedMobile = customerMobile;

if (!resolvedMobile && clientUid) {
const [userRows] = await db.query(`SELECT mobile FROM users WHERE sid = ? AND uid = ? LIMIT 1`, [shopId, clientUid]);
if (userRows.length > 0) {
resolvedMobile = userRows[0].mobile || null;
}
}

const queryText = `
INSERT INTO shopbill (billid, billnum, sid, mobile, pid, name, qty, price, sc, rc, status, client, time)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
`;

for (const item of items) {
// Added item.pid here to catch the property sent from your frontend
const itemId = item.pid || item.itemid || item.id;
const name = item.name;
const qty = Number(item.qty) || 1;
const price = Number(item.price) || 0;

if (!itemId) {
throw new Error("pid cannot be null: Item is missing a valid identifier.");
}

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


    getPastOrdersHistory: async (sid) => {
  try {
    const query = `
      SELECT 
        b.billnum, 
        b.sid, 
        b.mobile, 
        b.pid, 
        b.name, 
        b.qty, 
        b.price, 
        b.sc, 
        b.rc, 
        b.status, 
        b.client, 
        b.time,
        u.name AS actorName
      FROM shopbill b
      LEFT JOIN users u ON b.client = u.uid AND b.sid = u.sid
      WHERE b.sid = ?
      ORDER BY b.time DESC
    `;
    const [rows] = await db.query(query, [sid]);

    const groupedMap = {};

    rows.forEach(row => {
      const orderId = row.billnum;

      if (!groupedMap[orderId]) {
        groupedMap[orderId] = {
          id: orderId,
          billnum: row.billnum,
          // Capture bill-level sc and rc (grabbing from the first row of the bill group)
          sc: Number(row.sc) || 0,
          rc: Number(row.rc) || 0,
          subtotal: 0,
          total: 0,
          date: row.time,
          status: row.status,
          mobile: row.mobile,
          staffName: row.actorName || 'System / Client',
          currency: 'LKR',
          items: []
        };
      }

      const itemTotalPrice = Number(row.price) * Number(row.qty);
      groupedMap[orderId].subtotal += itemTotalPrice;

      if (row.name || row.pid) {
        groupedMap[orderId].items.push({
          itemid: row.pid,
          name: row.name,
          qty: Number(row.qty) || 1,
          price: Number(row.price) || 0,
          sc: Number(row.sc) || 0, // ✅ Pass sc to item level
          rc: Number(row.rc) || 0  // ✅ Pass rc to item level
        });
      }
    });

    // Calculate final accurate totals incorporating SC and Discount percentages
    const resultOrders = Object.values(groupedMap).map(order => {
      const chargeAmount = (order.subtotal * order.sc) / 100;
      let stotal = order.subtotal + chargeAmount;
      const reduce = (stotal * order.rc) / 100;
      order.total = Math.max(0, stotal - reduce);
      return order;
    });

    return resultOrders;

  } catch (error) {
    throw new Error(`[DB Error] Failed to fetch past orders history: ${error.message}`);
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

    updateOrderStatusSimple: async (billNum, shopId, status) => {
        try {
            const [orderItems] = await db.query(
                `SELECT pid, qty FROM shopbill WHERE (billnum = ? OR billid = ?) AND sid = ?`,
                [billNum, billNum, shopId]
            );

            await db.query(
                `UPDATE shopbill SET status = ? WHERE (billnum = ? OR billid = ?) AND sid = ?`,
                [status, billNum, billNum, shopId]
            );

            if (status === 'cancelled' || status === 'rejected') {
                for (const item of orderItems) {
                    if (item.pid && item.pid !== 'SUB_FEE') {
                        await db.query(
                            `UPDATE products SET stock = stock + ? WHERE pid = ? AND sid = ?`,
                            [item.qty, item.pid, shopId]
                        );
                    }
                }
            }

            return true;
        } catch (error) {
            throw new Error(`[DB Error] Failed to update order status: ${error.message}`);
        }
    },

    updateOrderStatus: async (billNum, shopId, status, items, clientUid = null, sc = 0, rc = 0) => {
  try {
    console.log("🔍 [DEBUG] Starting updateOrderStatus with:", { billNum, shopId, status });

    let resolvedMobile = null;
    const [shopRows] = await db.query(`SELECT mobile FROM users WHERE sid = ? LIMIT 1`, [shopId]);
    if (shopRows.length > 0) {
      resolvedMobile = shopRows[0].mobile || null;
    }

    // 1. Run the direct update and check affected rows
    const [updateResult] = await db.query(
      `UPDATE shopbill SET status = ?, sc = ?, rc = ? WHERE billnum = ? AND sid = ?`,
      [status, Number(sc) || 0, Number(rc) || 0, billNum, shopId]
    );

    console.log("🔍 [DEBUG] SQL UPDATE affected rows:", updateResult.affectedRows);

    if (updateResult.affectedRows === 0) {
      console.warn(`⚠️ [WARNING] No rows matched billnum='${billNum}' and sid='${shopId}' in shopbill table! Check if the billnum or shopid exact values match your DB.`);
    }

    const validItems = Array.isArray(items) ? items : [];

    for (const item of validItems) {
      if (!item || typeof item !== 'object') continue;

      const itemId = item.pid || item.itemid || item.id;
      if (!itemId) continue;

      const qty = Number(item.qty) || 1;

      if (status === 'paid' || status === 'accepted') {
        await db.query(
          `UPDATE products SET stock = stock - ? WHERE pid = ? AND sid = ?`,
          [qty, itemId, shopId]
        );
      }

      if (status === 'rejected' || status === 'cancelled') {
        await db.query(
          `UPDATE products SET stock = stock + ? WHERE pid = ? AND sid = ?`,
          [qty, itemId, shopId]
        );
      }
    }

    console.log("✅ [DEBUG] updateOrderStatus completed successfully.");
    return true;
  } catch (error) {
    console.error("❌ [DB Error Inside Helper]:", error.message);
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

    async getSalesByPeriod(shopId, user, period) {
        try {
            const [userRows] = await db.query(
                `SELECT name FROM users WHERE (sid = ? OR uid = ?) AND usertype = 'owner' LIMIT 1`,
                [shopId, user]
            );
            const shopName = userRows.length > 0 && userRows[0].name ? userRows[0].name : `Shop_${shopId}`;

            const now = new Date();
            let startDate = new Date(now);
            let endDate = new Date(now);

            if (period === 'today') {
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            } else if (period === 'yesterday') {
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
            } else if (period === 'week') {
                startDate.setDate(startDate.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            } else if (period === 'month') {
                startDate.setDate(startDate.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            } else {
                startDate.setDate(startDate.getDate() - 30);
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            }

            const startDateStr = startDate.toISOString().slice(0, 19).replace('T', ' ');
            const endDateStr = endDate.toISOString().slice(0, 19).replace('T', ' ');

            const [bills] = await db.query(
                `SELECT * FROM shopbill WHERE sid = ? AND time BETWEEN ? AND ? ORDER BY time DESC`,
                [shopId, startDateStr, endDateStr]
            );

            return { shopName, bills, startDate: startDateStr, endDate: endDateStr };
        } catch (error) {
            console.error("Error in getSalesByPeriod:", error);
            throw error;
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
            
            await db.query(
                `UPDATE users SET status = 'active' WHERE sid = ? AND usertype != 'owner'`,
                [shopId]
            );

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

            await db.query(
                `UPDATE users SET status = 'active' WHERE sid = ? AND usertype != 'owner'`,
                [shopId]
            );

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
                SET status = 'active'
                WHERE usertype = 'owner' 
                AND due > 0.00 
                AND DATEDIFF(CURDATE(), billdate) >= 3
            `;
            await db.query(checkLocksQuery);

            const holdOtherUsersQuery = `
                UPDATE users u
                JOIN users o ON u.sid = o.sid AND o.usertype = 'owner'
                SET u.status = 'hold'
                WHERE u.usertype != 'owner'
            `;
            await db.query(holdOtherUsersQuery);

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

            await db.query(`
                UPDATE users 
                SET status = 'hold' 
                WHERE sid = ? AND usertype != 'owner' 
                AND (SELECT status FROM users WHERE sid = ? AND usertype = 'owner') = 'locked'
            `, [shopId, shopId]);

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

    getLastSubscriptionRecord: async (shopId) => {
        try {
            const queryText = `
                SELECT period_start, period_end, created_at 
                FROM subscription_log 
                WHERE sid = ? 
                ORDER BY period_end DESC 
                LIMIT 1
            `;
            const [rows] = await db.query(queryText, [shopId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`[DB Error] Failed to fetch last subscription log: ${error.message}`);
        }
    },

    saveSubscriptionPayment: async (shopId, amount, paymentOrderId) => {
        try {
            const lastSub = await module.exports.getLastSubscriptionRecord(shopId);
            let periodStart = new Date();
            if (lastSub && lastSub.period_end) {
                const lastEnd = new Date(lastSub.period_end);
                if (lastEnd > periodStart) {
                    periodStart = lastEnd;
                }
            }

            const periodEnd = new Date(periodStart);
            periodEnd.setMonth(periodEnd.getMonth() + 1);

            const logQuery = `
                INSERT INTO subscription_log (sid, payment_order_id, amount, period_start, period_end)
                VALUES (?, ?, ?, ?, ?)
            `;
            await db.query(logQuery, [shopId, paymentOrderId, Number(amount), periodStart, periodEnd]);

            const billQuery = `
                INSERT INTO shopbill (billid, billnum, sid, mobile, pid, name, qty, price, sc, rc, status, client, time)
                VALUES (?, ?, ?, NULL, 'SUB_FEE', 'POS Monthly Subscription', 1, ?, 0, 0, 'subscription_paid', NULL, NOW())
            `;
            await db.query(billQuery, [paymentOrderId, paymentOrderId, shopId, Number(amount)]);

            const userUpdateQuery = `
                UPDATE users 
                SET due = 0.00, 
                    status = 'active', 
                    billdate = ? 
                WHERE sid = ? AND usertype = 'owner'
            `;
            await db.query(userUpdateQuery, [periodEnd, shopId]);

            await db.query(
                `UPDATE users SET status = 'active' WHERE sid = ? AND usertype != 'owner'`,
                [shopId]
            );

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
            const [rows] = await db.query(`SELECT notifications_permitted FROM users WHERE sid = ? LIMIT 1`, [shopId]);
            return rows.length > 0 ? Boolean(rows[0].notifications_permitted) : true;
        } catch (error) {
            throw new Error(`[DB Error] Failed to fetch notification preference: ${error.message}`);
        }
    },

    updateNotificationPreference: async (shopId, permitted) => {
        try {
            const [result] = await db.query(`UPDATE users SET notifications_permitted = ? WHERE sid = ?`, [permitted ? 1 : 0, shopId]);
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
            const queryText = `SELECT uid, name, usertype, sid, email FROM users WHERE uid = ? LIMIT 1`;
            const [rows] = await db.query(queryText, [uid]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            throw new Error(`[DB Error] Failed to fetch user by UID: ${error.message}`);
        }
    },

    async getShopById(shopId) {
        try {
            const [rows] = await db.query(`SELECT name FROM products WHERE sid = ? LIMIT 1`, [shopId]);
            if (rows && rows.length > 0) {
                return rows[0];
            }

            const [userRows] = await db.query(`SELECT shopname AS name FROM users WHERE sid = ? LIMIT 1`, [shopId]);
            if (userRows && userRows.length > 0) {
                return userRows[0];
            }

            return null;
        } catch (error) {
            console.error("Error in getShopById:", error);
            return null;
        }
    },

    terminateUserByUid: async (userId) => {
        try {
            const queryText = `DELETE FROM users WHERE uid = ?`;
            const [result] = await db.query(queryText, [userId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`[DB Error] Failed to terminate user: ${error.message}`);
        }
    },

    updateUserStatus: async (shopId, userId, status) => {
        try {
            const queryText = `UPDATE users SET status = ? WHERE uid = ? AND sid = ?`;
            const [result] = await db.query(queryText, [status, userId, shopId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`[DB Error] Failed to update user status: ${error.message}`);
        }
    },

    // ------------------------------------------
    // UNREAD NOTIFICATIONS
    // ------------------------------------------

    getUnreadAuditCount: async (shopId) => {
        try {
            const queryText = `
                SELECT COUNT(*) as count 
                FROM shop_audit_logs 
                WHERE shop_id = ? 
                AND (is_read = 0 OR is_read IS NULL) 
                AND LOWER(TRIM(actor_role)) != 'owner'
            `;
            const [rows] = await db.query(queryText, [shopId]);
            return rows[0].count || 0;
        } catch (error) {
            throw new Error(`[DB Error] Failed to fetch unread audit count: ${error.message}`);
        }
    },

    markAuditLogsAsRead: async (shopId) => {
        try {
            const queryText = `
                UPDATE shop_audit_logs 
                SET is_read = 1 
                WHERE shop_id = ? 
                AND (is_read = 0 OR is_read IS NULL)
            `;
            const [result] = await db.query(queryText, [shopId]);
            return result.affectedRows > 0;
        } catch (error) {
            throw new Error(`[DB Error] Failed to mark audit logs as read: ${error.message}`);
        }
    }

};
