// `pump_launch` — atomic pump.fun token launch via a Jito bundle.
//
// Wraps the atomic-launch port (originally from nirholas/atomic). Two-tx
// bundle: funder pays its own fee + the Jito tip and rent-funds the
// creator; creator signs createV2 in tx2. Either both land or neither
// does, so the on-chain `creator` is the creator wallet (not the funder)
// without forcing the creator to hold SOL up front.
//
// Pass `devBuySol` to launch-and-snipe: the creator's first buy is folded
// into the create transaction (createV2AndBuy), so it lands atomically with
// the mint before any external sniper can see the curve. The funder also
// rent-funds the dev-buy spend in tx1.
//
// Pass `holderReward: true` for a Pump SDK 2 holder-reward coin: the
// program records the mint's holder-rewards PDA as the creator, so creator
// fees are paid out to token holders instead of the creator wallet. It is
// gated by the live Global.isHolderRewardEnabled switch, checked before
// anything is signed. Cashback launches are retired on-chain (error 6082);
// `cashback: true` is accepted only so we can refuse it with a clear error.
//
// If `uri` is omitted, we upload metadata to pump.fun's IPFS endpoint
// first using the supplied name/symbol/description/socials/imageUrl. This
// makes the tool a one-shot "launch from scratch".
//
// EXECUTION ACTION — creates a real mint on Solana mainnet and pays
// Jito tips + rent (+ the optional dev buy).

import { z } from 'zod';

import { atomicLaunch, cashbackDeprecatedError, uploadPumpMetadata } from '../lib/atomic-launch.js';
import { confirmationGate } from '../lib/spend-policy.js';

export const def = {
	name: 'pump_launch',
	title: 'Atomic pump.fun launch (Jito bundle, separate funder/creator)',
	// MCP ToolAnnotations — EXECUTION: moves real value on Solana mainnet, irreversible.
	annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
	description:
		'Launch a pump.fun token atomically via a Jito bundle. Funder pays its own fee + tip and rent-funds the creator; creator signs createV2 in tx2, and both txs land in the same block or neither does. Pass devBuySol to launch-and-snipe: the creator first buy is folded into the create tx (createV2AndBuy) so it lands atomically before any sniper sees the curve. Pass holderReward: true to launch a holder-reward coin (creator fees are distributed to token holders; the on-chain creator becomes the mint holder-rewards PDA, so pump_collect_fees has nothing to collect for it). Cashback launches are retired by the pump.fun program and are refused with error cashback_deprecated. If uri is omitted, metadata is uploaded to pump.fun IPFS first from name/symbol/description/socials/imageUrl. Returns the mint address, bundle id, both tx signatures, the dev-buy quote, and the pump.fun URL. EXECUTION ACTION: creates a real mint on mainnet.',
	inputSchema: {
		name: z.string().min(1).max(32).describe('Token name.'),
		symbol: z.string().min(1).max(10).describe('Token symbol (ticker).'),
		funderSecret: z.string().describe('Base58 secret of the funder wallet (pays Tx1 fee + tip + rent transfer).'),
		creatorSecret: z.string().describe('Base58 secret of the creator wallet (signs createV2 — becomes on-chain creator).'),
		uri: z.string().url().optional().describe('Existing metadata URI. If omitted, metadata is uploaded first.'),
		description: z.string().max(500).optional(),
		twitter: z.string().optional(),
		telegram: z.string().optional(),
		website: z.string().optional(),
		imageUrl: z.string().url().optional().describe('Image to upload as the token icon (re-fetched at upload time).'),
		mintSecret: z.string().optional().describe('Base58 secret to use as the mint keypair (default: random).'),
		rentSol: z.number().min(0).optional().describe('SOL the funder transfers to the creator for tx2 rent + fees (default 0.035).'),
		devBuySol: z.number().min(0).optional().describe('SOL for an atomic creator dev buy folded into the create tx (launch-and-snipe). Omit or 0 = launch only. Funded by the funder on top of rent.'),
		holderReward: z.boolean().optional().describe('Launch a holder-reward coin: creator fees are distributed to token holders instead of the creator wallet (the on-chain creator becomes the mint holder-rewards PDA). Requires the pump.fun Global holder-reward switch to be on; checked before signing. Default false.'),
		cashback: z.boolean().optional().describe('Retired. The pump.fun program rejects new cashback coins (error 6082), so true is refused with error cashback_deprecated. Use holderReward instead.'),
		slippageBps: z.number().int().min(1).max(10_000).optional().describe('Slippage tolerance for the dev buy in basis points (default 500 = 5%). Only used when devBuySol > 0.'),
		jitoTipSol: z.number().min(0).optional().describe('Jito tip in SOL (default 0.005).'),
		priorityMicroLamports: z.number().int().min(0).max(20_000_000).optional()
			.describe('Compute-unit priority price (default 2_000_000).'),
		confirm: z.boolean().optional().describe('Must be true to execute this irreversible mint launch (when REQUIRE_CONFIRM is on).'),
	},
	async handler(args) {
		// Refuse cashback before the confirmation gate and the metadata upload:
		// there is no version of this call that can succeed on-chain.
		if (args.cashback) {
			const err = cashbackDeprecatedError();
			return { ok: false, error: err.code, message: err.message };
		}
		const gate = confirmationGate(args.confirm, 'pump_launch (token mint)');
		if (gate) return gate;
		try {
			let uri = args.uri;
			let uploadedMeta = null;
			if (!uri) {
				uploadedMeta = await uploadPumpMetadata({
					name: args.name,
					symbol: args.symbol,
					description: args.description || '',
					twitter: args.twitter || '',
					telegram: args.telegram || '',
					website: args.website || '',
					imageUrl: args.imageUrl,
				});
				uri = uploadedMeta.uri;
				if (!uri) {
					return { ok: false, error: 'metadata_upload_failed', detail: uploadedMeta.raw };
				}
			}
			const out = await atomicLaunch({
				name: args.name,
				symbol: args.symbol,
				uri,
				funderSecret: args.funderSecret,
				creatorSecret: args.creatorSecret,
				mintSecret: args.mintSecret,
				rentSol: args.rentSol,
				devBuySol: args.devBuySol,
				slippageBps: args.slippageBps,
				jitoTipSol: args.jitoTipSol,
				priorityMicroLamports: args.priorityMicroLamports,
				holderReward: args.holderReward === true,
			});
			return { ...out, metadataUri: uri, metadataUploadedNow: !!uploadedMeta };
		} catch (err) {
			return { ok: false, error: err.code || 'launch_failed', message: err.message };
		}
	},
};
