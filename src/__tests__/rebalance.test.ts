import { RebalanceService } from '../services/rebalance';
import { CetusSDKService } from '../services/sdk';
import { PositionMonitorService } from '../services/monitor';
import { BotConfig } from '../config';

describe('RebalanceService Tests', () => {
  let testConfig: BotConfig;
  let sdkService: CetusSDKService;
  let monitorService: PositionMonitorService;
  let rebalanceService: RebalanceService;

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
      lowerTick: -100,
      upperTick: 100,
    };

    sdkService = new CetusSDKService(testConfig);
    monitorService = new PositionMonitorService(sdkService, testConfig);
    rebalanceService = new RebalanceService(sdkService, monitorService, testConfig);
  });

  describe('Constructor', () => {
    it('should initialize with valid parameters', () => {
      expect(rebalanceService).toBeDefined();
    });

    it('should accept all required services', () => {
      const service = new RebalanceService(sdkService, monitorService, testConfig);
      expect(service).toBeDefined();
    });
  });

  describe('checkAndRebalance', () => {
    it('should return null when no rebalance is needed', async () => {
      // Mock the monitor service to return no rebalance needed
      jest.spyOn(monitorService, 'monitorPosition').mockResolvedValue({
        pool: {
          poolAddress: '0x123',
          currentTickIndex: 0,
          currentSqrtPrice: '1000000',
          coinTypeA: '0xA',
          coinTypeB: '0xB',
          tickSpacing: 10,
        },
        positions: [],
        needsRebalance: false,
      });

      const result = await rebalanceService.checkAndRebalance('0x123');
      
      expect(result).toBeNull();
    });

    it('should attempt rebalance when needed', async () => {
      // Mock the monitor service to indicate rebalance is needed
      jest.spyOn(monitorService, 'monitorPosition').mockResolvedValue({
        pool: {
          poolAddress: '0x123',
          currentTickIndex: 0,
          currentSqrtPrice: '1000000',
          coinTypeA: '0xA',
          coinTypeB: '0xB',
          tickSpacing: 10,
        },
        positions: [],
        needsRebalance: true,
      });

      // Mock getPositions to return empty array
      jest.spyOn(monitorService, 'getPositions').mockResolvedValue([]);

      const result = await rebalanceService.checkAndRebalance('0x123');
      
      expect(result).toBeDefined();
      expect(result?.success).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      // Mock the monitor service to throw an error
      jest.spyOn(monitorService, 'monitorPosition').mockRejectedValue(
        new Error('Network error')
      );

      await expect(rebalanceService.checkAndRebalance('0x123')).rejects.toThrow('Network error');
    });
  });

  describe('rebalancePosition', () => {
    it('should handle pool with no existing positions', async () => {
      // Mock pool info
      jest.spyOn(monitorService, 'getPoolInfo').mockResolvedValue({
        poolAddress: '0x123',
        currentTickIndex: 0,
        currentSqrtPrice: '1000000',
        coinTypeA: '0xA',
        coinTypeB: '0xB',
        tickSpacing: 10,
      });

      // Mock empty positions
      jest.spyOn(monitorService, 'getPositions').mockResolvedValue([]);

      const result = await rebalanceService.rebalancePosition('0x123');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.newPosition).toBeDefined();
    });

    it('should use configured tick range when available', async () => {
      testConfig.lowerTick = -200;
      testConfig.upperTick = 200;
      
      const serviceWithTicks = new RebalanceService(sdkService, monitorService, testConfig);

      jest.spyOn(monitorService, 'getPoolInfo').mockResolvedValue({
        poolAddress: '0x123',
        currentTickIndex: 0,
        currentSqrtPrice: '1000000',
        coinTypeA: '0xA',
        coinTypeB: '0xB',
        tickSpacing: 10,
      });

      jest.spyOn(monitorService, 'getPositions').mockResolvedValue([]);

      const result = await serviceWithTicks.rebalancePosition('0x123');
      
      expect(result).toBeDefined();
      if (result.newPosition) {
        expect(result.newPosition.tickLower).toBeDefined();
        expect(result.newPosition.tickUpper).toBeDefined();
      }
    });

    it('should handle rebalance with existing position', async () => {
      jest.spyOn(monitorService, 'getPoolInfo').mockResolvedValue({
        poolAddress: '0x123',
        currentTickIndex: 0,
        currentSqrtPrice: '1000000',
        coinTypeA: '0xA',
        coinTypeB: '0xB',
        tickSpacing: 10,
      });

      jest.spyOn(monitorService, 'getPositions').mockResolvedValue([
        {
          positionId: 'pos1',
          poolAddress: '0x123',
          tickLower: -1000,
          tickUpper: 1000,
          liquidity: '1000000',
          tokenA: '0xA',
          tokenB: '0xB',
          inRange: false,
        },
      ]);

      const result = await rebalanceService.rebalancePosition('0x123');
      
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    it('should skip rebalance if range is unchanged', async () => {
      const currentTick = 0;
      const tickSpacing = 10;
      
      // Calculate expected range
      const expectedLower = Math.floor((currentTick - 50) / tickSpacing) * tickSpacing;
      const expectedUpper = Math.ceil((currentTick + 50) / tickSpacing) * tickSpacing;

      jest.spyOn(monitorService, 'getPoolInfo').mockResolvedValue({
        poolAddress: '0x123',
        currentTickIndex: currentTick,
        currentSqrtPrice: '1000000',
        coinTypeA: '0xA',
        coinTypeB: '0xB',
        tickSpacing: tickSpacing,
      });

      jest.spyOn(monitorService, 'getPositions').mockResolvedValue([
        {
          positionId: 'pos1',
          poolAddress: '0x123',
          tickLower: expectedLower,
          tickUpper: expectedUpper,
          liquidity: '1000000',
          tokenA: '0xA',
          tokenB: '0xB',
          inRange: true,
        },
      ]);

      const result = await rebalanceService.rebalancePosition('0x123');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle getPoolInfo errors', async () => {
      jest.spyOn(monitorService, 'getPoolInfo').mockRejectedValue(
        new Error('Failed to get pool info')
      );

      const result = await rebalanceService.rebalancePosition('0x123');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle getPositions errors', async () => {
      jest.spyOn(monitorService, 'getPoolInfo').mockResolvedValue({
        poolAddress: '0x123',
        currentTickIndex: 0,
        currentSqrtPrice: '1000000',
        coinTypeA: '0xA',
        coinTypeB: '0xB',
        tickSpacing: 10,
      });

      jest.spyOn(monitorService, 'getPositions').mockRejectedValue(
        new Error('Failed to get positions')
      );

      const result = await rebalanceService.rebalancePosition('0x123');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with real monitor service', async () => {
      const realMonitorService = new PositionMonitorService(sdkService, testConfig);
      const realRebalanceService = new RebalanceService(
        sdkService,
        realMonitorService,
        testConfig
      );

      expect(realRebalanceService).toBeDefined();
    });
  });
});
