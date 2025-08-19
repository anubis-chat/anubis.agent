/**
 * Jupiter API Configuration Fix
 * Updates the Jupiter API URL to use the Pro tier with API key support
 */

const fs = require('fs');
const path = require('path');

// Path to the DeFi plugin
const pluginPath = path.join(__dirname, '../node_modules/@symlabs/plugin-defi/dist/index.js');

// Read the file
let content = fs.readFileSync(pluginPath, 'utf8');

// Replace the old API URL with the new one
content = content.replace(
  'jupiterApiUrl = "https://quote-api.jup.ag/v6"',
  'jupiterApiUrl = "https://api.jup.ag"'
);

// Also update the fetch calls to include the API key header
content = content.replace(
  /const response = await fetch\(`\$\{this\.jupiterApiUrl\}\/tokens`\);/g,
  `const response = await fetch(\`\${this.jupiterApiUrl}/tokens\`, {
    headers: { 'x-api-key': process.env.JUPITER_API_KEY || '' }
  });`
);

content = content.replace(
  /const response = await fetch\(`\$\{this\.jupiterApiUrl\}\/quote\?/g,
  'const response = await fetch(`${this.jupiterApiUrl}/v6/quote?'
);

content = content.replace(
  /const response = await fetch\(`\$\{this\.jupiterApiUrl\}\/swap/g,
  'const response = await fetch(`${this.jupiterApiUrl}/v6/swap'
);

// Write the updated content back
fs.writeFileSync(pluginPath, content, 'utf8');

console.log('✅ Jupiter API configuration fixed!');
console.log('   - Updated API URL to https://api.jup.ag');
console.log('   - Added API key header support');
console.log('   - Fixed endpoint paths for v6 API');