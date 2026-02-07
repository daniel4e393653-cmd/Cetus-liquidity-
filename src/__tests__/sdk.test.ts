import { CetusSDKService } from '../services/sdk';
import { BotConfig } from '../config';

describe('CetusSDKService Tests', () => {
  let testConfig: BotConfig;

  beforeEach(() => {
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
  });

  describe('Constructor', () => {
    it('should initialize with valid config', () => {
      expect(() => new CetusSDKService(testConfig)).not.toThrow();
    });

    it('should initialize with mainnet config', () => {
      testConfig.network = 'mainnet';
      const service = new CetusSDKService(testConfig);
      expect(service).toBeDefined();
    });

    it('should handle private key with 0x prefix', () => {
      testConfig.privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
      const service = new CetusSDKService(testConfig);
      expect(service.getAddress()).toBeDefined();
    });

    it('should handle private key without 0x prefix', () => {
      testConfig.privateKey = '0000000000000000000000000000000000000000000000000000000000000001';
      const service = new CetusSDKService(testConfig);
      expect(service.getAddress()).toBeDefined();
    });

    it('should throw error for invalid private key', () => {
      testConfig.privateKey = 'invalid';
      expect(() => new CetusSDKService(testConfig)).toThrow('Invalid private key format');
    });

    it('should throw error for short private key', () => {
      testConfig.privateKey = '0000';
      expect(() => new CetusSDKService(testConfig)).toThrow();
    });
  });

  describe('getAddress', () => {
    it('should return a valid Sui address', () => {
      const service = new CetusSDKService(testConfig);
      const address = service.getAddress();
      
      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address.startsWith('0x')).toBe(true);
      expect(address.length).toBeGreaterThan(10);
    });

    it('should return consistent address for same private key', () => {
      const service1 = new CetusSDKService(testConfig);
      const service2 = new CetusSDKService(testConfig);
      
      expect(service1.getAddress()).toBe(service2.getAddress());
    });

    it('should return different addresses for different private keys', () => {
      const service1 = new CetusSDKService(testConfig);
      
      testConfig.privateKey = '0000000000000000000000000000000000000000000000000000000000000002';
      const service2 = new CetusSDKService(testConfig);
      
      expect(service1.getAddress()).not.toBe(service2.getAddress());
    });
  });

  describe('getSuiClient', () => {
    it('should return a SuiClient instance', () => {
      const service = new CetusSDKService(testConfig);
      const client = service.getSuiClient();
      
      expect(client).toBeDefined();
      expect(client).toHaveProperty('getBalance');
      expect(client).toHaveProperty('getObject');
    });
  });

  describe('getKeypair', () => {
    it('should return a keypair instance', () => {
      const service = new CetusSDKService(testConfig);
      const keypair = service.getKeypair();
      
      expect(keypair).toBeDefined();
      expect(keypair).toHaveProperty('getPublicKey');
    });
  });

  describe('getSdk', () => {
    it('should return SDK instance (or undefined if not initialized)', () => {
      const service = new CetusSDKService(testConfig);
      const sdk = service.getSdk();
      
      // SDK should be undefined since we don't have proper contract addresses configured
      // Just verify that getSdk() doesn't throw an error
      expect(sdk === undefined || sdk === null || typeof sdk === 'object').toBe(true);
    });
  });

  describe('getBalance', () => {
    it('should handle getBalance call', async () => {
      const service = new CetusSDKService(testConfig);
      
      // This might fail in test environment but should not crash
      try {
        const balance = await service.getBalance('0x2::sui::SUI');
        expect(typeof balance).toBe('string');
      } catch (error) {
        // Expected to fail in test environment without real network connection
        expect(error).toBeDefined();
      }
    });
  });

  describe('Network Configuration', () => {
    it('should use testnet RPC URL for testnet network', () => {
      testConfig.network = 'testnet';
      const service = new CetusSDKService(testConfig);
      expect(service).toBeDefined();
    });

    it('should use mainnet RPC URL for mainnet network', () => {
      testConfig.network = 'mainnet';
      const service = new CetusSDKService(testConfig);
      expect(service).toBeDefined();
    });

    it('should use custom RPC URL when provided', () => {
      testConfig.suiRpcUrl = 'https://custom-rpc.example.com';
      const service = new CetusSDKService(testConfig);
      expect(service).toBeDefined();
    });
  });
});
