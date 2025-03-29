import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define patterns to check for
const FORBIDDEN_PATTERNS = [
  { pattern: /\.innerHTML\s*=/, name: 'innerHTML assignment' },
  { pattern: /\.outerHTML\s*=/, name: 'outerHTML assignment' },
  { pattern: /\$\(.*\)\.html\(/, name: 'jQuery html() method' },
  { pattern: /insertAdjacentHTML/, name: 'insertAdjacentHTML method' },
  { pattern: /document\.write/, name: 'document.write' }
];

// Define files and directories to scan
// Adjust these paths based on your project structure
const DIRECTORIES_TO_SCAN = [
  './main.ts',
  './src'
];

/**
 * Check a file for forbidden patterns
 * 
 * @param {string} filePath - Path to the file to check
 * @returns {Array} - Array of violations found
 */
function checkFile(filePath) {
  try {
    // Skip directories
    if (fs.statSync(filePath).isDirectory()) {
      return [];
    }
    
    // Skip non-JavaScript/TypeScript files
    if (!['.js', '.ts', '.jsx', '.tsx'].includes(path.extname(filePath))) {
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const violations = [];
    
    // Check each line for forbidden patterns
    const lines = content.split('\n');
    lines.forEach((line, lineNumber) => {
      FORBIDDEN_PATTERNS.forEach(({ pattern, name }) => {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: lineNumber + 1,
            text: line.trim(),
            pattern: name
          });
        }
      });
    });
    
    return violations;
  } catch (error) {
    console.error(`Error checking file ${filePath}:`, error);
    return [];
  }
}

/**
 * Recursively scan a directory for files
 * 
 * @param {string} dir - Directory to scan
 * @returns {Array} - Array of file paths
 */
function scanDirectory(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  if (fs.statSync(dir).isFile()) {
    return [dir];
  }
  
  let files = [];
  
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    
    // Skip node_modules and hidden directories
    if (entry === 'node_modules' || entry.startsWith('.')) {
      continue;
    }
    
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(scanDirectory(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Main function to check code quality
 */
export function checkCodeQuality() {
  let allViolations = [];
  
  // Scan each directory/file
  for (const dirPath of DIRECTORIES_TO_SCAN) {
    const targetPath = path.resolve(__dirname, dirPath);
    if (fs.existsSync(targetPath)) {
      const files = scanDirectory(targetPath);
      
      for (const file of files) {
        const violations = checkFile(file);
        allViolations = allViolations.concat(violations);
      }
    }
  }
  
  // Report violations
  if (allViolations.length > 0) {
    console.error('\n❌ Detected Obsidian.md guideline violations:');
    console.error('====================================================');
    
    allViolations.forEach(violation => {
      console.error(`File: ${violation.file}`);
      console.error(`Line ${violation.line}: ${violation.pattern} detected`);
      console.error(`  ${violation.text}`);
      console.error('----------------------------------------------------');
    });
    
    console.error(`\nTotal violations found: ${allViolations.length}`);
    console.error('Obsidian.md guidelines prohibit direct HTML string manipulation.');
    console.error('Please use proper DOM API methods instead.');
    console.error('====================================================\n');
    
    // Exit with error code to fail the build
    return false;
  } else {
    console.log('✅ No Obsidian.md guideline violations detected.');
    return true;
  }
}

// Run the check if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkCodeQuality();
  if (!result) {
    process.exit(1);
  }
} 