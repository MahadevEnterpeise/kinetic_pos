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

    // 2. Request the Bluetooth thermal printer (filters for standard printer service UUID)
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
    });

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

    // 3. Build raw ESC/POS byte commands
    const encoder = new TextEncoder();
    let commands = '';
    
    commands += '\x1B\x40'; // Initialize printer
    commands += '\x1B\x61\x01'; // Center alignment
    commands += 'KINETIC POS\n';
    commands += '--------------------------------\n';
    commands += `Bill No: ${printData.billnum}\n`;
    commands += `Date: ${new Date().toLocaleString()}\n`;
    commands += '--------------------------------\n';
    
    commands += '\x1B\x61\x00'; // Left alignment
    printData.arrays.forEach(item => {
      // Formatted to precisely fit a standard 32-character thermal line layout (16 + 6 + 10)
      const itemName = (item.name || '').substring(0, 16).padEnd(16, ' ');
      const itemQty = (`${item.qty}`).padStart(6, ' ');
      const itemPrice = Number(item.price).toFixed(2).padStart(10, ' ');
      
      commands += `${itemName}${itemQty}${itemPrice}\n`;
    });

    commands += '--------------------------------\n';
    commands += `Subtotal: ${Number(printData.stotal).toFixed(2)} ${printData.currency}\n`;
    if (printData.scvalue > 0) commands += `Service Charge: ${printData.scvalue}%\n`;
    if (printData.rcvalue > 0) commands += `Discount: ${printData.rcvalue}%\n`;
    commands += `TOTAL: ${Number(printData.total).toFixed(2)} ${printData.currency}\n`;
    commands += '--------------------------------\n';
    
    commands += '\x1B\x61\x01'; // Center alignment
    commands += 'Thank You! Come Again\n\n\n';
    commands += '\x1D\x56\x41\x03'; // Cut paper command

    // 4. Send byte chunks to the printer
    const encodedData = encoder.encode(commands);
    await characteristic.writeValue(encodedData);

    return { success: true };
  } catch (err) {
    console.error('Direct thermal print error:', err);
    return { success: false, error: err.message };
  }
}
