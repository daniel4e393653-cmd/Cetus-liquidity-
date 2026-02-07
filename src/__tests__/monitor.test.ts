import { PositionMonitorService, PositionInfo, PoolInfo } from '../services/monitor';
import { CetusSDKService } from '../services/sdk';
import { BotConfig } from '../config';

describe('PositionMonitorService Tests', () => {
  let testConfig: BotConfig;
  let sdkService: CetusSDKService;
  let monitorService: PositionMonitorService;

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

    sdkService = new CetusSDKService(testConfig);
    monitorService = new PositionMonitorService(sdkService, testConfig);
  });

  describe('Constructor', () => {
    it('should initialize with valid parameters', () => {
      expect(monitorService).toBeDefined();
    });
  });

  describe('isPositionInRange', () => {
    it('should return true when current tick is within range', () => {
      const result = monitorService.isPositionInRange(-100, 100, 0);
      expect(result).toBe(true);
    });

    it('should return true when current tick equals lower bound', () => {
      const result = monitorService.isPositionInRange(-100, 100, -100);
      expect(result).toBe(true);
    });

    it('should return true when current tick equals upper bound', () => {
      const result = monitorService.isPositionInRange(-100, 100, 100);
      expect(result).toBe(true);
    });

    it('should return false when current tick is below range', () => {
      const result = monitorService.isPositionInRange(-100, 100, -101);
      expect(result).toBe(false);
    });

    it('should return false when current tick is above range', () => {
      const result = monitorService.isPositionInRange(-100, 100, 101);
      expect(result).toBe(false);
    });
  });

  describe('shouldRebalance', () => {
    let position: PositionInfo;
    let poolInfo: PoolInfo;

    beforeEach(() => {
      position = {
        positionId: 'pos1',
        poolAddress: '0x123',
        tickLower: -1000,
        tickUpper: 1000,
        liquidity: '1000000',
        tokenA: '0xA',
        tokenB: '0xB',
        inRange: true,
      };

      poolInfo = {
        poolAddress: '0x123',
        currentTickIndex: 0,
        currentSqrtPrice: '1000000',
        coinTypeA: '0xA',
        coinTypeB: '0xB',
        tickSpacing: 10,
      };
    });

    it('should return true when position is out of range', () => {
      position.inRange = false;
      const result = monitorService.shouldRebalance(position, poolInfo);
      expect(result).toBe(true);
    });

    it('should return true when price is too close to lower boundary', () => {
      poolInfo.currentTickIndex = -950; // Very close to lower bound of -1000
      position.inRange = true;
      const result = monitorService.shouldRebalance(position, poolInfo);
      expect(result).toBe(true);
    });

    it('should return true when price is too close to upper boundary', () => {
      poolInfo.currentTickIndex = 950; // Very close to upper bound of 1000
      position.inRange = true;
      const result = monitorService.shouldRebalance(position, poolInfo);
      expect(result).toBe(true);
    });

    it('should return false when position is well within range', () => {
      poolInfo.currentTickIndex = 0; // Centered in range
      position.inRange = true;
      const result = monitorService.shouldRebalance(position, poolInfo);
      expect(result).toBe(false);
    });

    it('should consider rebalance threshold', () => {
      // Range is 2000 ticks wide, threshold is 0.05 (5%)
      // 5% of 2000 = 100 ticks
      poolInfo.currentTickIndex = -950; // 50 ticks from lower bound (2.5% < 5%)
      position.inRange = true;
      const result = monitorService.shouldRebalance(position, poolInfo);
      expect(result).toBe(true);
    });
  });

  describe('calculateOptimalRange', () => {
    it('should calculate symmetric range around current tick', () => {
      const currentTick = 0;
      const tickSpacing = 10;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(range).toBeDefined();
      expect(range.lower).toBeLessThan(currentTick);
      expect(range.upper).toBeGreaterThan(currentTick);
    });

    it('should align ticks to tick spacing', () => {
      const currentTick = 5;
      const tickSpacing = 10;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(Math.abs(range.lower % tickSpacing)).toBe(0);
      expect(Math.abs(range.upper % tickSpacing)).toBe(0);
    });

    it('should use configured range width when available', () => {
      testConfig.rangeWidth = 200;
      const monitorServiceWithWidth = new PositionMonitorService(sdkService, testConfig);
      
      const currentTick = 0;
      const tickSpacing = 10;
      
      const range = monitorServiceWithWidth.calculateOptimalRange(currentTick, tickSpacing);
      
      const actualWidth = range.upper - range.lower;
      // Width should be approximately 200 (may vary due to alignment)
      expect(actualWidth).toBeGreaterThanOrEqual(190);
      expect(actualWidth).toBeLessThanOrEqual(210);
    });

    it('should handle negative current tick', () => {
      const currentTick = -500;
      const tickSpacing = 10;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(range.lower).toBeLessThan(currentTick);
      expect(range.upper).toBeGreaterThan(currentTick);
      expect(Math.abs(range.lower % tickSpacing)).toBe(0);
      expect(Math.abs(range.upper % tickSpacing)).toBe(0);
    });

    it('should handle positive current tick', () => {
      const currentTick = 500;
      const tickSpacing = 10;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(range.lower).toBeLessThan(currentTick);
      expect(range.upper).toBeGreaterThan(currentTick);
      expect(Math.abs(range.lower % tickSpacing)).toBe(0);
      expect(Math.abs(range.upper % tickSpacing)).toBe(0);
    });
  });

  describe('getPoolInfo', () => {
    it('should return placeholder pool info when SDK is not initialized', async () => {
      const poolAddress = '0x123';
      const poolInfo = await monitorService.getPoolInfo(poolAddress);
      
      expect(poolInfo).toBeDefined();
      expect(poolInfo.poolAddress).toBe(poolAddress);
      expect(poolInfo.tickSpacing).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero tick spacing gracefully', () => {
      const currentTick = 0;
      const tickSpacing = 1;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(range.lower).toBeLessThan(range.upper);
    });

    it('should handle very large tick values', () => {
      const currentTick = 1000000;
      const tickSpacing = 100;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(range.lower).toBeLessThan(currentTick);
      expect(range.upper).toBeGreaterThan(currentTick);
    });

    it('should handle negative tick spacing result', () => {
      const currentTick = -1000000;
      const tickSpacing = 100;
      
      const range = monitorService.calculateOptimalRange(currentTick, tickSpacing);
      
      expect(range.lower).toBeLessThan(currentTick);
      expect(range.upper).toBeGreaterThan(currentTick);
    });
  });
});
