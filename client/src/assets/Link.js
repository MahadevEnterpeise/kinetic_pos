//export const link='http://localhost:3000/api'
//now 
//export const link ='https://kineticpos-production.up.railway.app/api'
// 
export const link = `https://${window.location.hostname.replace('-5173', '-3000')}/api`;


// src/utils/printerService.js

const LINE_WIDTH = 48;
const DIVIDER = '-'.repeat(LINE_WIDTH) + '\n';
const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

async function writeInChunks(characteristic, encoder, text, chunkSize = 150) {
  const bytes = encoder.encode(text);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.slice(offset, offset + chunkSize);
    await characteristic.writeValue(chunk);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function wrapText(text, width = LINE_WIDTH) {
  if (!text) return [];
  const normalized = String(text).replace(/\r\n|\r|\n/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word.slice(0, width);
    } else if ((current + ' ' + word).length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word.slice(0, width);
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function openPrinterCharacteristic(existingCharacteristic = null) {
  if (existingCharacteristic) {
    return { characteristic: existingCharacteristic, device: null };
  }

  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported on this browser or device.');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID]
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

  return { characteristic, device };
}

function closePrinterDevice(device, keepConnected = false) {
  if (!keepConnected && device?.gatt?.connected) {
    device.gatt.disconnect();
  }
}

// ==========================================
// 1. CUSTOMER BILL PRINT (80mm / 48 chars)
// ==========================================
export async function printBill(printData, existingCharacteristic = null) {
  let conn = null;
  try {
    conn = await openPrinterCharacteristic(existingCharacteristic);
    const encoder = new TextEncoder();
    const printDate = printData.date || new Date().toLocaleDateString();
    const printTime = printData.time || new Date().toLocaleTimeString();

    let billCommands = '';
    billCommands += '\x1B\x40'; // Initialize printer
    billCommands += '\x1B\x61\x01'; // Center alignment
    billCommands += `${printData.shopname || 'KINETIC POS'}\n`;
    billCommands += DIVIDER;
    billCommands += `Bill No: ${printData.billnum}\n`;
    billCommands += `Date: ${printDate}  Time: ${printTime}\n`;
    if (printData.orderType) billCommands += `Order Type: ${printData.orderType}\n`;
    if (printData.paymentType) billCommands += `Payment: ${printData.paymentType}\n`;
    billCommands += DIVIDER;

    // 24 (Item) + 8 (Qty) + 16 (Total) = 48 chars
    billCommands += '\x1B\x61\x00'; // Left alignment
    billCommands += `${'Item'.padEnd(24, ' ')}${'Qty'.padStart(8, ' ')}${'Total'.padStart(16, ' ')}\n`;
    billCommands += DIVIDER;

    (printData.arrays || []).forEach(item => {
      const itemName = String(item.name || '').slice(0, 24).padEnd(24, ' ');
      const itemQty = String(item.qty ?? 0).padStart(8, ' ');
      const itemPrice = Number(item.price || 0).toFixed(2).padStart(16, ' ');
      billCommands += `${itemName}${itemQty}${itemPrice}\n`;
    });

    if (printData.note) {
      billCommands += DIVIDER;
      billCommands += 'Note:\n';
      wrapText(printData.note, LINE_WIDTH).forEach(line => {
        billCommands += `${line}\n`;
      });
    }

    billCommands += DIVIDER;
    billCommands += `Subtotal: ${Number(printData.stotal || 0).toFixed(2)} ${printData.currency || ''}\n`;
    if (printData.scvalue > 0) billCommands += `Service Charge: ${printData.scvalue}%\n`;
    if (printData.rcvalue > 0) billCommands += `Discount: ${printData.rcvalue}%\n`;
    billCommands += `TOTAL: ${Number(printData.total || 0).toFixed(2)} ${printData.currency || ''}\n`;
    billCommands += DIVIDER;

    billCommands += '\x1B\x61\x01'; // Center alignment
    billCommands += '\x1B\x21\x01'; // Font B
    billCommands += 'Thank You! Come Again\n\n';
    billCommands += '\x1B\x21\x20'; // Double-width
    billCommands += 'Powered by\n';
    billCommands += '\x1B\x21\x30'; // Double-width + Double-height
    billCommands += 'Kinetic Code HQ\n\n';
    billCommands += '\x1B\x21\x00'; // Reset font
    billCommands += '\x1D\x56\x41\x03'; // Cut paper

    await writeInChunks(conn.characteristic, encoder, billCommands);
    return { success: true, characteristic: conn.characteristic, device: conn.device };
  } catch (err) {
    console.error('Bill thermal print error:', err);
    return { success: false, error: err.message };
  } finally {
    closePrinterDevice(conn?.device, Boolean(existingCharacteristic));
  }
}

// ==========================================
// 2. KITCHEN ORDER TICKET PRINT (80mm / 48 chars)
// ==========================================
export async function printKot(printData, existingCharacteristic = null) {
  let conn = null;
  try {
    conn = await openPrinterCharacteristic(existingCharacteristic);
    const encoder = new TextEncoder();
    const printDate = printData.date || new Date().toLocaleDateString();
    const printTime = printData.time || new Date().toLocaleTimeString();

    let kotCommands = '';
    kotCommands += '\x1B\x40'; // Initialize printer
    kotCommands += '\x1B\x61\x01'; // Center alignment
    kotCommands += `${printData.shopname || 'KINETIC POS'}\n`;
    kotCommands += '*** KITCHEN ORDER TICKET ***\n';
    if (printData.orderType) kotCommands += `Type: ${printData.orderType}\n`;
    if (printData.paymentType) kotCommands += `Payment: ${printData.paymentType}\n`;
    kotCommands += DIVIDER;
    kotCommands += `Bill No: ${printData.billnum}\n`;
    kotCommands += `Date: ${printDate}  Time: ${printTime}\n`;
    kotCommands += DIVIDER;

    // 36 (Item) + 12 (Qty) = 48 chars
    kotCommands += '\x1B\x61\x00'; // Left alignment
    kotCommands += `${'Item'.padEnd(36, ' ')}${'Qty'.padStart(12, ' ')}\n`;
    kotCommands += DIVIDER;

    (printData.arrays || []).forEach(item => {
      const itemName = String(item.name || '').slice(0, 36).padEnd(36, ' ');
      const itemQty = String(item.qty ?? 0).padStart(12, ' ');
      kotCommands += `${itemName}${itemQty}\n`;
    });

    if (printData.note) {
      kotCommands += DIVIDER;
      kotCommands += 'NOTE:\n';
      wrapText(printData.note, LINE_WIDTH).forEach(line => {
        kotCommands += `${line}\n`;
      });
    }

    kotCommands += DIVIDER;
    kotCommands += '\x1B\x61\x01'; // Center alignment
    kotCommands += '*** PREPARE ORDER ***\n\n\n';
    kotCommands += '\x1D\x56\x41\x03'; // Cut paper

    await writeInChunks(conn.characteristic, encoder, kotCommands);
    return { success: true, characteristic: conn.characteristic, device: conn.device };
  } catch (err) {
    console.error('KOT thermal print error:', err);
    return { success: false, error: err.message };
  } finally {
    closePrinterDevice(conn?.device, Boolean(existingCharacteristic));
  }
}

// ==========================================
// 3. COMBINED BILL + KOT WRAPPER
// ==========================================
export async function printReceipt(printData) {
  const billRes = await printBill(printData);
  if (!billRes.success) return billRes;

  await new Promise(resolve => setTimeout(resolve, 1000));
  const kotRes = await printKot(printData, billRes.characteristic);

  if (billRes.device?.gatt?.connected) {
    billRes.device.gatt.disconnect();
  }

  return { success: kotRes.success, error: kotRes.error };
}