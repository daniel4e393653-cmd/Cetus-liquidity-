import assert from 'assert';
import BN from 'bn.js';
import { TickMath, ClmmPoolUtil } from '@cetusprotocol/cetus-sui-clmm-sdk';

/**
 * Tests for the liquidity-preservation rebalance logic.
 *
 * When the bot rebalances a position it must add back the SAME liquidity
 * value (not just the same token amounts) to the new tick range. This
 * ensures leverage and capital efficiency remain constant.
 *
 * The addLiquidity helper now computes the required token amounts from the
 * original liquidity via ClmmPoolUtil.getCoinAmountFromLiquidity(), and the
 * swap logic handles single-sided shortfalls by swapping the surplus token.
 *
 * Run with:  npx ts-node tests/liquidityPreservation.test.ts
 */

// ---------- Helpers ---------------------------------------------------------

/**
 * Reimplements the amount-selection logic from addLiquidity when
 * originalLiquidity is provided (the new liquidity-preserving path).
 */
function computeAmountsFromLiquidity(
  originalLiquidity: string,
  currentSqrtPrice: string,
  tickLower: number,
  tickUpper: number,
  walletBalanceA: string,
  walletBalanceB: string,
  isSuiA: boolean = false,
  isSuiB: boolean = false,
  gasBudget: bigint = 50_000_000n,
): { amountA: string; amountB: string; requiredA: string; requiredB: string } {
  const balanceABigInt = BigInt(walletBalanceA);
  const balanceBBigInt = BigInt(walletBalanceB);

  const safeBalanceA = isSuiA && balanceABigInt > gasBudget
    ? balanceABigInt - gasBudget
    : balanceABigInt;
  const safeBalanceB = isSuiB && balanceBBigInt > gasBudget
    ? balanceBBigInt - gasBudget
    : balanceBBigInt;

  const liqBN = new BN(originalLiquidity);
  const curSqrtPrice = new BN(currentSqrtPrice);
  const lowerSqrtPrice = TickMath.tickIndexToSqrtPriceX64(tickLower);
  const upperSqrtPrice = TickMath.tickIndexToSqrtPriceX64(tickUpper);
  const required = ClmmPoolUtil.getCoinAmountFromLiquidity(
    liqBN, curSqrtPrice, lowerSqrtPrice, upperSqrtPrice, true,
  );
  const reqA = BigInt(required.coinA.toString());
  const reqB = BigInt(required.coinB.toString());
  const amountA = (reqA <= safeBalanceA ? reqA : safeBalanceA > 0n ? safeBalanceA : 0n).toString();
  const amountB = (reqB <= safeBalanceB ? reqB : safeBalanceB > 0n ? safeBalanceB : 0n).toString();

  return { amountA, amountB, requiredA: reqA.toString(), requiredB: reqB.toString() };
}

/**
 * Reimplements the swap-trigger detection from the updated swap block.
 */
function needsSwap(
  amountA: string,
  amountB: string,
  safeBalanceA: bigint,
  safeBalanceB: bigint,
): { swap: boolean; aToB: boolean; swapAmount: bigint } {
  const preSwapA = BigInt(amountA);
  const preSwapB = BigInt(amountB);
  const oneIsZero =
    (preSwapA === 0n && preSwapB > 0n) ||
    (preSwapA > 0n && preSwapB === 0n);
  const walletShortOnA = preSwapA > 0n && safeBalanceA < preSwapA && safeBalanceB > preSwapB;
  const walletShortOnB = preSwapB > 0n && safeBalanceB < preSwapB && safeBalanceA > preSwapA;

  if (!oneIsZero && !walletShortOnA && !walletShortOnB) {
    return { swap: false, aToB: false, swapAmount: 0n };
  }

  let aToB: boolean;
  let swapAmount: bigint;
  if (walletShortOnA) {
    aToB = false;
    swapAmount = safeBalanceB - preSwapB;
  } else if (walletShortOnB) {
    aToB = true;
    swapAmount = safeBalanceA - preSwapA;
  } else {
    aToB = preSwapA > 0n;
    swapAmount = (aToB ? preSwapA : preSwapB) / 2n;
  }

  return { swap: true, aToB, swapAmount };
}

// ---------- Tests -----------------------------------------------------------

// 1. Amounts computed from liquidity match the SDK math round-trip.
//    Given a liquidity value at a known price and tick range, the amounts
//    must be deterministic and non-zero for an in-range position.
{
  const tickLower = 1200;
  const tickUpper = 1260;
  const liquidity = '1000000000'; // 1e9
  // Use a sqrt price corresponding to a tick between lower and upper
  const curSqrtPrice = TickMath.tickIndexToSqrtPriceX64(1230);

  const res = computeAmountsFromLiquidity(
    liquidity,
    curSqrtPrice.toString(),
    tickLower,
    tickUpper,
    '999999999999', // plenty of A
    '999999999999', // plenty of B
  );

  const a = BigInt(res.amountA);
  const b = BigInt(res.amountB);
  assert.ok(a > 0n, 'in-range position must require non-zero amount A');
  assert.ok(b > 0n, 'in-range position must require non-zero amount B');
  // The amounts should match the required (wallet has plenty)
  assert.strictEqual(res.amountA, res.requiredA, 'amountA must equal requiredA when wallet is sufficient');
  assert.strictEqual(res.amountB, res.requiredB, 'amountB must equal requiredB when wallet is sufficient');
  console.log('✔ liquidity-based amounts are deterministic and non-zero for in-range');
}

// 2. Same liquidity at different tick ranges produces different token amounts.
//    This is the core insight — if we used freed token amounts directly,
//    the resulting liquidity would differ.
{
  const liquidity = '1000000000';
  const curSqrtPrice = TickMath.tickIndexToSqrtPriceX64(1230);

  const range1 = computeAmountsFromLiquidity(
    liquidity, curSqrtPrice.toString(), 1200, 1260,
    '999999999999', '999999999999',
  );
  const range2 = computeAmountsFromLiquidity(
    liquidity, curSqrtPrice.toString(), 1140, 1320,
    '999999999999', '999999999999',
  );

  // Different ranges → different amounts
  const a1 = BigInt(range1.amountA);
  const a2 = BigInt(range2.amountA);
  assert.ok(a1 !== a2, 'different ranges must produce different amounts for same liquidity');
  console.log('✔ different ranges produce different amounts for the same liquidity');
}

// 3. When wallet is short on one token, amounts are capped.
{
  const liquidity = '1000000000';
  const curSqrtPrice = TickMath.tickIndexToSqrtPriceX64(1230);

  const res = computeAmountsFromLiquidity(
    liquidity, curSqrtPrice.toString(), 1200, 1260,
    '0', // wallet has NO token A
    '999999999999',
  );

  assert.strictEqual(res.amountA, '0', 'wallet has 0 of A → amountA must be 0');
  assert.ok(BigInt(res.amountB) > 0n, 'amountB should be positive');
  console.log('✔ amount capped to 0 when wallet has no token A');
}

// 4. SUI gas reserve deducted from wallet balance.
{
  const liquidity = '1000000000';
  const curSqrtPrice = TickMath.tickIndexToSqrtPriceX64(1230);

  // Token A is SUI with 100M budget, wallet has 200M
  // safe balance A = 200M - 100M = 100M
  const res = computeAmountsFromLiquidity(
    liquidity, curSqrtPrice.toString(), 1200, 1260,
    '200000000', '999999999999',
    true, false, 100_000_000n,
  );

  // required A may exceed safe balance (100M), so it should be capped
  const reqA = BigInt(res.requiredA);
  const amountA = BigInt(res.amountA);
  const safeA = 200_000_000n - 100_000_000n; // 100M
  if (reqA > safeA) {
    assert.strictEqual(res.amountA, safeA.toString(), 'capped at safe balance when required exceeds it');
  } else {
    assert.strictEqual(res.amountA, res.requiredA, 'exact required when within safe balance');
  }
  console.log('✔ SUI gas reserve correctly applied to amount A');
}

// 5. Swap detection: wallet short on A, surplus B → swap B→A.
{
  const { swap, aToB, swapAmount } = needsSwap(
    '5000', '3000',
    0n,      // wallet has 0 A → short on A
    10000n,  // wallet has surplus B
  );
  assert.ok(swap, 'swap should be triggered');
  assert.strictEqual(aToB, false, 'should swap B→A');
  assert.strictEqual(swapAmount, 7000n, 'swap amount = surplus B (10000 - 3000)');
  console.log('✔ swap triggered: wallet short on A, surplus B swapped B→A');
}

// 6. Swap detection: wallet short on B, surplus A → swap A→B.
{
  const { swap, aToB, swapAmount } = needsSwap(
    '3000', '5000',
    10000n,  // wallet has surplus A
    0n,      // wallet has 0 B → short on B
  );
  assert.ok(swap, 'swap should be triggered');
  assert.strictEqual(aToB, true, 'should swap A→B');
  assert.strictEqual(swapAmount, 7000n, 'swap amount = surplus A (10000 - 3000)');
  console.log('✔ swap triggered: wallet short on B, surplus A swapped A→B');
}

// 7. No swap needed when wallet covers both amounts.
{
  const { swap } = needsSwap('3000', '5000', 10000n, 10000n);
  assert.ok(!swap, 'no swap needed when wallet covers both');
  console.log('✔ no swap when wallet covers both required amounts');
}

// 8. Original oneIsZero path still works: A is 0.
{
  const { swap, aToB, swapAmount } = needsSwap('0', '10000', 0n, 10000n);
  assert.ok(swap, 'swap triggered for oneIsZero');
  assert.strictEqual(aToB, false, 'B→A when only B present');
  assert.strictEqual(swapAmount, 5000n, 'half of B');
  console.log('✔ oneIsZero fallback: swaps half of B when A is 0');
}

// 9. Original oneIsZero path still works: B is 0.
{
  const { swap, aToB, swapAmount } = needsSwap('10000', '0', 10000n, 0n);
  assert.ok(swap, 'swap triggered for oneIsZero');
  assert.strictEqual(aToB, true, 'A→B when only A present');
  assert.strictEqual(swapAmount, 5000n, 'half of A');
  console.log('✔ oneIsZero fallback: swaps half of A when B is 0');
}

// 10. Verify liquidity round-trip: compute amounts → re-estimate liquidity.
//     The re-estimated liquidity should be very close to the original.
{
  const tickLower = 1200;
  const tickUpper = 1260;
  const originalLiq = '1000000000'; // 1e9
  const curSqrtPrice = TickMath.tickIndexToSqrtPriceX64(1230);

  const res = computeAmountsFromLiquidity(
    originalLiq, curSqrtPrice.toString(), tickLower, tickUpper,
    '999999999999', '999999999999',
  );

  // Re-estimate liquidity from the computed amounts
  const reEstimatedLiq = ClmmPoolUtil.estimateLiquidityFromcoinAmounts(
    curSqrtPrice,
    tickLower,
    tickUpper,
    { coinA: new BN(res.amountA), coinB: new BN(res.amountB) },
  );

  const origLiq = BigInt(originalLiq);
  const reEstLiq = BigInt(reEstimatedLiq.toString());
  // Allow small rounding tolerance (negligible for practical liquidity values)
  const diff = origLiq > reEstLiq ? origLiq - reEstLiq : reEstLiq - origLiq;
  const tolerance = origLiq / 1_000_000n; // 0.0001% tolerance
  assert.ok(diff <= tolerance, `round-trip liquidity must be within tolerance (got diff=${diff}, tolerance=${tolerance})`);
  console.log(`✔ liquidity round-trip: amounts → re-estimated liquidity matches original (diff=${diff}, tolerance=${tolerance})`);
}

console.log('\nAll liquidityPreservation tests passed ✅');
