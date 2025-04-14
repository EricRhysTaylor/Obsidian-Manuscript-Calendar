import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define patterns to check for HTML manipulation
const HTML_MANIPULATION_PATTERNS = [
  { pattern: /\.innerHTML\s*=/, name: 'innerHTML assignment' },
  { pattern: /\.outerHTML\s*=/, name: 'outerHTML assignment' },
  { pattern: /\$\(.*\)\.html\(/, name: 'jQuery html() method' },
  { pattern: /insertAdjacentHTML/, name: 'insertAdjacentHTML method' },
  { pattern: /document\.write/, name: 'document.write' }
];

// Define patterns for inline style manipulation
const INLINE_STYLE_PATTERNS = [
  { pattern: /\.style\./, name: 'inline style manipulation' },
  { pattern: /style=["']/, name: 'inline style attribute' },
  { pattern: /\.setAttribute\(\s*["']style["']/, name: 'style attribute via setAttribute' }
];

// Define patterns for checking CSS declarations in JS/TS files
const CSS_IN_JS_PATTERNS = [
  { pattern: /\bbackground\s*:/, name: 'CSS background property' },
  { pattern: /\bcolor\s*:/, name: 'CSS color property' },
  { pattern: /\bfont-size\s*:/, name: 'CSS font-size property' },
  { pattern: /\bmargin\b/, name: 'CSS margin property' },
  { pattern: /\bpadding\b/, name: 'CSS padding property' },
  { pattern: /\bdisplay\s*:/, name: 'CSS display property' },
  { pattern: /\bposition\s*:/, name: 'CSS position property' },
  { pattern: /\bwidth\s*:/, name: 'CSS width property' },
  { pattern: /\bheight\s*:/, name: 'CSS height property' },
  { pattern: /\bborder\b/, name: 'CSS border property' }
];

// Define files and directories to scan
// Adjust these paths based on your project structure
const DIRECTORIES_TO_SCAN = [
  './main.ts',
  './src'
];

// Define patterns to ignore (exceptions)
const ALLOWED_EXCEPTIONS = [
  // Allow setting CSS variables for tooltip positioning (essential for UX)
  { pattern: /root\.style\.setProperty\('--tooltip-left'/, name: 'tooltip positioning' },
  { pattern: /root\.style\.setProperty\('--tooltip-top'/, name: 'tooltip positioning' }
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
    
    const fileExt = path.extname(filePath);
    
    // Skip non-JavaScript/TypeScript files for most checks
    if (!['.js', '.ts', '.jsx', '.tsx'].includes(fileExt)) {
      return [];
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const violations = [];
    
    // Check each line for forbidden patterns
    const lines = content.split('\n');
    lines.forEach((line, lineNumber) => {
      // Skip lines that match exception patterns
      let isException = false;
      for (const exception of ALLOWED_EXCEPTIONS) {
        if (exception.pattern.test(line)) {
          isException = true;
          break;
        }
      }
      
      if (isException) {
        return; // Skip this line
      }
      
      // Check for HTML manipulation patterns
      HTML_MANIPULATION_PATTERNS.forEach(({ pattern, name }) => {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: lineNumber + 1,
            text: line.trim(),
            pattern: name,
            category: 'HTML Manipulation'
          });
        }
      });
      
      // Check for inline style patterns
      INLINE_STYLE_PATTERNS.forEach(({ pattern, name }) => {
        if (pattern.test(line)) {
          violations.push({
            file: filePath,
            line: lineNumber + 1,
            text: line.trim(),
            pattern: name,
            category: 'Inline Styles'
          });
        }
      });
      
      // Only check for CSS in JS if not in a CSS comment or template string
      // and if not in styles.css file
      if (!line.includes('//') && !line.includes('/*') && !line.includes('*/') && !line.includes('`') && !filePath.endsWith('styles.css')) {
        CSS_IN_JS_PATTERNS.forEach(({ pattern, name }) => {
          if (pattern.test(line)) {
            violations.push({
              file: filePath,
              line: lineNumber + 1,
              text: line.trim(),
              pattern: name,
              category: 'CSS in JS/TS'
            });
          }
        });
      }
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
 * Check if styles.css exists in the project
 */
function checkStylesCSS() {
  const stylesPath = path.resolve(__dirname, './styles.css');
  return fs.existsSync(stylesPath);
}

/**
 * Main function to check code quality
 */
export function checkCodeQuality() {
  let allViolations = [];
  
  // Check if styles.css exists
  const stylesExist = checkStylesCSS();
  if (!stylesExist) {
    console.error('\n❌ styles.css file not found');
    console.error('Obsidian.md requires CSS to be in a styles.css file in the plugin root directory.');
    return false;
  }
  
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
    
    // Group violations by category
    const categorizedViolations = {};
    allViolations.forEach(violation => {
      if (!categorizedViolations[violation.category]) {
        categorizedViolations[violation.category] = [];
      }
      categorizedViolations[violation.category].push(violation);
    });
    
    // Print violations by category
    Object.keys(categorizedViolations).forEach(category => {
      console.error(`\n${category} violations:`);
      console.error('----------------------------------------------------');
      
      categorizedViolations[category].forEach(violation => {
        console.error(`File: ${violation.file}`);
        console.error(`Line ${violation.line}: ${violation.pattern} detected`);
        console.error(`  ${violation.text}`);
        console.error('----------------------------------------------------');
      });
    });
    
    console.error(`\nTotal violations found: ${allViolations.length}`);
    console.error('Obsidian.md guidelines prohibit:');
    console.error('1. Direct HTML string manipulation');
    console.error('2. Inline styles or style manipulation in JS/TS');
    console.error('3. CSS should be placed in styles.css file');
    console.error('====================================================\n');
    
    // Exit with error code to fail the build
    return false;
  } else {
    console.log('✅ Code quality check passed!');
    return true;
  }
}

// Optional: Allow running this check independently
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const passed = checkCodeQuality();
  if (!passed) {
    process.exit(1);
  }
} 