# Fix: Add Liquidity Error Logging and Coin Merging Timing

## Problem Statement

From the logs provided:
```
[2026-02-09T17:37:59.390Z] [WARN] Add liquidity attempt 1 failed
[2026-02-09T17:38:08.293Z] [WARN] Add liquidity attempt 2 failed
[2026-02-09T17:38:08.322Z] [ERROR] Rebalance failed
```

The bot was failing during add liquidity operations, but the actual error message was not visible in the logs, making it impossible to diagnose the root cause.

## Root Causes Identified

### 1. Error Logging Issue
The `logger.warn()` method only displays error details when `VERBOSE_LOGS=true` environment variable is set. When errors occurred during liquidity operations, the error object was passed to `logger.warn()`, but the error details were not shown in the output.

### 2. Coin Merging Timing Issue  
Coin merging was happening INSIDE the retry loop:
- **First attempt**: Merge 16 coin objects → Wait 2s → Create payload → Execute → FAIL
- **Second attempt**: Try to merge again (already merged, skip) → Wait 2s → Create payload → Execute → FAIL

This caused:
- Redundant merge attempts on each retry
- Insufficient wait time for SDK to see merged coins (only 2 seconds after first merge)
- SDK potentially using stale coin object references

## Solutions Implemented

### Fix 1: Enhanced Error Logging

**File**: `src/services/rebalance-simple.ts`  
**Lines**: 231, 321

Changed from:
```typescript
logger.warn(`Add liquidity attempt ${attempt + 1} failed`, lastError);
```

To:
```typescript
logger.error(`Add liquidity attempt ${attempt + 1} failed: ${lastError.message}`, lastError);
```

**Benefits**:
- Error message is ALWAYS visible (not just in verbose mode)
- Error message is in the log string for immediate visibility
- Full error object with stack trace is logged for detailed debugging
- Users can now see what's actually causing the failure

### Fix 2: Optimized Coin Merging

**File**: `src/services/rebalance-simple.ts`  
**Lines**: 267-276

Moved coin merging OUTSIDE the retry loop:

**Before**:
```typescript
for (let attempt = 0; attempt < 2; attempt++) {
  await this.mergeCoins(poolInfo.coinTypeA);  // Merge on every attempt
  await this.mergeCoins(poolInfo.coinTypeB);  // Merge on every attempt
  await delay(2000);
  // Try transaction
}
```

**After**:
```typescript
// Merge ONCE before all retries
await this.mergeCoins(poolInfo.coinTypeA);
await this.mergeCoins(poolInfo.coinTypeB);
await delay(5000);  // Increased delay

for (let attempt = 0; attempt < 2; attempt++) {
  // Only retry the transaction, not the merge
}
```

**Benefits**:
- Coins merge only once, not on every retry
- More efficient (fewer redundant operations)
- Better timing (longer wait after merge for propagation)
- Retry logic only retries the transaction

### Fix 3: Increased Propagation Delay

**File**: `src/services/rebalance-simple.ts`  
**Line**: 9

Changed:
```typescript
const COIN_MERGE_PROPAGATION_DELAY_MS = 2000; // Old: 2 seconds
```

To:
```typescript
const COIN_MERGE_PROPAGATION_DELAY_MS = 5000; // New: 5 seconds
```

**Benefits**:
- More time for blockchain state to propagate
- More time for SDK to refresh its coin cache
- Reduces risk of SDK using stale coin object references
- Better reliability for add liquidity transactions

## Technical Details

### Coin Merging Flow

The `mergeCoins()` method (lines 335-437):
1. Fetches all coin objects for a coin type
2. If 0 or 1 coin object, skip merging
3. Sort coins by balance (largest first)
4. Merge all smaller coins into primary coin
5. Wait 5 seconds (COIN_MERGE_FINALITY_DELAY_MS) for finalization
6. Verify merge succeeded
7. If still fragmented, wait another 5 seconds

### Add Liquidity Flow After Fix

Now the flow is:
1. Log "Adding liquidity"
2. **Merge coinA** (if multiple objects exist)
3. **Merge coinB** (if multiple objects exist)  
4. **Wait 5 seconds** for SDK to see merged coins
5. **Attempt 1**: Create payload → Execute transaction
6. If fails, wait 2 seconds
7. **Attempt 2**: Create payload → Execute transaction (coins already merged)
8. If fails, throw error with visible message

## Expected Logs After Fix

### Successful Rebalance
```
[INFO] Position is OUT of range - rebalancing
[INFO] Starting rebalance
[INFO] Removing liquidity
[INFO] Liquidity removed successfully
[INFO] Adding liquidity
[DEBUG] Merging coin objects before add liquidity transaction
[INFO] Merging 16 coin objects into primary coin for [coinTypeA]
[INFO] Successfully merged coins for [coinTypeA]
[INFO] No coin merging needed for [coinTypeB] (1 coin objects)
[DEBUG] Waiting for coin merge propagation before creating add liquidity payload...
[INFO] Liquidity added successfully
[INFO] Rebalance completed successfully
```

### Failed Rebalance (with visible error)
```
[INFO] Adding liquidity
[DEBUG] Merging coin objects before add liquidity transaction
[INFO] Successfully merged coins for both tokens
[DEBUG] Waiting for coin merge propagation...
[ERROR] Add liquidity attempt 1 failed: Insufficient balance for token A
[ERROR] Add liquidity attempt 2 failed: Insufficient balance for token A
[ERROR] Rebalance failed
```

Note: Now the actual error message "Insufficient balance for token A" is visible!

## Verification Steps

### 1. Check Error Visibility
Run the bot and if add liquidity fails, you should now see:
```
[ERROR] Add liquidity attempt X failed: [ACTUAL ERROR MESSAGE]
```

The actual error message (e.g., "Insufficient balance", "Invalid tick range", "MoveAbort error") will be visible.

### 2. Verify Coin Merging Happens Once
Look for these log patterns:
```
[INFO] Merging X coin objects...     <- Should appear ONCE
[INFO] Successfully merged coins...   <- Should appear ONCE per token
[ERROR] Add liquidity attempt 1...    <- May appear if transaction fails
[ERROR] Add liquidity attempt 2...    <- May appear if retry also fails
```

You should NOT see "Merging X coin objects" multiple times in a row.

### 3. Verify Timing
The logs should show:
- Coin merge completes
- 5-second wait
- Add liquidity attempts

There should be ~5 seconds between "Successfully merged coins" and "Add liquidity attempt".

## Common Errors Now Visible

With this fix, you can now diagnose:

1. **Insufficient Balance**: 
   ```
   [ERROR] Add liquidity attempt 1 failed: Insufficient balance for coin type X
   ```
   **Solution**: Ensure wallet has enough tokens

2. **Invalid Tick Range**:
   ```
   [ERROR] Add liquidity attempt 1 failed: Invalid tick range [X, Y]
   ```
   **Solution**: Check RANGE_WIDTH configuration

3. **MoveAbort Errors**:
   ```
   [ERROR] Add liquidity attempt 1 failed: MoveAbort(module: pool_script, function: repay_add_liquidity, code: X)
   ```
   **Solution**: Specific to the error code shown

4. **Gas Budget Insufficient**:
   ```
   [ERROR] Add liquidity attempt 1 failed: Insufficient gas budget
   ```
   **Solution**: Increase GAS_BUDGET in .env

5. **Slippage Too Tight**:
   ```
   [ERROR] Add liquidity attempt 1 failed: Slippage tolerance exceeded
   ```
   **Solution**: Increase MAX_SLIPPAGE in .env

## Testing Recommendations

### Test 1: Dry Run
```bash
DRY_RUN=true npm run dev
```
Verify logs are clear and informative.

### Test 2: With Verbose Logs
```bash
VERBOSE_LOGS=true npm run dev
```
Verify you see detailed error information including stack traces.

### Test 3: Normal Operation
```bash
npm run dev
```
Verify error messages are visible even without VERBOSE_LOGS.

## Related Files Modified

- `src/services/rebalance-simple.ts`:
  - Line 9: Increased COIN_MERGE_PROPAGATION_DELAY_MS
  - Line 231: Changed warn to error with message
  - Line 267-276: Moved coin merging outside retry loop
  - Line 321: Changed warn to error with message

## Impact Assessment

### Risk Level: Low
- Changes only affect error logging and timing
- Core logic unchanged
- No breaking changes to configuration
- Backward compatible

### Benefits:
- ✅ Error messages now visible for debugging
- ✅ More efficient (merge once vs. merge per retry)
- ✅ Better reliability (longer propagation delay)
- ✅ Easier troubleshooting for users

### No Impact On:
- Configuration files
- Pool interaction logic
- Position tracking
- SDK integration
- Transaction execution logic

## Conclusion

These changes address the immediate problem (invisible error messages) and improve the reliability of the add liquidity operation by optimizing coin merging timing. Users can now diagnose and fix the actual issues causing add liquidity failures.

The fixes are minimal, focused, and low-risk while providing significant debugging improvements.
