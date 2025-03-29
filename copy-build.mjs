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

// Files to copy
const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];

/**
 * Copy plugin files to all target directories
 */
export function copyBuildFiles() {
  // Process each target directory
  pluginDirs.forEach(pluginDir => {
    // Create directory if needed
    if (!fs.existsSync(pluginDir)) {
      fs.mkdirSync(pluginDir, { recursive: true });
      console.log(`Created directory: ${pluginDir}`);
    }

    // Copy all files
    let filesCopied = 0;
    let errors = 0;
    
    filesToCopy.forEach(file => {
      const sourcePath = path.join(__dirname, file);
      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, path.join(pluginDir, file));
        filesCopied++;
      } else {
        console.error(`✗ ${file} not found`);
        errors++;
      }
    });
    
    // Log a summary
    console.log(`✓ Copied ${filesCopied} files to ${pluginDir}`);
    if (errors > 0) {
      console.log(`  (${errors} errors encountered)`);
    }
  });
}

// If this script is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyBuildFiles();
} 