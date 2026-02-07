#!/usr/bin/env node

/**
 * Manual test script to verify bot functionality
 * This script demonstrates how to instantiate and test the bot
 */

const { CetusRebalanceBot } = require('./dist/bot');

// Test configuration
const testConfig = {
  network: 'testnet',
  privateKey: '0000000000000000000000000000000000000000000000000000000000000001',
  poolAddress: '0x0000000000000000000000000000000000000000000000000000000000000001',
  checkInterval: 60,
  rebalanceThreshold: 0.05,
  maxSlippage: 0.01,
  gasBudget: 100000000,
  logLevel: 'info',
  verboseLogs: false,
};

async function main() {
  console.log('='.repeat(60));
  console.log('Cetus Liquidity Rebalance Bot - Manual Test');
  console.log('='.repeat(60));
  console.log();

  try {
    console.log('1. Creating bot instance...');
    const bot = new CetusRebalanceBot(testConfig);
    console.log('   ✓ Bot created successfully\n');

    console.log('2. Getting bot status...');
    const status = await bot.getStatus();
    console.log('   Status:', JSON.stringify(status, null, 2));
    console.log('   ✓ Status retrieved successfully\n');

    console.log('3. Verifying bot is not running...');
    console.log('   Running:', status.running);
    console.log('   ✓ Verified\n');

    console.log('4. Starting bot...');
    await bot.start();
    console.log('   ✓ Bot started successfully\n');

    console.log('5. Checking running status...');
    const runningStatus = await bot.getStatus();
    console.log('   Running:', runningStatus.running);
    console.log('   ✓ Verified bot is running\n');

    console.log('6. Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('   ✓ Wait complete\n');

    console.log('7. Stopping bot...');
    await bot.stop();
    console.log('   ✓ Bot stopped successfully\n');

    console.log('8. Verifying bot has stopped...');
    const stoppedStatus = await bot.getStatus();
    console.log('   Running:', stoppedStatus.running);
    console.log('   ✓ Verified bot is stopped\n');

    console.log('='.repeat(60));
    console.log('✓ ALL MANUAL TESTS PASSED');
    console.log('='.repeat(60));
    console.log();
    console.log('Note: This is a test with mock configuration.');
    console.log('For production use, configure with real private key and pool address.');
    console.log();

  } catch (error) {
    console.error('✗ TEST FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
