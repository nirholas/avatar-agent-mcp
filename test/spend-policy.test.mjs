// C4 / H5: spend caps, allowlist, confirmation gate, and tip/buffer bounds.
// Pure logic — no network, no signing.
//
// Run: node --test packages/avatar-agent-mcp/test/spend-policy.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	MAX_SOL_PER_TX,
	assertSolWithinCap,
	assertLamportsWithinCap,
	assertRecipientAllowed,
	confirmationGate,
	clampJitoTipSol,
	clampPriorityMicroLamports,
	enforceMinBuffer,
	RENT_EXEMPT_LAMPORTS,
	MAX_JITO_TIP_SOL,
	MAX_PRIORITY_MICRO_LAMPORTS,
} from '../src/lib/spend-policy.js';

test('default per-tx cap is 0.5 SOL', () => {
	assert.equal(MAX_SOL_PER_TX, 0.5);
});

test('assertSolWithinCap allows an amount at/under the cap', () => {
	assert.doesNotThrow(() => assertSolWithinCap(0.5, 'test'));
	assert.equal(assertSolWithinCap(0.1, 'test'), 0.1);
});

test('assertSolWithinCap throws over_spend_cap above the cap', () => {
	assert.throws(
		() => assertSolWithinCap(1, 'wallet_send'),
		(err) => err.code === 'over_spend_cap' && /spend cap/.test(err.message),
	);
});

test('assertSolWithinCap rejects NaN/negative as invalid_amount', () => {
	assert.throws(() => assertSolWithinCap(-1, 't'), (e) => e.code === 'invalid_amount');
	assert.throws(() => assertSolWithinCap(NaN, 't'), (e) => e.code === 'invalid_amount');
});

test('assertLamportsWithinCap is BigInt-safe and respects the cap', () => {
	const cap = BigInt(Math.round(MAX_SOL_PER_TX * 1e9));
	assert.doesNotThrow(() => assertLamportsWithinCap(cap, 'drain'));
	assert.throws(() => assertLamportsWithinCap(cap + 1n, 'drain'), (e) => e.code === 'over_spend_cap');
});

test('confirmationGate refuses without confirm and passes with confirm:true', () => {
	const refusal = confirmationGate(undefined, 'wallet_send');
	assert.equal(refusal.ok, false);
	assert.equal(refusal.error, 'confirmation_required');
	assert.match(refusal.message, /confirm: true/);
	assert.equal(confirmationGate(true, 'wallet_send'), null);
	assert.notEqual(confirmationGate(false, 'wallet_send'), null);
});

test('assertRecipientAllowed is a no-op when no allowlist is configured', () => {
	// No RECIPIENT_ALLOWLIST set in this process → any pubkey allowed.
	assert.doesNotThrow(() => assertRecipientAllowed('AnyAddr1111111111111111111111111111111111', 'dest'));
});

test('clampJitoTipSol caps the tip at MAX_JITO_TIP_SOL', () => {
	assert.equal(clampJitoTipSol(MAX_JITO_TIP_SOL + 5), MAX_JITO_TIP_SOL);
	assert.equal(clampJitoTipSol(0.001), 0.001);
	assert.equal(clampJitoTipSol(-1), 0);
});

test('clampPriorityMicroLamports caps the priority price', () => {
	assert.equal(clampPriorityMicroLamports(MAX_PRIORITY_MICRO_LAMPORTS * 10), MAX_PRIORITY_MICRO_LAMPORTS);
	assert.equal(clampPriorityMicroLamports(123), 123);
});

test('enforceMinBuffer floors the buffer at the rent-exempt minimum', () => {
	assert.equal(enforceMinBuffer(0), RENT_EXEMPT_LAMPORTS);
	assert.equal(enforceMinBuffer(RENT_EXEMPT_LAMPORTS + 100), RENT_EXEMPT_LAMPORTS + 100);
});
