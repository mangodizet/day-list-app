// 앱 아이콘(.ico)을 직접 그려서 생성한다. 캔버스로 그린 PNG들을 ICO 컨테이너로 묶는 방식.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sizes = [16, 24, 32, 48, 64, 128, 256];

function drawScript(size) {
  return `
    (function() {
      const canvas = document.getElementById('c');
      canvas.width = ${size};
      canvas.height = ${size};
      const ctx = canvas.getContext('2d');
      const s = ${size};
      function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = '#2B6E63';
      roundRect(0, 0, s, s, s * 0.22);
      ctx.fill();
      ctx.strokeStyle = '#F6F4EF';
      ctx.lineWidth = Math.max(2, s * 0.13);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s * 0.26, s * 0.54);
      ctx.lineTo(s * 0.43, s * 0.71);
      ctx.lineTo(s * 0.76, s * 0.30);
      ctx.stroke();
      return canvas.toDataURL('image/png');
    })();
  `;
}

function buildIco(images) {
  const count = images.length;
  let offset = 6 + 16 * count;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const dataBuffers = [];
  for (const { size, buffer } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    dataBuffers.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...dirEntries, ...dataBuffers]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: true,
    x: -3000,
    y: -3000,
    width: 300,
    height: 300,
    focusable: false,
    skipTaskbar: true,
  });
  await win.loadURL('data:text/html,<canvas id="c"></canvas>');
  const wc = win.webContents;

  const images = [];
  for (const size of sizes) {
    const dataUrl = await wc.executeJavaScript(drawScript(size));
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
    images.push({ size, buffer });
    if (size === 256) fs.writeFileSync(path.join(__dirname, 'icon.png'), buffer);
  }

  fs.writeFileSync(path.join(__dirname, 'icon.ico'), buildIco(images));
  console.log('generated build/icon.ico and build/icon.png');

  win.destroy();
  app.exit(0);
});
