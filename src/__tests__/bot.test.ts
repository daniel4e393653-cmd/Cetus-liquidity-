import { CetusRebalanceBot } from '../bot';
import { BotConfig } from '../config';

describe('CetusRebalanceBot Tests', () => {
  let bot: CetusRebalanceBot;
  let testConfig: BotConfig;

  beforeEach(() => {
    // Create test configuration
    testConfig = {
      network: 'testnet',
      privateKey: '0000000000000000000000000000000000000000000000000000000000000001',
      poolAddress: '0x123',
      checkInterval: 60,
      rebalanceThreshold: 0.05,
      maxSlippage: 0.01,
      gasBudget: 100000000,
      logLevel: 'error',
      verboseLogs: false,
    };
    
    bot = new CetusRebalanceBot(testConfig);
  });

  afterEach(async () => {
    // Clean up - stop the bot if it's running
    await bot.stop();
  });

  describe('Constructor', () => {
    it('should initialize bot successfully', () => {
      expect(bot).toBeDefined();
    });

    it('should create bot with valid configuration', () => {
      const testBot = new CetusRebalanceBot(testConfig);
      expect(testBot).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return bot status', async () => {
      const status = await bot.getStatus();
      
      expect(status).toBeDefined();
      expect(status.running).toBeDefined();
      expect(status.address).toBeDefined();
      expect(status.network).toBeDefined();
      expect(status.poolAddress).toBeDefined();
    });

    it('should show running as false initially', async () => {
      const status = await bot.getStatus();
      expect(status.running).toBe(false);
    });

    it('should show correct network', async () => {
      const status = await bot.getStatus();
      expect(status.network).toBe('testnet');
    });

    it('should show correct pool address', async () => {
      const status = await bot.getStatus();
      expect(status.poolAddress).toBe('0x123');
    });

    it('should return valid Sui address', async () => {
      const status = await bot.getStatus();
      expect(status.address).toBeDefined();
      expect(typeof status.address).toBe('string');
      expect(status.address.startsWith('0x')).toBe(true);
    });
  });

  describe('start and stop', () => {
    it('should start the bot', async () => {
      await bot.start();
      const status = await bot.getStatus();
      expect(status.running).toBe(true);
    });

    it('should stop the bot', async () => {
      await bot.start();
      await bot.stop();
      const status = await bot.getStatus();
      expect(status.running).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await bot.start();
      await bot.start(); // Second start should be handled gracefully
      const status = await bot.getStatus();
      expect(status.running).toBe(true);
    });

    it('should handle multiple stop calls gracefully', async () => {
      await bot.start();
      await bot.stop();
      await bot.stop(); // Second stop should be handled gracefully
      const status = await bot.getStatus();
      expect(status.running).toBe(false);
    });

    it('should handle stop without start', async () => {
      await bot.stop();
      const status = await bot.getStatus();
      expect(status.running).toBe(false);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop correctly', async () => {
      const statusBefore = await bot.getStatus();
      expect(statusBefore.running).toBe(false);

      await bot.start();
      const statusRunning = await bot.getStatus();
      expect(statusRunning.running).toBe(true);

      await bot.stop();
      const statusAfter = await bot.getStatus();
      expect(statusAfter.running).toBe(false);
    });

    it('should maintain state across multiple cycles', async () => {
      // First cycle
      await bot.start();
      await bot.stop();

      // Second cycle
      await bot.start();
      const status = await bot.getStatus();
      expect(status.running).toBe(true);
      await bot.stop();
    });
  });

  describe('Configuration', () => {
    it('should work with mainnet configuration', () => {
      const mainnetConfig = { ...testConfig, network: 'mainnet' as const };
      const mainnetBot = new CetusRebalanceBot(mainnetConfig);
      expect(mainnetBot).toBeDefined();
    });

    it('should work with custom check interval', () => {
      const customConfig = { ...testConfig, checkInterval: 120 };
      const customBot = new CetusRebalanceBot(customConfig);
      expect(customBot).toBeDefined();
    });

    it('should work with custom rebalance threshold', () => {
      const customConfig = { ...testConfig, rebalanceThreshold: 0.10 };
      const customBot = new CetusRebalanceBot(customConfig);
      expect(customBot).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization with invalid private key', () => {
      const invalidConfig = { ...testConfig, privateKey: 'invalid' };
      expect(() => new CetusRebalanceBot(invalidConfig)).toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should create bot with all services initialized', () => {
      const integrationBot = new CetusRebalanceBot(testConfig);
      expect(integrationBot).toBeDefined();
    });

    it('should support full lifecycle with short interval', async () => {
      const quickConfig = { ...testConfig, checkInterval: 1 }; // Very short interval for testing
      const quickBot = new CetusRebalanceBot(quickConfig);
      
      await quickBot.start();
      
      // Wait a bit to ensure at least one check happens
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await quickBot.stop();
      
      const status = await quickBot.getStatus();
      expect(status.running).toBe(false);
    }, 10000); // Extended timeout for this test
  });

  describe('Multiple Bots', () => {
    it('should support multiple bot instances', () => {
      const bot1 = new CetusRebalanceBot(testConfig);
      const bot2 = new CetusRebalanceBot(testConfig);
      
      expect(bot1).toBeDefined();
      expect(bot2).toBeDefined();
    });

    it('should have same address for bots with same private key', async () => {
      const bot1 = new CetusRebalanceBot(testConfig);
      const bot2 = new CetusRebalanceBot(testConfig);
      
      const status1 = await bot1.getStatus();
      const status2 = await bot2.getStatus();
      
      expect(status1.address).toBe(status2.address);
    });
  });
});
