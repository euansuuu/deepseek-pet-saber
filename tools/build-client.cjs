// 重新构建 client.js：把 WebP 精灵表以 data URL 注入 client.template.js。
// 用法：node tools/build-client.cjs
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const pkgDir = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(pkgDir, 'client.template.js'), 'utf8');
const b64 = fs.readFileSync(path.join(pkgDir, 'assets', 'spritesheet.webp')).toString('base64');

if (!template.includes('__SPRITESHEET_DATA_URL__')) {
  throw new Error('client.template.js 缺少 __SPRITESHEET_DATA_URL__ 占位符');
}

const client = template.replace('__SPRITESHEET_DATA_URL__', `data:image/webp;base64,${b64}`);
fs.writeFileSync(path.join(pkgDir, 'client.js'), client);
console.log(`client.js written: ${(client.length / 1024).toFixed(1)} KB`);
