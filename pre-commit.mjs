#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkCodeQuality } from './code-quality-check.mjs';

// Get the directory where this script is located
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Running pre-commit checks...');

// Run code quality check
const qualityCheckPassed = checkCodeQuality();

if (!qualityCheckPassed) {
  console.error('\n❌ Pre-commit check failed: Found Obsidian.md guideline violations.');
  console.error('   Please fix these issues before committing.\n');
  process.exit(1);
}

console.log('✅ All pre-commit checks passed.');
process.exit(0); 