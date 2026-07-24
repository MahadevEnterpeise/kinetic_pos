/**
 * Helper function to get a random item from an array or string
 */
const getRandomChar = (source) => source[Math.floor(Math.random() * source.length)];

// Character sets
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Helper to generate a random number within a specific range (inclusive)
 * e.g., getRandomNumber(1000, 9999) -> 4-digit number
 */
const getRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Helper to generate a string of random lowercase characters of a specific length
 */
const getRandomLowercaseString = (length) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += getRandomChar(LOWERCASE);
  }
  return result;
};

/**
 * Generates a 16-digit Unique User ID (uid) or Session Token
 * Structure: [1 Upper][4 Digit Num][4 Lower][1 Upper][3 Digit Num][1 Upper][2 Lower]
 * Example: A7029uzqrW234Shp
 */
function generateUID() {
  const p1 = getRandomChar(UPPERCASE); // 1 Upper
  const p2 = getRandomNumber(1000, 9999).toString(); // 4 Digits
  const p3 = getRandomLowercaseString(4); // 4 Lower
  const p4 = getRandomChar(UPPERCASE); // 1 Upper
  const p5 = getRandomNumber(100, 999).toString(); // 3 Digits
  const p6 = getRandomChar(UPPERCASE); // 1 Upper
  const p7 = getRandomLowercaseString(2); // 2 Lower

  return `${p1}${p2}${p3}${p4}${p5}${p6}${p7}`;
}

/**
 * Generates a 12-digit Unique Shop ID (sid)
 * Structure: [1 Upper][4 Digit Num][4 Lower][1 Upper][2 Digit Num]
 * Example: A7029uzqrW23
 */
function generateSID() {
  const p1 = getRandomChar(UPPERCASE); // 1 Upper
  const p2 = getRandomNumber(1000, 9999).toString(); // 4 Digits
  const p3 = getRandomLowercaseString(4); // 4 Lower
  const p4 = getRandomChar(UPPERCASE); // 1 Upper
  const p5 = getRandomNumber(10, 99).toString(); // 2 Digits

  return `${p1}${p2}${p3}${p4}${p5}`;
}

/**
 * Generates a 24-Hour Session Token
 * Uses the exact same secure 16-digit structure as the UID
 */
function generateSessionToken() {
  return generateUID();
}

/**
 * Generates an 18-digit Unique Product ID (pid)
 * Structure: [1 Upper][5 Digit Num][5 Lower][1 Upper][4 Digit Num][2 Lower]
 * Example: B81047abcdeX9382yz
 */
function generatePID() {
  const p1 = getRandomChar(UPPERCASE); // 1 Upper
  const p2 = getRandomNumber(10000, 99999).toString(); // 5 Digits
  const p3 = getRandomLowercaseString(5); // 5 Lower
  const p4 = getRandomChar(UPPERCASE); // 1 Upper
  const p5 = getRandomNumber(1000, 9999).toString(); // 4 Digits
  const p6 = getRandomLowercaseString(2); // 2 Lower

  return `${p1}${p2}${p3}${p4}${p5}${p6}`;
}

/**
 * Generates an 18-digit Unique Bill ID (billid)
 * Structure: [1 Upper][5 Digit Num][5 Lower][1 Upper][4 Digit Num][2 Lower]
 * Example: C29401mnbvcZ4721qp
 */
function generateBillID() {
  return generatePID(); // Reuses the exact same 18-digit structural pattern
}

// Export all the functions to be used across your application
module.exports = {
  generateUID,
  generateSID,
  generateSessionToken,
  generatePID,
  generateBillID
};
