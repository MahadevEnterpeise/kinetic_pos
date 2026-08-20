//export const link='http://localhost:3000/api'
//now 
export const link = `https://${window.location.hostname.replace('-5173', '-3000')}/api`;


// src/utils/printerService.js

// src/utils/printerService.js

export async function printReceipt(printData) {
  try {
    // 1. Check if Web Bluetooth is supported by the browser/device
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not supported on this browser or device.');
    }

    // 2. Request the Bluetooth thermal printer (connects once for both print jobs)
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
    
    const encoder = new TextEncoder();
    const printDate = printData.date || new Date().toLocaleDateString();
    const printTime = printData.time || new Date().toLocaleTimeString();

    // ==========================================
    // PART 1: GENERATE & PRINT CUSTOMER BILL
    // ==========================================
    let billCommands = '';
    billCommands += '\x1B\x40'; // Initialize printer
    billCommands += '\x1B\x61\x01'; // Center alignment
    billCommands += `${printData.shopname || 'KINETIC POS'}\n`;
    billCommands += '--------------------------------\n';
    billCommands += `Bill No: ${printData.billnum}\n`;
    billCommands += `Date: ${printDate}  Time: ${printTime}\n`;
    billCommands += '--------------------------------\n';
    
    billCommands += '\x1B\x61\x00'; // Left alignment
    printData.arrays.forEach(item => {
      const itemName = (item.name || '').substring(0, 16).padEnd(16, ' ');
      const itemQty = (`${item.qty}`).padStart(6, ' ');
      const itemPrice = Number(item.price).toFixed(2).padStart(10, ' ');
      billCommands += `${itemName}${itemQty}${itemPrice}\n`;
    });

    billCommands += '--------------------------------\n';
    billCommands += `Subtotal: ${Number(printData.stotal || 0).toFixed(2)} ${printData.currency || ''}\n`;
    if (printData.scvalue > 0) billCommands += `Service Charge: ${printData.scvalue}%\n`;
    if (printData.rcvalue > 0) billCommands += `Discount: ${printData.rcvalue}%\n`;
    billCommands += `TOTAL: ${Number(printData.total || 0).toFixed(2)} ${printData.currency || ''}\n`;
    billCommands += '--------------------------------\n';
    
    billCommands += '\x1B\x61\x01'; // Center alignment
    billCommands += '\x1B\x21\x01'; // Select Font B (Smaller)
    billCommands += 'Thank You! Come Again\n\n';
    billCommands += '\x1B\x21\x20'; // Double-width mode (Bigger)
    billCommands += 'Powered by\n';
    billCommands += '\x1B\x21\x30'; // Double-width + Double-height
    billCommands += 'Kinetic Code HQ\n\n';
    billCommands += '\x1B\x21\x00'; // Reset font
    billCommands += '\x1D\x56\x41\x03'; // Cut paper command

    // Send Customer Bill bytes
    await characteristic.writeValue(encoder.encode(billCommands));

    // Brief pause to allow the printer physical mechanism to separate/reset between cuts
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ==========================================
    // PART 2: GENERATE & PRINT KITCHEN ORDER TICKET (KOT)
    // ==========================================
    let kotCommands = '';
    kotCommands += '\x1B\x40'; // Initialize printer
    kotCommands += '\x1B\x61\x01'; // Center alignment
    kotCommands += `${printData.shopname || 'KINETIC POS'}\n`;
    kotCommands += '*** KITCHEN ORDER TICKET ***\n';
    if (printData.orderType) {
      kotCommands += `Type: ${printData.orderType}\n`;
    }
    kotCommands += '--------------------------------\n';
    kotCommands += `Bill No: ${printData.billnum}\n`;
    kotCommands += `Date: ${printDate}  Time: ${printTime}\n`;
    kotCommands += '--------------------------------\n';

    kotCommands += '\x1B\x61\x00'; // Left alignment
    printData.arrays.forEach(item => {
      const itemName = (item.name || '').substring(0, 16).padEnd(16, ' ');
      const itemQty = (`${item.qty}`).padStart(6, ' ');
      kotCommands += `${itemName}${itemQty}\n`; // KOT layout: Name + Qty only
    });

    kotCommands += '--------------------------------\n';
    kotCommands += '\x1B\x61\x01'; // Center alignment
    kotCommands += '*** PREPARE ORDER ***\n\n\n';
    kotCommands += '\x1D\x56\x41\x03'; // Cut paper command

    // Send KOT bytes
    await characteristic.writeValue(encoder.encode(kotCommands));

    return { success: true };
  } catch (err) {
    console.error('Direct thermal print error:', err);
    return { success: false, error: err.message };
  }
}