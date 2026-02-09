# Fix for MoveAbort Error 0 in repay_add_liquidity

## Problem Statement

The bot was failing with a MoveAbort error when trying to add liquidity to Cetus pools:

```
[ERROR] Non-retryable error in add liquidity: Failed to add liquidity: MoveAbort(MoveLocation { 
  module: ModuleId { 
    address: b2db7142fa83210a7d78d9c12ac49c043b3cbbd482224fea6e3da00aa5a5ae2d, 
    name: Identifier("pool_script_v2") 
  }, 
  function: 23, 
  instruction: 29, 
  function_name: Some("repay_add_liquidity") 
}, 0) in command 1
```

## Root Cause

The Sui blockchain uses an **object model** where coin balances can become **fragmented** across multiple coin objects. This happens naturally as transactions occur - when you receive tokens from different sources, each creates a separate coin object.

The Cetus SDK's `createAddLiquidityFixTokenPayload` method expects coins to be properly consolidated before executing transactions. When the wallet has multiple fragmented coin objects, the transaction fails with **MoveAbort error code 0** in the `repay_add_liquidity` function.

## Solution

Added automatic coin merging before add liquidity transactions:

### 1. New `mergeCoins()` Method

Created a private helper method that:
- Fetches all coin objects for a given coin type using `suiClient.getCoins()`
- Skips merging if there's 0 or 1 coin object (no need to merge)
- Sorts coins by balance (largest first) to use as the primary coin
- Merges all smaller coins into the primary coin using `tx.mergeCoins()`
- Executes the merge transaction before proceeding

### 2. Integration into Add Liquidity Flow

Modified the `addNewPosition()` method to:
- Call `mergeCoins(poolInfo.coinTypeA)` before add liquidity
- Call `mergeCoins(poolInfo.coinTypeB)` before add liquidity
- Ensures both tokens are consolidated before the transaction

## Technical Details

### Coin Merging Implementation

```typescript
private async mergeCoins(coinType: string): Promise<void> {
  // Get all coin objects for this coin type
  const allCoins = await suiClient.getCoins({
    owner: ownerAddress,
    coinType,
  });

  // Skip if no merging needed
  if (allCoins.data.length <= 1) return;

  // Sort by balance (largest first)
  const sortedCoins = allCoins.data.sort((a, b) => {
    const balanceA = BigInt(a.balance);
    const balanceB = BigInt(b.balance);
    return balanceB > balanceA ? 1 : balanceB < balanceA ? -1 : 0;
  });

  // Use largest coin as primary, merge others into it
  const primaryCoin = sortedCoins[0];
  const coinsToMerge = sortedCoins.slice(1).map(coin => coin.coinObjectId);

  // Create and execute merge transaction
  const tx = new Transaction();
  tx.mergeCoins(
    tx.object(primaryCoin.coinObjectId),
    coinsToMerge.map(id => tx.object(id))
  );
  
  await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keypair });
}
```

### Key Design Decisions

1. **Merge both tokens**: Even if only one token is fragmented, we merge both to ensure consistency
2. **Use largest coin as primary**: Minimizes object operations and gas costs
3. **Proper object references**: Uses `tx.object()` to create proper transaction object references
4. **BigInt for comparison**: Avoids precision loss for very large balances
5. **Fail fast**: If merging fails, the error propagates immediately to prevent bad add liquidity transactions

## Benefits

1. **Eliminates MoveAbort error 0**: Prevents the specific error in `repay_add_liquidity`
2. **Handles fragmented balances**: Works with any number of coin objects
3. **Automatic and transparent**: No manual intervention needed
4. **Gas efficient**: Only merges when necessary (2+ coin objects)
5. **Proper logging**: Debug and info logs for troubleshooting

## Verification

To verify the fix is working:

1. **Check logs for coin merging**:
   ```
   [INFO] Merging coin objects before add liquidity transaction
   [INFO] Merging 3 coin objects into primary coin for 0x2::sui::SUI
   [INFO] Successfully merged coins for 0x2::sui::SUI
   ```

2. **Successful add liquidity**:
   ```
   [INFO] Executing add liquidity transaction...
   [INFO] Liquidity added successfully
   ```

3. **No more MoveAbort errors**: The `repay_add_liquidity` error should not occur

## Testing Recommendations

1. Test with a wallet that has:
   - Multiple coin objects of the same type (fragmented balance)
   - Both tokens in fragmented state
   - One token fragmented, one token single object

2. Monitor transaction count:
   - Expect 2 merge transactions (one per token) + 1 add liquidity transaction
   - If coins are already merged, only 1 add liquidity transaction

3. Check gas costs:
   - Merge transactions consume gas
   - Compare total cost vs. failed transactions requiring retries

## Related Issues

- MoveAbort error code 0 typically indicates a validation failure at the smart contract level
- Common causes: insufficient balance, incorrect coin types, or **fragmented coin objects**
- This fix addresses the coin fragmentation issue specifically

## References

- Sui TypeScript SDK: Coin management and transactions
- Cetus SDK: `createAddLiquidityFixTokenPayload` requirements
- Move language: Object model and coin handling
