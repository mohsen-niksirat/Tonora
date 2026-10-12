#!/usr/bin/env node
/* Bump the cache-busting version across every file that carries a `?v=NN`
   query string or the SW `tonora-vNN` cache name.

   Usage:
     node scripts/bump-version.js            # increments current version by 1
     node scripts/bump-version.js 24         # sets an explicit version

   Files updated:
     - index.html   (css/js/data ?v= query strings)
     - sw.js        (CACHE name + cached ?v= URLs)
     - tests/responsive.test.js (version assertions)

   Keeps package.json `version` untouched — that tracks the feature release. */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(root, p), s, 'utf8');

const TARGETS = ['index.html', 'sw.js', path.join('tests', 'responsive.test.js')];

// find the current version from index.html
const html = read('index.html');
const m = html.match(/[?&]v=(\d+)/);
if (!m) {
  console.error('Could not find an existing ?v= version in index.html');
  process.exit(1);
}
const current = parseInt(m[1], 10);
const next = process.argv[2] !== undefined ? parseInt(process.argv[2], 10) : current + 1;
if (!Number.isInteger(next) || next < 0) {
  console.error(`Invalid version "${process.argv[2]}"`);
  process.exit(1);
}

let touched = 0;
for (const file of TARGETS) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  const before = s;
  s = s.replace(/([?&]v=)\d+/g, `$1${next}`);
  s = s.replace(/(tonora-v)\d+/g, `$1${next}`);
  if (s !== before) {
    fs.writeFileSync(p, s, 'utf8');
    touched++;
    console.log(`  ${file}  v${current} -> v${next}`);
  }
}

if (!touched) {
  console.error('No files were updated — are the version strings missing?');
  process.exit(1);
}
console.log(`\nBumped cache version to v${next} in ${touched} file(s).`);
