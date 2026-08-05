const mysql = require('mysql2');
const crypto = require('crypto');
const { generateUID, generateSID } = require('../utils/idGenerator');

const pool = mysql.createPool({
host: '127.0.0.1',
port: 3306,
user: 'root',
password: '',
database: 'kinetic_pos', 
waitForConnections: true,
connectionLimit: 10,
queueLimit: 0
});

const db = pool.promise();

// Password hashing helper for the seed admin
const hashPassword = (password) => {
return new Promise((resolve, reject) => {
const salt = crypto.randomBytes(16).toString('hex');
crypto.scrypt(password, salt, 64, (err, derivedKey) => {
if (err) reject(err);
resolve(`${salt}:${derivedKey.toString('hex')}`);
});
});
};

async function initDatabase() {
try {
console.log('🔄 Checking database tables...');

// 1. Create Users Table
await db.query(`
CREATE TABLE IF NOT EXISTS users (
uid VARCHAR(50) PRIMARY KEY,
sid VARCHAR(50),
username VARCHAR(50) UNIQUE,
name VARCHAR(100),
email VARCHAR(100) UNIQUE,
password VARCHAR(255),
mobile VARCHAR(20),
landline VARCHAR(15),
address VARCHAR(255),
token VARCHAR(255),
token_expires_at TIMESTAMP NULL,
pay_token VARCHAR(255),
usertype VARCHAR(50),
status VARCHAR(50),
billdate DATE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
currency VARCHAR(50),
due DECIMAL(10,2) DEFAULT 0.00,
notifications_permitted BOOLEAN DEFAULT TRUE,
INDEX idx_shop_id (sid)
)
`);
console.log('✅ Users table verified/created successfully.');

// 2. Create Subscription Log Table
await db.query(`
CREATE TABLE IF NOT EXISTS subscription_log (
id INT AUTO_INCREMENT PRIMARY KEY,
sid VARCHAR(50) NOT NULL,
payment_order_id VARCHAR(100) NOT NULL,
amount DECIMAL(10,2) NOT NULL,
period_start DATETIME NOT NULL,
period_end DATETIME NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX idx_shop_period (sid, period_end)
)
`);
console.log('✅ subscription_log table verified/created successfully.');

// 3. Create Log Data Table
await db.query(`
CREATE TABLE IF NOT EXISTS log_data (
username VARCHAR(20),
password VARCHAR(255),
usertype VARCHAR(50),
date DATETIME DEFAULT CURRENT_TIMESTAMP,
status VARCHAR(50)
);
`);
console.log('✅ log_data table verified');

// 4. Create Shop Bill Table
await db.query(`
CREATE TABLE IF NOT EXISTS shopbill (
billid VARCHAR(50),
sid VARCHAR(50),
mobile VARCHAR(20),
name varchar(255),
billnum VARCHAR(50),
time DATETIME DEFAULT CURRENT_TIMESTAMP,
pid VARCHAR(50),
qty INT,
sc decimal(10,2),
rc decimal(10,2),
price DECIMAL(10,2),
status VARCHAR(20),
client VARCHAR(255),
PRIMARY KEY (billid, pid)
);
`);
console.log('✅ shopbill table verified/created successfully.');

// 5. Create Products Table
await db.query(`
CREATE TABLE IF NOT EXISTS products (
pid VARCHAR(50) PRIMARY KEY,
sid VARCHAR(50),
name VARCHAR(255),
category VARCHAR(100),
price DECIMAL(10,2) DEFAULT 0.0,
stock INT DEFAULT 0,
image VARCHAR(255),
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX idx_shop_prod (sid)
);
`);
console.log('✅ products table verified/created successfully.');

// 6. Create Feedback Table
await db.query(`
CREATE TABLE IF NOT EXISTS feedback (
id INT AUTO_INCREMENT PRIMARY KEY,
sid VARCHAR(50),
user_identifier VARCHAR(100),
type VARCHAR(20), 
category VARCHAR(50) NULL, 
message TEXT,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
INDEX idx_shop_feedback (sid)
);
`);
console.log('✅ feedback table verified/created successfully.');

// 7. Create audit Table
await db.query(`
CREATE TABLE IF NOT EXISTS shop_audit_logs (
id INT AUTO_INCREMENT PRIMARY KEY,
shop_id VARCHAR(50) NOT NULL,
actor_name VARCHAR(100) NOT NULL,
actor_role VARCHAR(50) NOT NULL,
action_category VARCHAR(50) NOT NULL,
action_type VARCHAR(100) NOT NULL,
details TEXT NOT NULL,
is_read BOOLEAN DEFAULT FALSE,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);
console.log('✅ audit table verified/created successfully.');

// 8. Seed Default Kinetic Admin Account if not exists
const [adminCheck] = await db.query(`SELECT uid FROM users WHERE usertype = 'kinetic_admin' LIMIT 1`);

if (adminCheck.length === 0) {
const adminUid = generateUID();
const adminSid = generateSID();
const hashedAdminPassword = await hashPassword('admin123'); // Change default password as needed

await db.query(`
INSERT INTO users (
uid, sid, username, name, email, password, usertype, status, due, notifications_permitted
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0.00, ?)
`, [
adminUid,
adminSid,
'admin',
'Kinetic Admin',
'admin@kineticcode.com',
hashedAdminPassword,
'kinetic_admin',
'active',
1
]);
console.log('✅ Default kinetic_admin account created (Username: admin | Password: admin123).');
}

} catch (error) {
console.error('❌ Database initialization failed:', error.message);
}
}

// Automatically invoke setup
initDatabase();

module.exports = db;
