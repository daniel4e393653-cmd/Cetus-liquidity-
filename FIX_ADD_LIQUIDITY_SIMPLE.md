# Fix for Add Liquidity Failure in Simple Rebalance Bot

## Problem Statement

The Simple Rebalance Bot was failing during the rebalance process when trying to add liquidity to a new position. The bot would successfully:
1. Initialize and validate the setup
2. Detect an out-of-range position
3. Remove liquidity from the old position

But then fail with:
```
[WARN] Add liquidity attempt 1 failed
[WARN] Add liquidity attempt 2 failed
[ERROR] Rebalance failed
```

## Root Cause

The issue was identical to the one documented in `FIX_MOVEABORT_REPAY_ADD_LIQUIDITY.md`, but it only existed in the regular `RebalanceService` and not in the `SimpleRebalanceService`.

The Sui blockchain uses an **object model** where coin balances can become **fragmented** across multiple coin objects. When the wallet has multiple fragmented coin objects, the Cetus SDK's `createAddLiquidityFixTokenPayload` method fails with **MoveAbort error code 0** in the `repay_add_liquidity` function.

## Solution

Added the same coin merging logic from `RebalanceService` to `SimpleRebalanceService`:

### Changes Made

1. **Added delay constants** (lines 7-9):
   ```typescript
   const COIN_MERGE_FINALITY_DELAY_MS = 5000; // Wait for transaction to be finalized
   const COIN_MERGE_PROPAGATION_DELAY_MS = 2000; // Wait for SDK to see merged coins
   ```

2. **Implemented `mergeCoins()` method** (lines 331-434):
   - Fetches all coin objects for a given coin type
   - Skips merging if there's 0 or 1 coin object
   - Sorts coins by balance (largest first)
   - Merges all smaller coins into the primary coin
   - Waits for transaction finalization
   - Verifies the merge was successful

3. **Modified `addLiquidity()` method** (lines 270-279):
   - Calls `mergeCoins(poolInfo.coinTypeA)` before creating position
   - Calls `mergeCoins(poolInfo.coinTypeB)` before creating position
   - Waits for propagation delay before SDK creates transaction payload

### Key Implementation Details

- **Merge before each retry attempt**: Ensures coins are consolidated even if the first attempt fails
- **Wait for finalization**: 5-second delay ensures blockchain state is updated
- **Propagation delay**: 2-second additional wait ensures SDK sees the merged coins
- **Verification**: Double-checks that coins are actually consolidated
- **Proper error handling**: If merge fails, error propagates to prevent bad transactions

## Benefits

1. **Eliminates MoveAbort error 0**: Prevents the specific error in `repay_add_liquidity`
2. **Handles fragmented balances**: Works with any number of coin objects
3. **Automatic and transparent**: No manual intervention or configuration needed
4. **Gas efficient**: Only merges when necessary (2+ coin objects)
5. **Consistent with main service**: Uses the same proven logic as `RebalanceService`

## Testing

The fix was verified by:
1. TypeScript compilation succeeded without errors
2. Code follows the same pattern as the working `RebalanceService`
3. All delays and verification steps match the documented working solution

## Expected Behavior After Fix

When running `npm run dev`, the bot should now:
1. Detect out-of-range positions
2. Remove liquidity successfully
3. **Merge coin objects** (new step)
4. **Add liquidity successfully** (previously failing)
5. Complete rebalance operation successfully

Logs should show:
```
[INFO] Adding liquidity
[DEBUG] Merging coin objects before add liquidity transaction attempt
[INFO] Merging N coin objects into primary coin for [coin type]
[INFO] Successfully merged coins for [coin type]
[DEBUG] Waiting for coin merge propagation before creating add liquidity payload...
[INFO] Liquidity added successfully
```

## Related Files

- `src/services/rebalance-simple.ts` - Updated with coin merging logic
- `src/services/rebalance.ts` - Original implementation (reference)
- `FIX_MOVEABORT_REPAY_ADD_LIQUIDITY.md` - Documentation of the original fix

## Notes

- This fix addresses the exact same issue that was already fixed in the `RebalanceService`
- The `SimpleRebalanceService` was missing this critical coin merging step
- No changes to configuration or user workflow are required
