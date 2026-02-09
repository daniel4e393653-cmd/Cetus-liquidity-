import { CetusSDKService } from './services/sdk';
import { PositionMonitorService } from './services/monitor';
import { SimpleRebalanceService } from './services/rebalance-simple';
import { config } from './config';
import { logger } from './utils/logger';
import { retryWithBackoff } from './utils/retry';

export class CetusRebalanceBot {
  private sdkService: CetusSDKService;
  private monitorService: PositionMonitorService;
  private rebalanceService: SimpleRebalanceService;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    logger.info('Initializing Simple Cetus Rebalance Bot...');
    
    // Initialize services
    this.sdkService = new CetusSDKService(config);
    this.monitorService = new PositionMonitorService(this.sdkService, config);
    this.rebalanceService = new SimpleRebalanceService(
      this.sdkService,
      this.monitorService,
      config
    );

    logger.info('Simple Bot initialized', {
      network: config.network,
      address: this.sdkService.getAddress(),
      poolAddress: config.poolAddress,
      positionId: config.positionId,
      checkInterval: config.checkInterval,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    // Validate environment setup before starting
    await this.validateSetup();

    this.isRunning = true;
    logger.info('Bot started successfully');

    // Perform initial check
    await this.performCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(async () => {
      await this.performCheck();
    }, config.checkInterval * 1000);

    logger.info(`Bot running - checking every ${config.checkInterval} seconds`);
  }

  private async validateSetup(): Promise<void> {
    try {
      logger.info('Validating simple bot setup...');

      // Check wallet balance
      const address = this.sdkService.getAddress();
      logger.info(`Using wallet address: ${address}`);

      const suiClient = this.sdkService.getSuiClient();
      
      // Get SUI balance with retries
      try {
        const balance = await retryWithBackoff(
          () => suiClient.getBalance({
            owner: address,
            coinType: '0x2::sui::SUI',
          }),
          'getBalance',
        );
        const suiBalance = parseFloat(balance.totalBalance) / 1_000_000_000; // Convert MIST to SUI
        logger.info(`Wallet SUI balance: ${suiBalance.toFixed(4)} SUI`);
        
        if (suiBalance < 0.1) {
          logger.warn(`Low SUI balance (${suiBalance.toFixed(4)} SUI). You may not have enough for gas fees.`);
        }
      } catch (error) {
        logger.warn('Could not fetch wallet balance after retries. Continuing anyway...', error);
      }

      // Validate pool exists
      logger.info(`Validating pool address: ${config.poolAddress}`);
      try {
        const poolInfo = await this.monitorService.getPoolInfo(config.poolAddress);
        logger.info('Pool validation successful', {
          poolAddress: poolInfo.poolAddress,
          currentTick: poolInfo.currentTickIndex,
          coinTypeA: poolInfo.coinTypeA,
          coinTypeB: poolInfo.coinTypeB,
        });
      } catch (error) {
        logger.error('Pool validation failed. Cannot start bot.');
        throw new Error('Invalid pool configuration. Please check POOL_ADDRESS in .env file.');
      }

      // Validate the configured position exists
      // Note: POSITION_ID is validated at config load time, here we check if it exists on-chain
      try {
        const positions = await this.monitorService.getPositions(address);
        const position = positions.find(p => p.positionId === config.positionId);
        
        if (position) {
          logger.info(`Tracking position: ${config.positionId}`, {
            poolAddress: position.poolAddress,
            tickRange: `[${position.tickLower}, ${position.tickUpper}]`,
            liquidity: position.liquidity,
            inRange: position.inRange,
          });
        } else {
          logger.error(`Configured POSITION_ID ${config.positionId} not found.`);
          throw new Error(`Position ${config.positionId} not found. Please check POSITION_ID in .env file.`);
        }
      } catch (error) {
        logger.error('Could not validate position', error);
        throw error;
      }

      // Note: Token amounts are validated at config load time
      logger.info('Setup validation completed successfully', {
        tokenAAmount: config.tokenAAmount,
        tokenBAmount: config.tokenBAmount,
      });
    } catch (error) {
      logger.error('Setup validation failed', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Bot is not running');
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('Bot stopped');
  }

  private async performCheck(): Promise<void> {
    try {
      logger.info('=== Performing position check ===');

      const result = await this.rebalanceService.checkAndRebalance(config.poolAddress);

      if (result) {
        logger.info('Rebalance executed', {
          success: result.success,
          transactionDigest: result.transactionDigest,
          oldPosition: result.oldPosition,
          newPosition: result.newPosition,
        });
      } else {
        logger.info('No rebalance needed');
      }
    } catch (error) {
      logger.error('Error during position check', error);
    }
  }

  async getStatus(): Promise<{
    running: boolean;
    address: string;
    network: string;
    poolAddress: string;
  }> {
    return {
      running: this.isRunning,
      address: this.sdkService.getAddress(),
      network: config.network,
      poolAddress: config.poolAddress,
    };
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal - shutting down...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal - shutting down...');
  process.exit(0);
});
