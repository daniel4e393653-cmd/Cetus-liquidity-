import { CetusSDKService } from './services/sdk';
import { PositionMonitorService } from './services/monitor';
import { RebalanceService } from './services/rebalance';
import { loadConfig, BotConfig } from './config';
import { logger } from './utils/logger';

export class CetusRebalanceBot {
  private sdkService: CetusSDKService;
  private monitorService: PositionMonitorService;
  private rebalanceService: RebalanceService;
  private config: BotConfig;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(config?: BotConfig) {
    // Load config if not provided
    this.config = config || loadConfig();
    
    logger.info('Initializing Cetus Rebalance Bot...');
    
    // Initialize services
    this.sdkService = new CetusSDKService(this.config);
    this.monitorService = new PositionMonitorService(this.sdkService, this.config);
    this.rebalanceService = new RebalanceService(
      this.sdkService,
      this.monitorService,
      this.config
    );

    logger.info('Bot initialized successfully', {
      network: this.config.network,
      address: this.sdkService.getAddress(),
      poolAddress: this.config.poolAddress,
      checkInterval: this.config.checkInterval,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bot is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting Cetus Rebalance Bot...');

    // Perform initial check
    await this.performCheck();

    // Schedule periodic checks
    this.intervalId = setInterval(async () => {
      await this.performCheck();
    }, this.config.checkInterval * 1000);

    logger.info(`Bot started - checking every ${this.config.checkInterval} seconds`);
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

      const result = await this.rebalanceService.checkAndRebalance(this.config.poolAddress);

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
      network: this.config.network,
      poolAddress: this.config.poolAddress,
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
