import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define plugin directories
const pluginDirs = [
  '/Users/erictaylor/Documents/Author/Book Trisan Series/Trisan Obsidian Vault .nosync/.obsidian/plugins/manuscript-calendar',
  '/Users/erictaylor/Documents/Code Projects/Test Obsidian Vault/.obsidian/plugins/manuscript-calendar'
];

// Files to copy - ADD README.md HERE
const filesToCopy = ['main.js', 'manifest.json', 'styles.css', 'README.md', 'screenshot.png'];

/**
 * Copy plugin files to all target directories
 */
export function copyBuildFiles() {
  // Prevent execution in CI environments (like GitHub Actions)
  if (process.env.CI) {
    console.log("Skipping local vault copy in CI environment.");
    return;
  }

  let totalFilesCopied = 0;
  let totalErrors = 0;

  // Process each target directory
  pluginDirs.forEach(pluginDir => {
    // Create directory if needed
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
      console.log(`Created directory: ${pluginDir}`);
    }

    // Copy all files listed in filesToCopy
    let filesCopiedInDir = 0;
    let errorsInDir = 0;
    
    filesToCopy.forEach(file => {
      const sourcePath = path.join(__dirname, file);
      const destPath = path.join(pluginDir, file);
      if (fs.existsSync(sourcePath)) {
        try {
          fs.copyFileSync(sourcePath, destPath);
          filesCopiedInDir++;
        } catch (err) {
          console.error(`✗ Error copying ${file} to ${pluginDir}:`, err);
          errorsInDir++;
        }
      } else {
        console.error(`✗ Source file not found: ${sourcePath}`);
        errorsInDir++;
      }
    });
    
    // Log per-directory summary
    console.log(`✓ Copied ${filesCopiedInDir} files to ${pluginDir}`);
    if (errorsInDir > 0) {
      console.log(`  (${errorsInDir} errors encountered for this directory)`);
    }
    totalFilesCopied += filesCopiedInDir;
    totalErrors += errorsInDir;
  });

  // Log a final summary (optional but potentially useful)
  console.log(`-----`);
  console.log(`Build Copy Summary: Copied ${totalFilesCopied} files total across ${pluginDirs.length} directories.`);
  if (totalErrors > 0) {
    console.log(`  Total errors encountered: ${totalErrors}`);
  }
  console.log(`-----`);
}

// If this script is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyBuildFiles();
} 