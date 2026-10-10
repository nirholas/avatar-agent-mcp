// Spend policy: hard guardrails around every value-moving operation.
//
// This is the single source of truth for the operator-configurable limits
// that wrap the wallet/pump tools. The caps are read once from the env at
// module load and enforced in two places:
//
//   • The SIGNING libs (solana.js, jupiter-buy.js, atomic-collect.js,
//     atomic-launch.js) call assertSolWithinCap() right before they build a
//     transaction, so EVERY path — direct, bundled, atomic — is covered even
//     if a future tool forgets to check.
//   • The tool HANDLERS enforce the recipient allowlist and the explicit
//     `confirm:true` requirement for irreversible actions.
//
// Limits are intentionally conservative by default. An operator who wants
// larger spends sets the env var explicitly and thereby accepts the risk.

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

function envRaw(key) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : undefined;
}

function envNumber(key, fallback) {
	const raw = envRaw(key);
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) {
		throw Object.assign(new Error(`${key} must be a non-negative number (got "${raw}")`), {
			code: 'bad_policy_config',
		});
	}
	return n;
}

function envBool(key, fallback) {
	const raw = envRaw(key);
	if (raw === undefined) return fallback;
	return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

// Max SOL that any single transaction may move (send / buy / launch funding /
// fee drain). Default 0.5 SOL — generous for testing, low enough to bound a
// leaked-key or prompt-injection blast radius.
export const MAX_SOL_PER_TX = envNumber('MAX_SOL_PER_TX', 0.5);

// Optional recipient allowlist. Comma-separated base58 pubkeys. When set, SOL
// destinations (wallet_send, pump_collect drain target) must be in the list.
export const RECIPIENT_ALLOWLIST = (() => {
	const raw = envRaw('RECIPIENT_ALLOWLIST');
	if (!raw) return null; // null = no allowlist configured (allow any valid pubkey)
	const set = new Set(
		raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
	);
	return set.size ? set : null;
})();

// Irreversible tools require an explicit confirm:true unless the operator
// opts out by setting REQUIRE_CONFIRM=0.
export const REQUIRE_CONFIRM = envBool('REQUIRE_CONFIRM', true);

// Hard ceiling on the Jito tip so a typo / injected arg can't burn SOL on a
// tip. Bundled launches/collects clamp to this.
export const MAX_JITO_TIP_SOL = envNumber('MAX_JITO_TIP_SOL', 0.02);

// Sane ceiling on the compute-unit price (micro-lamports). 50,000,000 µLamports
// at the small unit limits these txs use stays well under 0.01 SOL of priority.
export const MAX_PRIORITY_MICRO_LAMPORTS = envNumber('MAX_PRIORITY_MICRO_LAMPORTS', 50_000_000);

// Rent-exempt minimum for a bare system account. The collect drain must leave
// at least this so the creator account isn't closed out from under pump.fun.
export const RENT_EXEMPT_LAMPORTS = 890_880;

/**
 * Assert a SOL amount is within MAX_SOL_PER_TX. Throws `over_spend_cap` with a
 * clear message otherwise. Call this inside the signing libs.
 * @param {number} sol
 * @param {string} [label] — what the spend is for (logged in the error text)
 */
export function assertSolWithinCap(sol, label = 'transaction') {
	const n = Number(sol);
	if (!Number.isFinite(n) || n < 0) {
		throw Object.assign(new Error(`${label}: amount must be a non-negative number (got ${sol})`), {
			code: 'invalid_amount',
		});
	}
	if (n > MAX_SOL_PER_TX) {
		throw Object.assign(
			new Error(
				`${label}: ${n} SOL exceeds the per-tx spend cap of ${MAX_SOL_PER_TX} SOL. ` +
					'Raise MAX_SOL_PER_TX in the MCP server environment to allow larger spends.',
			),
			{ code: 'over_spend_cap' },
		);
	}
	return n;
}

/**
 * Assert a lamports amount is within MAX_SOL_PER_TX. Used by the collect drain,
 * which computes the transfer in lamports (BigInt-safe — no float round-trip).
 * @param {bigint|number} lamports
 * @param {string} [label]
 */
export function assertLamportsWithinCap(lamports, label = 'transaction') {
	const cap = BigInt(Math.round(MAX_SOL_PER_TX * LAMPORTS_PER_SOL));
	const value = typeof lamports === 'bigint' ? lamports : BigInt(Math.floor(Number(lamports)));
	if (value < 0n) {
		throw Object.assign(new Error(`${label}: lamports must be non-negative`), { code: 'invalid_amount' });
	}
	if (value > cap) {
		throw Object.assign(
			new Error(
				`${label}: ${(Number(value) / LAMPORTS_PER_SOL).toFixed(6)} SOL exceeds the per-tx spend cap of ` +
					`${MAX_SOL_PER_TX} SOL. Raise MAX_SOL_PER_TX to allow larger spends.`,
			),
			{ code: 'over_spend_cap' },
		);
	}
	return value;
}

/**
 * Enforce the recipient allowlist (if configured). Throws `recipient_not_allowed`.
 * @param {string} pubkey — destination base58
 * @param {string} [label]
 */
export function assertRecipientAllowed(pubkey, label = 'destination') {
	if (!RECIPIENT_ALLOWLIST) return; // no allowlist → any valid pubkey is fine
	if (!RECIPIENT_ALLOWLIST.has(String(pubkey))) {
		throw Object.assign(
			new Error(
				`${label} ${pubkey} is not in RECIPIENT_ALLOWLIST. ` +
					'Add it to the allowlist env var to permit sends to this address.',
			),
			{ code: 'recipient_not_allowed' },
		);
	}
}

/**
 * Gate an irreversible tool on an explicit confirm flag. Returns a refusal
 * object (for the handler to return directly) when confirmation is required
 * but absent; returns null when the action may proceed.
 * @param {boolean|undefined} confirm — the tool's `confirm` arg
 * @param {string} action — human-readable name of the irreversible action
 */
export function confirmationGate(confirm, action) {
	if (!REQUIRE_CONFIRM) return null;
	if (confirm === true) return null;
	return {
		ok: false,
		error: 'confirmation_required',
		message:
			`${action} is IRREVERSIBLE and moves real funds on Solana mainnet. ` +
			'Re-issue the call with `confirm: true` to proceed. ' +
			'(Set REQUIRE_CONFIRM=0 on the MCP server to disable this prompt.)',
	};
}

/**
 * Clamp a Jito tip (SOL) to MAX_JITO_TIP_SOL. Returns the clamped value.
 * @param {number} tipSol
 */
export function clampJitoTipSol(tipSol) {
	const n = Number(tipSol);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.min(n, MAX_JITO_TIP_SOL);
}

/**
 * Clamp a compute-unit price to MAX_PRIORITY_MICRO_LAMPORTS.
 * @param {number} micros
 */
export function clampPriorityMicroLamports(micros) {
	const n = Math.floor(Number(micros));
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.min(n, MAX_PRIORITY_MICRO_LAMPORTS);
}

/**
 * Enforce a floor on the collect drain buffer so the creator account stays
 * rent-exempt. Returns the larger of the requested buffer and the rent-exempt
 * minimum.
 * @param {number|bigint} bufferLamports
 */
export function enforceMinBuffer(bufferLamports) {
	const n = typeof bufferLamports === 'bigint' ? Number(bufferLamports) : Math.floor(Number(bufferLamports));
	if (!Number.isFinite(n) || n < RENT_EXEMPT_LAMPORTS) return RENT_EXEMPT_LAMPORTS;
	return n;
}
