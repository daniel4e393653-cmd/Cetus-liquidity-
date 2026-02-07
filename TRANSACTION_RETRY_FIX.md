# Transaction Retry Logic Fix

## Problem Description

The Cetus Liquidity Rebalance Bot was experiencing transaction failures with the following errors:

```
Failed to add liquidity: Transaction is rejected as invalid by more than 1/3 of validators by stake (non-retriable). 
Non-retriable errors: [Object ID 0x585f068d... Version 0x2e89e253 Digest ... is not available for consumption, 
current version: 0x2e8aa255 ...]
Retriable errors: [Input 0xb8d7d9e66a60c239... has a transaction 3 seconds old pending, above threshold of 1 seconds ...]
```

### Root Cause

These errors occur due to the nature of blockchain transaction processing on Sui:

1. **Stale Object References**: When the bot queries blockchain objects (pools, positions), it receives objects with specific version numbers
2. **Concurrent Updates**: If another transaction updates these objects before the bot's transaction is processed, the object versions change
3. **Version Mismatch**: The bot's transaction fails because it's trying to use outdated object versions

This is a common issue in blockchain applications where state changes rapidly.

## Solution

We implemented a comprehensive retry mechanism with the following features:

### 1. Exponential Backoff Retry Logic

A `retryTransaction` helper method that:
- Retries failed transactions up to 3 times
- Uses exponential backoff delays: 2s → 4s → 8s
- Only retries specific error types
- Throws non-retryable errors immediately

### 2. Smart Error Detection

The retry logic identifies two types of retryable errors:

**Stale Object Errors:**
- Pattern: "is not available for consumption"
- Pattern: "Version" + "Digest" (version mismatch indicators)
- Pattern: "current version:" (explicit version change notification)

**Pending Transaction Errors:**
- Pattern: "pending" + "seconds old" (transaction still processing)
- Pattern: "pending" + "above threshold" (transaction waiting in queue)

Any other error types (insufficient balance, invalid parameters, etc.) are treated as non-retryable and thrown immediately.

### 3. State Refetching

On each retry attempt:
- **For liquidity operations**: Refetches pool state to get the latest object versions
- **For position operations**: Refetches position state to get the latest data
- **Transaction rebuild**: Creates a new transaction with fresh object references

### 4. Applied To All Transaction Types

The retry logic is consistently applied to:
- `openPosition` - Opening new liquidity positions
- `addLiquidity` - Adding liquidity to positions  
- `removeLiquidity` - Removing liquidity from positions

## Implementation Details

### Code Structure

```typescript
private async retryTransaction<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  initialDelayMs: number = 2000
): Promise<T>
```

### Usage Example

```typescript
const result = await this.retryTransaction(
  async () => {
    // Refetch fresh state
    const pool = await sdk.Pool.getPool(poolAddress);
    
    // Build transaction with fresh data
    const payload = await sdk.Position.openPositionTransactionPayload(params);
    
    // Execute transaction
    return await suiClient.signAndExecuteTransaction({
      transaction: payload,
      signer: keypair,
      options: { showEffects: true }
    });
  },
  'open position',
  3,
  2000
);
```

## Benefits

1. **Increased Reliability**: Automatically handles transient blockchain state issues
2. **Better User Experience**: No manual intervention required for common errors
3. **Consistent Behavior**: Same retry logic across all transaction types
4. **Fail-Fast for Real Issues**: Non-retryable errors are immediately reported
5. **Resource Efficient**: Exponential backoff prevents overwhelming the RPC endpoint

## Testing Recommendations

When testing the bot:

1. **Normal Operation**: Bot should successfully execute transactions on first attempt
2. **High Traffic Periods**: Bot should automatically retry and succeed when blockchain is busy
3. **Invalid Configuration**: Bot should fail immediately with clear error messages
4. **Insufficient Funds**: Bot should fail immediately without retrying

## Monitoring

Look for these log messages:

**Successful First Attempt:**
```
[INFO] Executing add liquidity transaction...
[INFO] Liquidity added successfully
```

**Retry Scenario:**
```
[WARN] Retryable error in add liquidity (attempt 1/3): Object ID ... is not available for consumption
[INFO] Retry attempt 2/3 for add liquidity after 2000ms delay
[INFO] Liquidity added successfully
```

**Max Retries Exceeded:**
```
[ERROR] Max retries (3) exceeded for add liquidity
[ERROR] Failed to add liquidity: ...
```

## Configuration

No additional configuration is required. The retry mechanism is built-in with sensible defaults:
- Maximum retries: 3
- Initial delay: 2000ms (2 seconds)
- Backoff multiplier: 2x

These values were chosen based on:
- Sui blockchain block time (~3 seconds)
- Typical RPC endpoint response time
- Balance between reliability and responsiveness

## Future Enhancements

Potential improvements for future versions:

1. **Configurable Retry Parameters**: Allow users to adjust max retries and delays via `.env`
2. **Metrics Collection**: Track retry rates to identify patterns
3. **Adaptive Delays**: Adjust delays based on network congestion
4. **Circuit Breaker**: Temporarily pause operations if too many retries fail
5. **Error Code Mapping**: Use Sui SDK error codes when available for more precise detection

## Related Files

- `src/services/rebalance.ts` - Main implementation
- `src/services/sdk.ts` - SDK initialization
- `src/services/monitor.ts` - Pool and position monitoring

## References

- [Sui Documentation on Object Versioning](https://docs.sui.io/)
- [Cetus Protocol Documentation](https://cetus-1.gitbook.io/cetus-docs)
- [Exponential Backoff Pattern](https://en.wikipedia.org/wiki/Exponential_backoff)
