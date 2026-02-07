import { loadConfig, BotConfig } from '../config';

describe('Configuration Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load configuration from environment variables', () => {
      process.env.NETWORK = 'testnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';
      process.env.CHECK_INTERVAL = '60';
      process.env.REBALANCE_THRESHOLD = '0.05';

      const config = loadConfig();

      expect(config.network).toBe('testnet');
      expect(config.privateKey).toBe('0000000000000000000000000000000000000000000000000000000000000001');
      expect(config.poolAddress).toBe('0x123');
      expect(config.checkInterval).toBe(60);
      expect(config.rebalanceThreshold).toBe(0.05);
    });

    it('should use default values for optional settings', () => {
      process.env.NETWORK = 'mainnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';

      const config = loadConfig();

      expect(config.network).toBe('mainnet');
      expect(config.checkInterval).toBe(300);
      expect(config.rebalanceThreshold).toBe(0.05);
      expect(config.maxSlippage).toBe(0.01);
      expect(config.gasBudget).toBe(100000000);
      expect(config.logLevel).toBe('info');
      expect(config.verboseLogs).toBe(false);
    });

    it('should throw error when required PRIVATE_KEY is missing', () => {
      process.env.NETWORK = 'testnet';
      process.env.POOL_ADDRESS = '0x123';
      delete process.env.PRIVATE_KEY;

      expect(() => loadConfig()).toThrow('Missing required environment variable: PRIVATE_KEY');
    });

    it('should throw error when required POOL_ADDRESS is missing', () => {
      process.env.NETWORK = 'testnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      delete process.env.POOL_ADDRESS;

      expect(() => loadConfig()).toThrow('Missing required environment variable: POOL_ADDRESS');
    });

    it('should throw error for invalid NETWORK value', () => {
      process.env.NETWORK = 'invalid';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';

      expect(() => loadConfig()).toThrow("Invalid NETWORK value: invalid. Must be 'mainnet' or 'testnet'");
    });

    it('should parse numeric values correctly', () => {
      process.env.NETWORK = 'testnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';
      process.env.CHECK_INTERVAL = '120';
      process.env.REBALANCE_THRESHOLD = '0.10';
      process.env.MAX_SLIPPAGE = '0.02';
      process.env.GAS_BUDGET = '200000000';
      process.env.LOWER_TICK = '-50';
      process.env.UPPER_TICK = '150';
      process.env.RANGE_WIDTH = '200';

      const config = loadConfig();

      expect(config.checkInterval).toBe(120);
      expect(config.rebalanceThreshold).toBe(0.10);
      expect(config.maxSlippage).toBe(0.02);
      expect(config.gasBudget).toBe(200000000);
      expect(config.lowerTick).toBe(-50);
      expect(config.upperTick).toBe(150);
      expect(config.rangeWidth).toBe(200);
    });

    it('should parse boolean values correctly', () => {
      process.env.NETWORK = 'testnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';
      process.env.VERBOSE_LOGS = 'true';

      const config = loadConfig();

      expect(config.verboseLogs).toBe(true);
    });

    it('should handle optional token amounts', () => {
      process.env.NETWORK = 'testnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';
      process.env.TOKEN_A_AMOUNT = '1000000';
      process.env.TOKEN_B_AMOUNT = '2000000';

      const config = loadConfig();

      expect(config.tokenAAmount).toBe('1000000');
      expect(config.tokenBAmount).toBe('2000000');
    });

    it('should handle custom RPC URL', () => {
      process.env.NETWORK = 'testnet';
      process.env.PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
      process.env.POOL_ADDRESS = '0x123';
      process.env.SUI_RPC_URL = 'https://custom-rpc.example.com';

      const config = loadConfig();

      expect(config.suiRpcUrl).toBe('https://custom-rpc.example.com');
    });
  });
});
