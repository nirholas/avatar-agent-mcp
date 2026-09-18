// Atomic pump.fun token launch via a Jito bundle.
//
// Ported from nirholas/atomic's fire-jito.js. Two-tx bundle:
//   Tx 1 (funder pays fee + tip): transfer rent (+ optional dev-buy) SOL to
//                                 creator + Jito tip
//   Tx 2 (creator pays fee):     pump.fun createV2 — or, when a dev buy is
//                                 requested, createV2AndBuy (create + first
//                                 buy in the SAME instruction set)
//
// Both txs share the same recent blockhash and are submitted as a bundle to
// Jito's mainnet block engine. Either both land or neither does — so no
// MEV searcher can interleave, and the creator wallet doesn't need to hold
// SOL before the launch.
//
// The optional dev buy is the "launch-and-snipe" path: the creator's first
// buy executes inside the create transaction, atomically, before the bonding
// curve is visible to any external sniper. No bot can front-run the floor
// because there is no block in which the curve exists without our buy in it.
//
// This is the "real launch" path: the on-chain `creator` field on the mint
// is the creator wallet, not the funder. That matters because pump.fun's
// creator-fee accrual follows the creator key.
//
// Pump SDK 2 (program upgrade of 2026-09): pass `holderReward: true` to make
// the coin a holder-reward coin. The program then records the mint's
// holder-rewards PDA as the creator, so creator fees are distributed to token
// holders instead of accruing to the creator wallet (pump_collect_fees has
// nothing to collect for such a coin). Holder-reward launches are gated by
// Global.isHolderRewardEnabled (program error 6084 when off), which we check
// before signing anything. Cashback launches are retired: create_v2 rejects
// them with 6082, so we refuse them up front with code `cashback_deprecated`.

import {
	Keypair,
	PublicKey,
	SystemProgram,
	TransactionMessage,
	VersionedTransaction,
	ComputeBudgetProgram,
	LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import BN from 'bn.js';
import FormData from 'form-data';

import { bs58encode, bs58decode, getConnection, keypairFromSecret } from './solana.js';
import { JITO_TIP_ACCOUNTS, randomTipAccount, submitBundle, waitForSignatures } from './jito.js';
import {
	assertSolWithinCap,
	clampJitoTipSol,
	clampPriorityMicroLamports,
} from './spend-policy.js';

const PUMP_IPFS_URL = 'https://pump.fun/api/ipfs';

// Upload token metadata + image to pump.fun's IPFS endpoint. Returns the
// metadata URI you feed into createV2. If no imageUrl is provided we use a
// 1x1 transparent PNG placeholder so the form is valid; pass an imageUrl
// to use a real image fetched at upload time.
export async function uploadPumpMetadata({ name, symbol, description = '', twitter = '', telegram = '', website = '', imageUrl, showName = true }) {
	if (!name) throw new Error('uploadPumpMetadata: name is required');
	if (!symbol) throw new Error('uploadPumpMetadata: symbol is required');
	const form = new FormData();
	let imageBuf;
	let imageName = 'placeholder.png';
	let imageType = 'image/png';
	if (imageUrl) {
		const r = await fetch(imageUrl);
		if (!r.ok) throw new Error(`Failed to fetch imageUrl: HTTP ${r.status}`);
		imageBuf = Buffer.from(await r.arrayBuffer());
		const ext = (imageUrl.split('?')[0].split('.').pop() || 'png').toLowerCase();
		imageName = `image.${ext}`;
		imageType = r.headers.get('content-type') || imageType;
	} else {
		imageBuf = Buffer.from(
			'89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154' +
			'78da63fcffff3f0305000601018a0c1d990000000049454e44ae426082',
			'hex',
		);
	}
	form.append('file', imageBuf, { filename: imageName, contentType: imageType });
	form.append('name', name);
	form.append('symbol', symbol);
	form.append('description', description);
	form.append('twitter', twitter);
	form.append('telegram', telegram);
	form.append('website', website);
	form.append('showName', String(showName));

	const res = await fetch(PUMP_IPFS_URL, {
		method: 'POST',
		body: form,
		headers: form.getHeaders(),
	});
	if (!res.ok) {
		const txt = await res.text().catch(() => '');
		throw new Error(`pump.fun IPFS upload failed (${res.status}): ${txt.slice(0, 300)}`);
	}
	const json = await res.json();
	return {
		uri: json.metadataUri || json.metadata_uri || null,
		raw: json,
	};
}

export async function atomicLaunch({
	name,
	symbol,
	uri,
	funderSecret,
	creatorSecret,
	mintSecret,
	rentSol = 0.035,
	devBuySol = 0,
	slippageBps = 500,
	jitoTipSol = 0.005,
	priorityMicroLamports = 2_000_000,
	mayhemMode = false,
	cashback = false,
	holderReward = false,
}) {
	if (cashback) throw cashbackDeprecatedError();
	if (!name) throw new Error('atomicLaunch: name is required');
	if (!symbol) throw new Error('atomicLaunch: symbol is required');
	if (!uri) throw new Error('atomicLaunch: uri is required (call uploadPumpMetadata first or pass an existing one)');

	// Normalize the dev buy. Anything non-positive means "launch only".
	devBuySol = Number(devBuySol);
	if (!Number.isFinite(devBuySol) || devBuySol < 0) devBuySol = 0;
	const wantDevBuy = devBuySol > 0;
	slippageBps = Math.min(Math.max(Math.floor(Number(slippageBps) || 0), 1), 10_000);

	// Spend cap + tip/priority clamps. The funder's outlay is rent + dev buy +
	// tip; bound each so an injected arg can't drain the funder.
	jitoTipSol = clampJitoTipSol(jitoTipSol);
	priorityMicroLamports = clampPriorityMicroLamports(priorityMicroLamports);
	assertSolWithinCap(rentSol, 'pump_launch (creator rent transfer)');
	if (wantDevBuy) assertSolWithinCap(devBuySol, 'pump_launch (creator dev buy)');
	assertSolWithinCap(rentSol + devBuySol + jitoTipSol, 'pump_launch (funder total outlay)');

	const funder = keypairFromSecret(funderSecret);
	const creator = keypairFromSecret(creatorSecret);
	const mint = mintSecret
		? Keypair.fromSecretKey(bs58decode(mintSecret))
		: Keypair.generate();

	const conn = getConnection();

	// Build the create (+ dev buy) instructions first. Every gate (cashback
	// refusal, holder-reward global switch, SDK capability) fails here, before
	// the funder signs anything or a Jito tip is committed.
	const built = await buildLaunchInstructions({
		conn,
		mint: mint.publicKey,
		creator: creator.publicKey,
		name,
		symbol,
		uri,
		devBuySol,
		slippageBps,
		mayhemMode,
		holderReward,
	});
	const tx2Instructions = built.instructions;
	const devBuyQuote = built.devBuyQuote;

	const funderBal = await conn.getBalance(funder.publicKey, 'confirmed');
	// Creator must cover rent + the dev-buy spend; funder covers all of that + tip
	// + its own fees, with a small headroom for transaction fees on both txs.
	const creatorTransferSol = rentSol + devBuySol;
	const needed = (creatorTransferSol + jitoTipSol + 0.002) * LAMPORTS_PER_SOL;
	if (funderBal < needed) {
		const err = new Error(
			`Funder needs >= ${(needed / LAMPORTS_PER_SOL).toFixed(4)} SOL; has ${(funderBal / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
		);
		err.code = 'insufficient_funds';
		throw err;
	}

	const tipAccount = randomTipAccount();
	const { blockhash } = await conn.getLatestBlockhash('confirmed');

	const tx1Msg = new TransactionMessage({
		payerKey: funder.publicKey,
		recentBlockhash: blockhash,
		instructions: [
			ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
			ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
			SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: creator.publicKey, lamports: Math.floor(creatorTransferSol * LAMPORTS_PER_SOL) }),
			SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: tipAccount, lamports: Math.floor(jitoTipSol * LAMPORTS_PER_SOL) }),
		],
	}).compileToV0Message();
	const tx1 = new VersionedTransaction(tx1Msg);
	tx1.sign([funder]);

	const tx2Msg = new TransactionMessage({
		payerKey: creator.publicKey,
		recentBlockhash: blockhash,
		instructions: [
			ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
			ComputeBudgetProgram.setComputeUnitLimit({ units: wantDevBuy ? 380_000 : 300_000 }),
			...tx2Instructions,
		],
	}).compileToV0Message();
	const tx2 = new VersionedTransaction(tx2Msg);
	tx2.sign([creator, mint]);

	const bundle = [bs58encode(tx1.serialize()), bs58encode(tx2.serialize())];
	const { bundleId, explorer } = await submitBundle(bundle);

	const sig1 = bs58encode(tx1.signatures[0]);
	const sig2 = bs58encode(tx2.signatures[0]);
	const wait = await waitForSignatures(conn, [sig1, sig2], { timeoutMs: 60_000, intervalMs: 2_000 });

	const status = wait.err === 'timeout' ? 'pending' : wait.ok ? 'confirmed' : 'failed';
	return {
		ok: wait.ok,
		status,
		...(status === 'pending'
			? { note: `Launch bundle ${bundleId} did not confirm within the timeout. The mint MAY still have been created — do NOT relaunch without checking ${mint.publicKey.toBase58()} on Solscan/pump.fun first.` }
			: {}),
		bundleId,
		bundleExplorer: explorer,
		mint: mint.publicKey.toBase58(),
		mintSecret: bs58encode(mint.secretKey),
		creator: creator.publicKey.toBase58(),
		holderReward: built.holderReward,
		// The on-chain creator: the holder-rewards PDA for a holder-reward coin
		// (fees go to holders), otherwise the creator wallet.
		onChainCreator: built.onChainCreator,
		funder: funder.publicKey.toBase58(),
		devBuy: devBuyQuote,
		tx1Signature: sig1,
		tx2Signature: sig2,
		statuses: wait.statuses,
		err: wait.err,
		pumpUrl: `https://pump.fun/coin/${mint.publicKey.toBase58()}`,
		fundingTxExplorer: `https://solscan.io/tx/${sig1}`,
		createTxExplorer: `https://solscan.io/tx/${sig2}`,
	};
}

// Build the pump.fun create_v2 instruction set for a launch: create alone, or
// create + extend + ATA + the creator's first buy when devBuySol > 0. Pure
// instruction building plus read-only RPC (Global, FeeConfig); it never signs
// or sends, so it doubles as a dry run. Returns the instructions, the dev-buy
// quote, and the on-chain creator key the program will record.
export async function buildLaunchInstructions({
	conn,
	mint,
	creator,
	name,
	symbol,
	uri,
	devBuySol = 0,
	slippageBps = 500,
	mayhemMode = false,
	cashback = false,
	holderReward = false,
}) {
	if (cashback) throw cashbackDeprecatedError();
	holderReward = holderReward === true;
	devBuySol = Number(devBuySol);
	if (!Number.isFinite(devBuySol) || devBuySol < 0) devBuySol = 0;
	const wantDevBuy = devBuySol > 0;
	slippageBps = Math.min(Math.max(Math.floor(Number(slippageBps) || 0), 1), 10_000);

	// pump-sdk is a CJS module, so import it dynamically to keep this file ESM.
	const pumpSdkPkg = await import('@nirholas/pump-sdk');
	const mod = pumpSdkPkg.default && Object.keys(pumpSdkPkg).length <= 1 ? pumpSdkPkg.default : pumpSdkPkg;
	const PUMP_SDK = mod.PUMP_SDK || pumpSdkPkg.PUMP_SDK || pumpSdkPkg.default?.PUMP_SDK;
	if (!PUMP_SDK || typeof PUMP_SDK.createV2Instruction !== 'function') {
		throw new Error('@nirholas/pump-sdk: PUMP_SDK.createV2Instruction not found in installed version');
	}
	if (wantDevBuy && typeof PUMP_SDK.createV2AndBuyInstructions !== 'function') {
		throw new Error('@nirholas/pump-sdk: PUMP_SDK.createV2AndBuyInstructions not found, dev buy unsupported in this version');
	}

	// The dev-buy quote and the holder-reward gate both need the live Global
	// account. createV2Instruction alone does not check the gate, so we do,
	// instead of letting the program reject the bundle with 6084.
	let online = null;
	let global = null;
	if (wantDevBuy || holderReward) {
		const onlineMod = mod.OnlinePumpSdk || pumpSdkPkg.OnlinePumpSdk;
		if (typeof onlineMod !== 'function') {
			throw new Error('@nirholas/pump-sdk: OnlinePumpSdk not found in installed version');
		}
		online = new onlineMod(conn);
		global = await online.fetchGlobal();
	}
	if (holderReward && !global.isHolderRewardEnabled) throw holderRewardDisabledError();
	const onChainCreator = holderReward ? resolveHolderRewardsPda(mod, pumpSdkPkg, mint) : creator;

	// With a dev buy, the creator's first buy rides in the same instruction set
	// so it lands atomically with the mint. We quote the curve from a
	// fresh-token state (no supply, no curve yet) and apply slippage to the
	// minimum tokens out so block-level rounding can't bounce the buy.
	let instructions;
	let devBuyQuote = null;
	if (wantDevBuy) {
		const getBuyTokenAmountFromSolAmount = mod.getBuyTokenAmountFromSolAmount || pumpSdkPkg.getBuyTokenAmountFromSolAmount;
		if (typeof getBuyTokenAmountFromSolAmount !== 'function') {
			throw new Error('@nirholas/pump-sdk: getBuyTokenAmountFromSolAmount not found, dev buy unsupported in this version');
		}
		const feeConfig = await online.fetchFeeConfig();
		const devBuyLamports = new BN(Math.floor(devBuySol * LAMPORTS_PER_SOL));
		const expectedTokens = getBuyTokenAmountFromSolAmount({
			global,
			feeConfig,
			mintSupply: null,
			bondingCurve: null,
			amount: devBuyLamports,
		});
		const minTokens = expectedTokens.muln(10_000 - slippageBps).divn(10_000);
		// The SDK routes the buy's creator-vault account to the holder-rewards
		// PDA itself when holderReward is set; we pass the creator wallet.
		instructions = await PUMP_SDK.createV2AndBuyInstructions({
			global,
			mint,
			name,
			symbol,
			uri,
			creator,
			user: creator,
			amount: minTokens,
			solAmount: devBuyLamports,
			mayhemMode,
			holderReward,
		});
		devBuyQuote = {
			devBuySol,
			slippageBps,
			expectedTokens: expectedTokens.toString(),
			minTokensOut: minTokens.toString(),
		};
	} else {
		instructions = [
			await PUMP_SDK.createV2Instruction({
				mint,
				name,
				symbol,
				uri,
				creator,
				user: creator,
				mayhemMode,
				holderReward,
			}),
		];
	}
	return { instructions, devBuyQuote, holderReward, onChainCreator: onChainCreator.toBase58(), wantDevBuy };
}

// Build the same error shape the MCP tool reports, so callers can branch on
// `code` without importing SDK error classes.
export function cashbackDeprecatedError() {
	const err = new Error(
		'Cashback launches are retired: the pump.fun program rejects them (error 6082). Launch with holderReward: true to share creator fees with holders instead.',
	);
	err.code = 'cashback_deprecated';
	return err;
}

function holderRewardDisabledError() {
	const err = new Error(
		'Holder-reward launches are currently disabled in the pump.fun Global account (isHolderRewardEnabled = false, program error 6084). Retry later or launch without holderReward.',
	);
	err.code = 'holder_reward_disabled';
	return err;
}

function resolveHolderRewardsPda(mod, pkg, mintPk) {
	const derive = mod.holderRewardsPda || pkg.holderRewardsPda;
	if (typeof derive !== 'function') {
		throw new Error('@nirholas/pump-sdk: holderRewardsPda not found; holder-reward launches need @nirholas/pump-sdk >= 2.0.0');
	}
	return derive(mintPk);
}
