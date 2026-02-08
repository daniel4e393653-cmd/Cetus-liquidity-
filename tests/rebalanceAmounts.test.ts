import assert from 'assert';

/**
 * Tests for the rebalance amount calculation logic.
 *
 * The addLiquidity helper must choose token amounts as follows when
 * rebalancing (removedAmountA / removedAmountB are provided):
 *
 *   • If a removed amount is positive and ≤ safe wallet balance → use it.
 *   • If a removed amount is undefined/0 or exceeds safe wallet balance
 *     → fall back to the safe wallet balance.
 *   • Safe wallet balance = wallet balance − gas reserve when token is SUI.
 *
 * This ensures both tokens have a non-zero max for the SDK even when an
 * out-of-range position returned all value in a single token, and that
 * enough SUI is reserved for the add-liquidity transaction gas.
 *
 * Run with:  npx ts-node tests/rebalanceAmounts.test.ts
 */

// ---------- Pure reimplementation of the amount-selection logic ----------
// Extracted from RebalanceService.addLiquidity so we can test it without
// instantiating the full service / SDK.

function computeRebalanceAmounts(
  removedAmountA: string | undefined,
  removedAmountB: string | undefined,
  walletBalanceA: string,
  walletBalanceB: string,
  isSuiA: boolean = false,
  isSuiB: boolean = false,
  gasBudget: bigint = 100_000_000n,
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

  const amountA = (removedA > 0n && removedA <= safeBalanceA ? removedA : safeBalanceA).toString();
  const amountB = (removedB > 0n && removedB <= safeBalanceB ? removedB : safeBalanceB).toString();

  return { amountA, amountB };
}

// ---------- Tests --------------------------------------------------------

// 1. Both removed amounts present and within wallet balance → use them.
{
  const { amountA, amountB } = computeRebalanceAmounts('500', '300', '1000', '1000');
  assert.strictEqual(amountA, '500');
  assert.strictEqual(amountB, '300');
  console.log('✔ both removed amounts used when within wallet balance');
}

// 2. One removed amount is undefined (out-of-range, all in token B).
//    Token A should fall back to wallet balance.
{
  const { amountA, amountB } = computeRebalanceAmounts(undefined, '5000', '1200', '6000');
  assert.strictEqual(amountA, '1200', 'should fall back to wallet balance for token A');
  assert.strictEqual(amountB, '5000', 'should use removed amount for token B');
  console.log('✔ undefined removed amount A falls back to wallet balance');
}

// 3. One removed amount is undefined (out-of-range, all in token A).
{
  const { amountA, amountB } = computeRebalanceAmounts('7000', undefined, '8000', '3000');
  assert.strictEqual(amountA, '7000');
  assert.strictEqual(amountB, '3000', 'should fall back to wallet balance for token B');
  console.log('✔ undefined removed amount B falls back to wallet balance');
}

// 4. Removed amount exceeds wallet balance (e.g. gas consumed SUI).
//    Should cap to wallet balance.
{
  const { amountA, amountB } = computeRebalanceAmounts('1000', '500', '800', '500');
  assert.strictEqual(amountA, '800', 'should cap to wallet balance when removed exceeds it');
  assert.strictEqual(amountB, '500');
  console.log('✔ removed amount capped at wallet balance');
}

// 5. Both removed amounts undefined – both fall back to wallet balance.
{
  const { amountA, amountB } = computeRebalanceAmounts(undefined, undefined, '400', '600');
  assert.strictEqual(amountA, '400');
  assert.strictEqual(amountB, '600');
  console.log('✔ both undefined → wallet balance used for both');
}

// 6. Wallet balance is 0 for one token after gas costs – amount stays 0.
{
  const { amountA, amountB } = computeRebalanceAmounts(undefined, '2000', '0', '3000');
  assert.strictEqual(amountA, '0', 'wallet balance 0 means amount 0');
  assert.strictEqual(amountB, '2000');
  console.log('✔ wallet balance 0 produces amount 0 (SDK may still fail gracefully)');
}

// 7. OLD BUG SCENARIO: removed amount A is undefined, code used to pass '0'.
//    With wallet having non-zero A balance, now it should pass the wallet balance.
{
  const { amountA, amountB } = computeRebalanceAmounts(undefined, '10000', '5000', '10000');
  assert.notStrictEqual(amountA, '0', 'MUST NOT pass 0 when wallet has token A');
  assert.strictEqual(amountA, '5000', 'should use wallet balance as max for token A');
  console.log('✔ old bug scenario: non-zero wallet balance used instead of 0');
}

// 8. SUI gas reserve: token A is SUI – wallet balance fallback should be
//    reduced by gas budget to avoid balance::split error.
{
  // Wallet has 4_200_000_000 MIST (4.2 SUI), gas budget = 100_000_000 (0.1 SUI)
  // Safe balance = 4_200_000_000 - 100_000_000 = 4_100_000_000
  const { amountA, amountB } = computeRebalanceAmounts(
    undefined, '5000000000', '4200000000', '6000000000',
    true, false, 100_000_000n,
  );
  assert.strictEqual(amountA, '4100000000', 'SUI balance should be reduced by gas reserve');
  assert.strictEqual(amountB, '5000000000', 'non-SUI token unaffected');
  console.log('✔ SUI gas reserve applied when token A is SUI');
}

// 9. SUI gas reserve: token B is SUI – same logic applies to token B.
{
  const { amountA, amountB } = computeRebalanceAmounts(
    '3000000000', undefined, '5000000000', '2000000000',
    false, true, 100_000_000n,
  );
  assert.strictEqual(amountA, '3000000000');
  assert.strictEqual(amountB, '1900000000', 'SUI balance should be reduced by gas reserve');
  console.log('✔ SUI gas reserve applied when token B is SUI');
}

// 10. SUI gas reserve: removed SUI amount exceeds safe balance → cap to safe balance.
{
  // Removed 4.15 SUI, wallet has 4.2 SUI, gas reserve = 0.1 SUI → safe = 4.1 SUI
  const { amountA, amountB } = computeRebalanceAmounts(
    '4150000000', '5000000000', '4200000000', '6000000000',
    true, false, 100_000_000n,
  );
  assert.strictEqual(amountA, '4100000000', 'removed SUI capped at safe balance');
  assert.strictEqual(amountB, '5000000000');
  console.log('✔ SUI removed amount capped at safe balance');
}

// 11. SUI gas reserve: wallet balance ≤ gas budget – safe balance stays 0 (no underflow).
{
  const { amountA, amountB } = computeRebalanceAmounts(
    undefined, '1000', '50000000', '2000',
    true, false, 100_000_000n,
  );
  // 50_000_000 ≤ 100_000_000 → condition false, safeBalanceA = 50_000_000
  assert.strictEqual(amountA, '50000000', 'no underflow when balance <= gas budget');
  assert.strictEqual(amountB, '1000');
  console.log('✔ no underflow when SUI balance is below gas budget');
}

// 12. Non-SUI tokens: gas reserve should not affect non-SUI tokens.
{
  const { amountA, amountB } = computeRebalanceAmounts(
    undefined, '1000', '500000000', '2000',
    false, false, 100_000_000n,
  );
  assert.strictEqual(amountA, '500000000', 'non-SUI not affected by gas reserve');
  console.log('✔ non-SUI tokens unaffected by gas reserve');
}

console.log('\nAll rebalanceAmounts tests passed ✅');
