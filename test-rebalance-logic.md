# Test Plan for Rebalance Logic

## Changes Made

### 1. Enhanced `addLiquidity` Method
- **Before**: Only opened a position but didn't add liquidity
- **After**: Opens position AND adds liquidity using SDK's `createAddLiquidityFixTokenPayload`
- **Key improvement**: Uses the fix token method which automatically calculates the correct liquidity amount

### 2. Improved Error Handling in `rebalancePosition`
- **Before**: If `removeLiquidity` failed, the entire rebalance failed and no liquidity was added
- **After**: Catches removal errors and continues to add liquidity to new position
- **Key improvement**: Ensures liquidity is always added even if removal fails

### 3. Added Liquidity Check Before Removal
- **Before**: Always tried to remove liquidity, even if position had none
- **After**: Checks if position has liquidity before attempting removal
- **Key improvement**: Prevents MoveAbort errors from trying to remove zero liquidity

## Expected Flow

### Scenario 1: Normal Rebalance (Position has liquidity)
1. Check if position is out of range ✓
2. Calculate new optimal range ✓
3. Check if position has liquidity ✓
4. Remove liquidity from old position ✓
5. Open new position ✓
6. Add liquidity to new position ✓

### Scenario 2: Position Already Empty
1. Check if position is out of range ✓
2. Calculate new optimal range ✓
3. Check if position has liquidity → FALSE
4. Skip removal step ✓
5. Open new position ✓
6. Add liquidity to new position ✓

### Scenario 3: Removal Fails
1. Check if position is out of range ✓
2. Calculate new optimal range ✓
3. Check if position has liquidity ✓
4. Try to remove liquidity → FAILS
5. Catch error and log ✓
6. Open new position ✓
7. Add liquidity to new position ✓

## Testing Notes

The bot should now:
- ✅ Always add liquidity back after removing it
- ✅ Handle errors during removal gracefully
- ✅ Not fail when position has 0 liquidity
- ✅ Use SDK's automated liquidity calculation for correct amounts
- ✅ Provide detailed logging for debugging

## Verification

To verify the fix works:
1. Set up environment variables in `.env`
2. Run `npm run dev` or `DRY_RUN=true npm run dev` for testing
3. Monitor logs for:
   - "Adding liquidity to position..."
   - "Liquidity added successfully"
   - Position ID and transaction digest
