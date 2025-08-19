#!/usr/bin/env node
// No-op build: copy src/*.cjs to dist
import fs from 'node:fs';
import path from 'node:path';

const srcDir = new URL('../src/', import.meta.url);
const distDir = new URL('../dist/', import.meta.url);

fs.mkdirSync(distDir, { recursive: true });

for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith('.cjs')) {
    fs.copyFileSync(path.join(srcDir.pathname, file), path.join(distDir.pathname, file));
  }
}
console.log('Server build complete.');
