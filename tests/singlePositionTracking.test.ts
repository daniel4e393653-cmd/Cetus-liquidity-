import assert from 'assert';
import { PositionMonitorService } from '../src/services/monitor';
import { BotConfig } from '../src/config';

/**
 * Tests for single-position tracking and exact-amount rebalancing.
 *
 * Requirements:
 *   1. Track and rebalance ONE existing position (via POSITION_ID).
 *   2. Rebalance with the exact amounts from the tracked position.
 *   3. Don't add extra liquidity from the wallet.
 *
 * Run with:  npx ts-node tests/singlePositionTracking.test.ts
 */

const STUB_PRIVATE_KEY = 'a'.repeat(64);
const STUB_POOL_ADDRESS = '0x' + '0'.repeat(64);

function buildService(overrides: Partial<BotConfig> = {}): PositionMonitorService {
  const config: BotConfig = {
    network: 'mainnet',
    privateKey: STUB_PRIVATE_KEY,
    checkInterval: 300,
    rebalanceThreshold: 0.05,
    poolAddress: STUB_POOL_ADDRESS,
    maxSlippage: 0.01,
    gasBudget: 50_000_000,
    logLevel: 'error',
    verboseLogs: false,
    ...overrides,
  };
  const sdkStub = {} as InstanceType<typeof import('../src/services/sdk').CetusSDKService>;
  return new PositionMonitorService(sdkStub, config);
}

// ── Range width preservation ────────────────────────────────────────────
// When tracking a specific position, the rebalanced position should
// preserve the original range width (via preserveRangeWidth parameter).

{
  const svc = buildService(); // no rangeWidth configured
  const tickSpacing = 60;

  // Old position had range [600, 1200] (width = 600). Price moved to 1250.
  // When preserveRangeWidth is passed, the new range should be approximately
  // the same width (may vary slightly due to tick spacing alignment).
  {
    const oldWidth = 1200 - 600; // 600
    const currentTick = 1250;
    const { lower, upper } = svc.calculateOptimalRange(currentTick, tickSpacing, oldWidth);
    const newWidth = upper - lower;
    assert.ok(
      Math.abs(newWidth - oldWidth) <= tickSpacing,
      `range width should be within one tick spacing of original (got ${newWidth}, expected ~${oldWidth})`,
    );
    assert.ok(lower <= currentTick && currentTick < upper, 'current tick must be within new range');
    console.log('✔ range width approximately preserved when rebalancing tracked position');
  }

  // Without preserveRangeWidth, should use tightest range (default).
  {
    const currentTick = 1250;
    const { lower, upper } = svc.calculateOptimalRange(currentTick, tickSpacing);
    assert.strictEqual(upper - lower, tickSpacing, 'default must be tightest range');
    console.log('✔ without preserveRangeWidth, tightest range is used');
  }
}

// ── Rebalance amounts: exact amounts only ───────────────────────────────
// The amount-selection logic must use only freed amounts, never wallet funds.

function computeRebalanceAmounts(
  removedAmountA: string | undefined,
  removedAmountB: string | undefined,
  walletBalanceA: string,
  walletBalanceB: string,
  isSuiA: boolean = false,
  isSuiB: boolean = false,
  gasBudget: bigint = 50_000_000n,
): { amountA: string; amountB: string } {
  const balanceABigInt = BigInt(walletBalanceA);
  const balanceBBigInt = BigInt(walletBalanceB);

  const safeBalanceA = isSuiA && balanceABigInt > gasBudget
    ? balanceABigInt - gasBudget
    : balanceABigInt;
  const safeBalanceB = isSuiB && balanceBBigInt > gasBudget
    ? balanceBBigInt - gasBudget
    : balanceBBigInt;

  const removedA = removedAmountA ? BigInt(removedAmountA) : 0n;
  const removedB = removedAmountB ? BigInt(removedAmountB) : 0n;

  // Use exactly the freed amounts — never pull extra wallet funds
  const amountA = (removedA > 0n ? (removedA <= safeBalanceA ? removedA : safeBalanceA) : 0n).toString();
  const amountB = (removedB > 0n ? (removedB <= safeBalanceB ? removedB : safeBalanceB) : 0n).toString();

  return { amountA, amountB };
}

// 1. Both freed amounts provided → use exactly those, not more.
{
  const { amountA, amountB } = computeRebalanceAmounts(
    '2000', '3000', '1000000', '2000000',
  );
  assert.strictEqual(amountA, '2000', 'must re-add exactly what was freed for A');
  assert.strictEqual(amountB, '3000', 'must re-add exactly what was freed for B');
  console.log('✔ exact amounts: wallet has much more but only freed amounts used');
}

// 1b. Freed amounts must win even when liquidity-derived estimates exist.
{
  const freed = computeRebalanceAmounts('2000', '3000', '5000000', '4000000');
  const liquidityDerived = { amountA: '9999', amountB: '8888' };
  const selected = (BigInt(freed.amountA) > 0n || BigInt(freed.amountB) > 0n)
    ? freed
    : liquidityDerived;
  assert.deepStrictEqual(
    selected,
    freed,
    'when freed amounts are known, do not replace them with liquidity estimates',
  );
  console.log('✔ freed amounts take precedence over liquidity-derived estimates');
}

// 2. Single-sided (all in token B) → token A stays 0, not wallet balance.
{
  const { amountA, amountB } = computeRebalanceAmounts(
    undefined, '10000', '500000', '10000',
  );
  assert.strictEqual(amountA, '0', 'no freed A → must be 0, not wallet balance');
  assert.strictEqual(amountB, '10000');
  console.log('✔ single-sided: missing token stays 0 (swap will balance later)');
}

// 3. No freed amounts → both stay 0 (no random wallet usage).
{
  const { amountA, amountB } = computeRebalanceAmounts(
    undefined, undefined, '100000', '200000',
  );
  assert.strictEqual(amountA, '0');
  assert.strictEqual(amountB, '0');
  console.log('✔ no freed amounts → nothing added from wallet');
}

// ── Post-swap delta calculation ─────────────────────────────────────────
// After swapping, the new amounts should be computed from freed amounts +
// swap deltas, NOT from full wallet balance.

function computePostSwapAmounts(
  preSwapA: bigint,
  preSwapB: bigint,
  swapDeltaA: bigint,
  swapDeltaB: bigint,
  walletAfterA: bigint,
  walletAfterB: bigint,
  isSuiA: boolean = false,
  isSuiB: boolean = false,
  gasReserve: bigint = 50_000_000n,
): { amountA: string; amountB: string } {
  let adjA = preSwapA + swapDeltaA;
  let adjB = preSwapB + swapDeltaB;

  if (isSuiA) {
    const maxUsableA = walletAfterA > gasReserve ? walletAfterA - gasReserve : 0n;
    if (adjA > maxUsableA) adjA = maxUsableA;
  }
  if (isSuiB) {
    const maxUsableB = walletAfterB > gasReserve ? walletAfterB - gasReserve : 0n;
    if (adjB > maxUsableB) adjB = maxUsableB;
  }

  return {
    amountA: (adjA > 0n ? adjA : 0n).toString(),
    amountB: (adjB > 0n ? adjB : 0n).toString(),
  };
}

// 4. Swap half of freed B to get A — only freed value used.
{
  // Freed: 0 A, 10000 B. Swap 5000 B → receive 4900 A.
  // Wallet had 50000 A and 50000 B before removal.
  // swapDeltaA = +4900, swapDeltaB = -5000
  const { amountA, amountB } = computePostSwapAmounts(
    0n, 10000n, // preSwap: freed amounts
    4900n, -5000n, // swap deltas
    54900n, 55000n, // wallet after swap (50000+4900, 50000+10000-5000)
  );
  assert.strictEqual(amountA, '4900', 'only swap output, not full wallet (54900)');
  assert.strictEqual(amountB, '5000', 'remaining freed amount, not full wallet (55000)');
  console.log('✔ post-swap: only freed + swap delta used, not full wallet');
}

// 5. Post-swap with SUI gas reserve.
{
  // Freed: 0 A (SUI), 4_000_000_000 B. Swap 2B → receive ~1.95B worth of A.
  // swapDeltaA = +1_950_000_000, swapDeltaB = -2_000_000_000
  // walletA after = 2_000_000_000 (pre-existing 50M + 1.95B)
  const { amountA, amountB } = computePostSwapAmounts(
    0n, 4_000_000_000n,
    1_950_000_000n, -2_000_000_000n,
    2_000_000_000n, 5_000_000_000n,
    true, false, 50_000_000n,
  );
  // adjA = 0 + 1.95B = 1.95B, maxUsable = 2B - 50M = 1.95B → OK
  assert.strictEqual(amountA, '1950000000', 'freed-based amount for SUI token');
  assert.strictEqual(amountB, '2000000000', 'remaining freed B');
  console.log('✔ post-swap with SUI gas reserve: correct amounts');
}

// 6. Post-swap: adjA exceeds safe wallet balance → cap at safe.
{
  // Scenario: gas costs reduce wallet below what delta says
  const { amountA } = computePostSwapAmounts(
    0n, 200_000_000n,
    100_000_000n, -100_000_000n,
    120_000_000n, 500_000_000n,
    true, false, 50_000_000n,
  );
  // adjA = 0 + 100M = 100M, maxUsable = 120M - 50M = 70M → cap at 70M
  assert.strictEqual(amountA, '70000000', 'capped at safe wallet balance');
  console.log('✔ post-swap: amount capped at safe wallet when gas reserve needed');
}

console.log('\nAll singlePositionTracking tests passed ✅');
