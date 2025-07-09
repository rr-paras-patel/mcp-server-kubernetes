#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/update-version.js <version>');
  process.exit(1);
}

const files = [
  {
    path: 'package.json',
    update: (content) => {
      const pkg = JSON.parse(content);
      pkg.version = version;
      return JSON.stringify(pkg, null, 2);
    }
  },
  {
    path: 'manifest.json',
    update: (content) => {
      const manifest = JSON.parse(content);
      manifest.version = version;
      return JSON.stringify(manifest, null, 2);
    }
  },
  {
    path: 'CITATION.cff',
    update: (content) => content.replace(/^version: .*/m, `version: ${version}`)
  },
  {
    path: 'README.md',
    update: (content) => content.replace(/version = \{\{\{VERSION\}\}\}/g, `version = {${version}}`)
  }
];

files.forEach(({ path, update }) => {
  try {
    const content = readFileSync(path, 'utf8');
    const updatedContent = update(content);
    writeFileSync(path, updatedContent);
    console.log(`✓ Updated ${path}`);
  } catch (error) {
    console.error(`✗ Failed to update ${path}:`, error.message);
  }
});

console.log(`\n🎉 All files updated to version ${version}`); 