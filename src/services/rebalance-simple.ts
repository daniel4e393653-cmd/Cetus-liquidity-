import { CetusSDKService } from './sdk';
import { PositionMonitorService, PoolInfo, PositionInfo } from './monitor';
import { BotConfig } from '../config';
import { logger } from '../utils/logger';
import { Transaction } from '@mysten/sui/transactions';

// Delay constants for coin merging
const COIN_MERGE_FINALITY_DELAY_MS = 5000; // Wait for transaction to be finalized
const COIN_MERGE_PROPAGATION_DELAY_MS = 2000; // Wait for SDK to see merged coins

export interface RebalanceResult {
  success: boolean;
  transactionDigest?: string;
  error?: string;
  oldPosition?: {
    tickLower: number;
    tickUpper: number;
  };
  newPosition?: {
    tickLower: number;
    tickUpper: number;
  };
}

// Type definitions for SDK parameters
interface AddLiquidityFixTokenParams {
  pool_id: string;
  pos_id: string; // Empty string when opening a new position
  tick_lower: number;
  tick_upper: number;
  amount_a: string;
  amount_b: string;
  slippage: number;
  fix_amount_a: boolean;
  is_open: boolean;
  coinTypeA: string;
  coinTypeB: string;
  collect_fee: boolean;
  rewarder_coin_types: string[];
}

/**
 * Simple Rebalance Service
 * 
 * This is a simplified version that focuses on core rebalancing functionality:
 * - Monitors a single position (must be configured via POSITION_ID)
 * - Removes liquidity from out-of-range position
 * - Adds liquidity to new optimal range
 * - Uses configured token amounts (TOKEN_A_AMOUNT, TOKEN_B_AMOUNT)
 * - No coin merging, no swaps, no complex retry logic
 */
export class SimpleRebalanceService {
  private sdkService: CetusSDKService;
  private monitorService: PositionMonitorService;
  private config: BotConfig;

  constructor(
    sdkService: CetusSDKService,
    monitorService: PositionMonitorService,
    config: BotConfig
  ) {
    this.sdkService = sdkService;
    this.monitorService = monitorService;
    this.config = config;

    // Note: Required fields (positionId, tokenAAmount, tokenBAmount) are validated at config load time
    
    logger.info('Simple Rebalance Service initialized', {
      positionId: config.positionId,
      tokenAAmount: config.tokenAAmount,
      tokenBAmount: config.tokenBAmount,
    });
  }

  /**
   * Check if rebalance is needed and execute if so
   */
  async checkAndRebalance(poolAddress: string): Promise<RebalanceResult | null> {
    try {
      // Get current pool state and the tracked position
      const poolInfo = await this.monitorService.getPoolInfo(poolAddress);
      const ownerAddress = this.sdkService.getAddress();
      const allPositions = await this.monitorService.getPositions(ownerAddress);
      
      // Find the configured position
      const position = allPositions.find(p => p.positionId === this.config.positionId);
      
      if (!position) {
        logger.warn(`Tracked position ${this.config.positionId} not found`);
        return null;
      }

      // Check if position needs rebalancing
      const isInRange = this.monitorService.isPositionInRange(
        position.tickLower,
        position.tickUpper,
        poolInfo.currentTickIndex,
      );

      if (isInRange && !this.monitorService.shouldRebalance(position, poolInfo)) {
        logger.info(
          `Position ${position.positionId} is in range ` +
          `[${position.tickLower}, ${position.tickUpper}] at tick ${poolInfo.currentTickIndex} - no rebalance needed`,
        );
        return null;
      }

      logger.info(
        `Position ${position.positionId} is OUT of range ` +
        `[${position.tickLower}, ${position.tickUpper}] at tick ${poolInfo.currentTickIndex} - rebalancing`,
      );

      return await this.rebalancePosition(poolAddress, position, poolInfo);
    } catch (error) {
      logger.error('Check and rebalance failed', error);
      throw error;
    }
  }

  /**
   * Execute the rebalance: remove liquidity from old position and add to new position
   */
  private async rebalancePosition(
    poolAddress: string,
    position: PositionInfo,
    poolInfo: PoolInfo,
  ): Promise<RebalanceResult> {
    try {
      logger.info('Starting rebalance', {
        positionId: position.positionId,
        currentTick: poolInfo.currentTickIndex,
        oldRange: { lower: position.tickLower, upper: position.tickUpper },
      });

      // Calculate new optimal range
      const { lower, upper } = this.monitorService.calculateOptimalRange(
        poolInfo.currentTickIndex,
        poolInfo.tickSpacing,
      );

      logger.info('New range calculated', {
        newRange: { lower, upper },
      });

      // Step 1: Remove liquidity from old position (if it has liquidity)
      const hasLiquidity = position.liquidity && BigInt(position.liquidity) > 0n;
      
      if (hasLiquidity) {
        await this.removeLiquidity(position.positionId, position.liquidity);
        logger.info('Liquidity removed from old position');
      } else {
        logger.info('Old position has no liquidity - skipping removal');
      }

      // Step 2: Add liquidity to new position
      const txDigest = await this.addLiquidity(poolInfo, lower, upper);
      
      logger.info('Rebalance completed successfully', {
        oldRange: { lower: position.tickLower, upper: position.tickUpper },
        newRange: { lower, upper },
        transactionDigest: txDigest,
      });

      return {
        success: true,
        transactionDigest: txDigest,
        oldPosition: { tickLower: position.tickLower, tickUpper: position.tickUpper },
        newPosition: { tickLower: lower, tickUpper: upper },
      };
    } catch (error) {
      logger.error('Rebalance failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove liquidity from a position
   */
  private async removeLiquidity(positionId: string, liquidity: string): Promise<void> {
    logger.info('Removing liquidity', { positionId, liquidity });

    const sdk = this.sdkService.getSdk();
    const keypair = this.sdkService.getKeypair();
    const suiClient = this.sdkService.getSuiClient();

    // Get position details to get pool info
    const position = await sdk.Position.getPositionById(positionId);
    const pool = await sdk.Pool.getPool(position.pool);

    // Create remove liquidity payload
    const removeLiquidityPayload = await sdk.Position.removeLiquidityTransactionPayload({
      pool_id: position.pool,
      pos_id: positionId,
      delta_liquidity: liquidity,
      min_amount_a: '0', // Accept any amount (simple mode)
      min_amount_b: '0', // Accept any amount (simple mode)
      coinTypeA: pool.coinTypeA,
      coinTypeB: pool.coinTypeB,
      collect_fee: true,
      rewarder_coin_types: [],
    });

    removeLiquidityPayload.setGasBudget(this.config.gasBudget);

    // Execute transaction with simple retry (2 attempts)
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await suiClient.signAndExecuteTransaction({
          transaction: removeLiquidityPayload,
          signer: keypair,
          options: { showEffects: true },
        });

        if (result.effects?.status?.status !== 'success') {
          throw new Error(
            `Remove liquidity failed: ${result.effects?.status?.error || 'Unknown error'}`,
          );
        }

        logger.info('Liquidity removed successfully', { 
          digest: result.digest,
          attempt: attempt + 1,
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Remove liquidity attempt ${attempt + 1} failed: ${lastError.message}`, lastError);
        
        if (attempt < 1) {
          // Wait 2 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    throw lastError || new Error('Remove liquidity failed after retries');
  }

  /**
   * Add liquidity to a new position at the specified tick range
   */
  private async addLiquidity(
    poolInfo: PoolInfo,
    tickLower: number,
    tickUpper: number,
  ): Promise<string> {
    logger.info('Adding liquidity', {
      poolAddress: poolInfo.poolAddress,
      tickLower,
      tickUpper,
      tokenAAmount: this.config.tokenAAmount,
      tokenBAmount: this.config.tokenBAmount,
    });

    const sdk = this.sdkService.getSdk();
    const keypair = this.sdkService.getKeypair();
    const suiClient = this.sdkService.getSuiClient();

    // Use configured amounts (required in simple mode)
    const amountA = this.config.tokenAAmount!;
    const amountB = this.config.tokenBAmount!;

    // Execute transaction with simple retry (2 attempts)
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Merge coins before add liquidity to prevent MoveAbort error 0 in repay_add_liquidity.
        logger.debug('Merging coin objects before add liquidity transaction attempt');
        await this.mergeCoins(poolInfo.coinTypeA);
        await this.mergeCoins(poolInfo.coinTypeB);

        // Additional safety delay to ensure all coin merges are fully propagated
        // before the SDK creates the add liquidity transaction payload.
        logger.debug('Waiting for coin merge propagation before creating add liquidity payload...');
        await new Promise(resolve => setTimeout(resolve, COIN_MERGE_PROPAGATION_DELAY_MS));

        // Create open position (new position)
        const openPositionPayload = await sdk.Position.createAddLiquidityFixTokenPayload({
          pool_id: poolInfo.poolAddress,
          pos_id: '', // Empty string for new position
          tick_lower: tickLower,
          tick_upper: tickUpper,
          amount_a: amountA,
          amount_b: amountB,
          slippage: this.config.maxSlippage,
          fix_amount_a: true,
          is_open: true, // Create new position
          coinTypeA: poolInfo.coinTypeA,
          coinTypeB: poolInfo.coinTypeB,
          collect_fee: false,
          rewarder_coin_types: [],
        } as AddLiquidityFixTokenParams);

        openPositionPayload.setGasBudget(this.config.gasBudget);

        const result = await suiClient.signAndExecuteTransaction({
          transaction: openPositionPayload,
          signer: keypair,
          options: { showEffects: true },
        });

        if (result.effects?.status?.status !== 'success') {
          throw new Error(
            `Add liquidity failed: ${result.effects?.status?.error || 'Unknown error'}`,
          );
        }

        logger.info('Liquidity added successfully', { 
          digest: result.digest,
          attempt: attempt + 1,
        });
        return result.digest;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(`Add liquidity attempt ${attempt + 1} failed: ${lastError.message}`, lastError);
        
        if (attempt < 1) {
          // Wait 2 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    throw lastError || new Error('Add liquidity failed after retries');
  }

  /**
   * Merge all coin objects of a given type into a single coin.
   * This prevents MoveAbort error 0 in repay_add_liquidity caused by fragmented coin balances.
   */
  private async mergeCoins(coinType: string): Promise<void> {
    try {
      const suiClient = this.sdkService.getSuiClient();
      const keypair = this.sdkService.getKeypair();
      const ownerAddress = this.sdkService.getAddress();

      // Get all coin objects for this coin type
      const allCoins = await suiClient.getCoins({
        owner: ownerAddress,
        coinType,
      });

      if (!allCoins.data || allCoins.data.length <= 1) {
        // No merging needed if there's 0 or 1 coin object
        logger.debug(`No coin merging needed for ${coinType} (${allCoins.data?.length || 0} coin objects)`);
        return;
      }

      // Sort coins by balance (largest first) to use the largest as primary
      const sortedCoins = allCoins.data.sort((a, b) => {
        const balanceA = BigInt(a.balance);
        const balanceB = BigInt(b.balance);
        return balanceB > balanceA ? 1 : balanceB < balanceA ? -1 : 0;
      });

      const primaryCoin = sortedCoins[0];
      const coinsToMerge = sortedCoins.slice(1).map(coin => coin.coinObjectId);

      logger.info(`Merging ${coinsToMerge.length} coin objects into primary coin for ${coinType}`, {
        primaryCoinId: primaryCoin.coinObjectId,
        primaryBalance: primaryCoin.balance,
        coinsToMerge: coinsToMerge.length,
      });

      // Create a transaction to merge all coins into the primary coin
      const tx = new Transaction();
      tx.mergeCoins(
        tx.object(primaryCoin.coinObjectId),
        coinsToMerge.map(id => tx.object(id))
      );
      
      // Set sender address for proper gas coin selection
      tx.setSender(ownerAddress);
      
      // Set gas budget
      tx.setGasBudget(this.config.gasBudget);

      // Execute the merge transaction
      const result = await suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(`Failed to merge coins: ${result.effects?.status?.error || 'Unknown error'}`);
      }

      logger.info(`Successfully merged coins for ${coinType}`, {
        digest: result.digest,
      });

      // Wait for transaction to be finalized and coin object to be available.
      // Without this delay, the SDK may attempt to use stale coin object references,
      // leading to MoveAbort error 0 in repay_add_liquidity.
      await new Promise(resolve => setTimeout(resolve, COIN_MERGE_FINALITY_DELAY_MS));

      // Verify the merge was successful by checking that coins are now consolidated
      const verifyCoins = await suiClient.getCoins({
        owner: ownerAddress,
        coinType,
      });

      if (verifyCoins.data && verifyCoins.data.length > 1) {
        // If still fragmented, wait additional time for propagation
        logger.warn(`Coins still fragmented after merge (${verifyCoins.data.length} objects), waiting for propagation...`);
        await new Promise(resolve => setTimeout(resolve, COIN_MERGE_FINALITY_DELAY_MS));
        
        // Second verification
        const secondVerify = await suiClient.getCoins({
          owner: ownerAddress,
          coinType,
        });
        
        if (secondVerify.data && secondVerify.data.length > 1) {
          throw new Error(
            `Coin merge failed to consolidate ${coinType}. Expected 1 coin object but found ${secondVerify.data.length} after waiting ${COIN_MERGE_FINALITY_DELAY_MS * 2}ms total. ` +
            `This indicates network propagation issues or concurrent transactions.`
          );
        }
        
        logger.info(`After additional wait, ${coinType} now has ${secondVerify.data?.length || 0} coin object(s)`);
      } else {
        logger.debug(`After merge verification: ${coinType} now has ${verifyCoins.data?.length || 0} coin object(s)`);
      }
    } catch (error) {
      logger.error(`Failed to merge coins for ${coinType}`, error);
      throw error;
    }
  }
}
