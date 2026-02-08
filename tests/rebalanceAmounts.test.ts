import assert from 'assert';

/**
 * Tests for the rebalance amount calculation logic.
 *
 * The addLiquidity helper must choose token amounts as follows when
 * rebalancing (removedAmountA / removedAmountB are provided):
 *
 *   • If a removed amount is positive and ≤ wallet balance → use it.
 *   • If a removed amount is undefined/0 or exceeds wallet balance
 *     → fall back to the wallet balance.
 *
 * This ensures both tokens have a non-zero max for the SDK even when an
 * out-of-range position returned all value in a single token.
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
): { amountA: string; amountB: string } {
  const balanceABigInt = BigInt(walletBalanceA);
  const balanceBBigInt = BigInt(walletBalanceB);

  const removedA = removedAmountA ? BigInt(removedAmountA) : 0n;
  const removedB = removedAmountB ? BigInt(removedAmountB) : 0n;

  const amountA = (removedA > 0n && removedA <= balanceABigInt ? removedA : balanceABigInt).toString();
  const amountB = (removedB > 0n && removedB <= balanceBBigInt ? removedB : balanceBBigInt).toString();

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

console.log('\nAll rebalanceAmounts tests passed ✅');
