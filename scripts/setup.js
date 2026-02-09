#!/usr/bin/env node

/**
 * Setup script for Cetus Liquidity Rebalance Bot
 * Cross-platform setup that works on Windows, macOS, and Linux
 */

const fs = require('fs');
const path = require('path');

const envExamplePath = path.join(__dirname, '..', '.env.example');
const envPath = path.join(__dirname, '..', '.env');

try {
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    console.log('\n⚠️  .env file already exists. Skipping copy.');
    console.log('If you want to reset your configuration, delete .env and run this script again.\n');
    process.exit(0);
  }

  // Check if .env.example exists
  if (!fs.existsSync(envExamplePath)) {
    console.error('\n❌ Error: .env.example file not found!');
    console.error('Please make sure you are running this from the project root directory.\n');
    process.exit(1);
  }

  // Copy .env.example to .env
  fs.copyFileSync(envExamplePath, envPath);
  
  console.log('\n✅ Setup complete! .env file created from .env.example');
  console.log('\n📝 Next steps:');
  console.log('   1. Edit the .env file with your configuration');
  console.log('   2. Set your PRIVATE_KEY, POOL_ADDRESS, POSITION_ID, TOKEN_A_AMOUNT, and TOKEN_B_AMOUNT');
  console.log('   3. Run "npm run dev" to start the bot\n');
  console.log('📚 For detailed configuration instructions, see README.md\n');
  
} catch (error) {
  console.error('\n❌ Setup failed:', error.message, '\n');
  process.exit(1);
}
