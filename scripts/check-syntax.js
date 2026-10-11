#!/usr/bin/env node
/* Syntax-check every JS file in the project with `node --check`.
   No dependencies required. Exits non-zero on the first failure. */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOTS = ['js', 'tests', 'scripts', '.'];
const FILES = new Set();

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (root.endsWith('.js')) FILES.add(root);
    continue;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      FILES.add(path.join(root, entry.name));
    }
  }
}

let failed = 0;
for (const file of [...FILES].sort()) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`✅ ${file}`);
  } catch (err) {
    failed++;
    console.error(`❌ ${file}\n${err.stderr ? err.stderr.toString() : err.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} file(s) failed syntax check.`);
  process.exit(1);
}
console.log(`\nAll ${FILES.size} JS files pass syntax check.`);
