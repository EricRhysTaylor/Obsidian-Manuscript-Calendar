const fs = require('fs');
const path = require('path');

// Define plugin directories
const pluginDirs = [
  '/Users/erictaylor/Documents/Author/Book Trisan Series/Trisan Obsidian Vault .nosync/.obsidian/plugins/manuscript-calendar',
  '/Users/erictaylor/Documents/Code Projects/Test Obsidian Vault/.obsidian/plugins/manuscript-calendar'
];

// Files to copy
const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];

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
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(pluginDir, file));
      filesCopied++;
    } else {
      console.error(`✗ ${file} not found`);
      errors++;
    }
  });
  
  // Log a summary instead of individual files but with full path
  console.log(`✓ Copied ${filesCopied} files to ${pluginDir}`);
  if (errors > 0) {
    console.log(`  (${errors} errors encountered)`);
  }
});

// Watch mode
if (process.argv.includes('watch')) {
  console.log('Watching for changes...');
  
  fs.watch('.', (eventType, filename) => {
    if (filesToCopy.includes(filename)) {
      let timestamp = new Date().toLocaleTimeString();
      let updatedCount = 0;
      
      pluginDirs.forEach(pluginDir => {
        try {
          fs.copyFileSync(filename, path.join(pluginDir, filename));
          updatedCount++;
        } catch (error) {
          console.error(`${timestamp} ✗ Error copying ${filename} to ${pluginDir}: ${error.message}`);
        }
      });
      
      console.log(`${timestamp} ✓ Updated ${filename} in ${updatedCount} location(s):`);
      pluginDirs.forEach(dir => console.log(`  → ${dir}`));
    }
  });
} 