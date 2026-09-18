// pump_launch against @nirholas/pump-sdk 2: cashback is refused before any
// network call or signature, and the create instruction carries the
// holder-reward flag. Offline: no RPC, no signing, synthetic keys only.
//
// Run: node --test test/pump-launch.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Keypair, PublicKey } from '@solana/web3.js';

import { buildLaunchInstructions, cashbackDeprecatedError } from '../src/lib/atomic-launch.js';
import { def as pumpLaunch } from '../src/tools/pump-launch.js';

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

test('pump_launch refuses cashback before the confirm gate, upload, or any signer is read', async () => {
	const out = await pumpLaunch.handler({
		name: 'Synthetic',
		symbol: 'SYN',
		funderSecret: 'not-a-real-secret',
		creatorSecret: 'not-a-real-secret',
		cashback: true,
	});
	assert.equal(out.ok, false);
	assert.equal(out.error, 'cashback_deprecated');
	assert.match(out.message, /6082/);
	assert.match(out.message, /holderReward/);
});

test('pump_launch schema offers holderReward and documents cashback as retired', () => {
	assert.ok(pumpLaunch.inputSchema.holderReward, 'holderReward input is missing');
	assert.ok(pumpLaunch.inputSchema.cashback, 'cashback input is missing');
	assert.equal(pumpLaunch.inputSchema.holderReward.safeParse(true).success, true);
	assert.match(pumpLaunch.inputSchema.cashback.description, /Retired/);
	assert.match(pumpLaunch.description, /holderReward/);
});

test('buildLaunchInstructions throws cashback_deprecated with no RPC call', async () => {
	await assert.rejects(
		buildLaunchInstructions({
			conn: null,
			mint: Keypair.generate().publicKey,
			creator: Keypair.generate().publicKey,
			name: 'Synthetic',
			symbol: 'SYN',
			uri: 'https://three.ws/synthetic.json',
			cashback: true,
		}),
		(err) => err.code === cashbackDeprecatedError().code,
	);
});

test('a plain launch builds one create_v2 instruction offline with the wallet as creator', async () => {
	const mint = Keypair.generate().publicKey;
	const creator = Keypair.generate().publicKey;
	const built = await buildLaunchInstructions({
		conn: null,
		mint,
		creator,
		name: 'Synthetic',
		symbol: 'SYN',
		uri: 'https://three.ws/synthetic.json',
	});
	assert.equal(built.instructions.length, 1);
	assert.equal(built.instructions[0].programId.toBase58(), PUMP_PROGRAM_ID);
	assert.equal(built.holderReward, false);
	assert.equal(built.onChainCreator, creator.toBase58());
	assert.equal(built.devBuyQuote, null);
});

test('the installed SDK encodes the holder-reward flag into create_v2', async () => {
	const { PUMP_SDK, holderRewardsPda } = await import('@nirholas/pump-sdk');
	const mint = Keypair.generate().publicKey;
	const creator = Keypair.generate().publicKey;
	const base = { mint, name: 'Synthetic', symbol: 'SYN', uri: 'https://three.ws/synthetic.json', creator, user: creator, mayhemMode: false };
	const off = await PUMP_SDK.createV2Instruction({ ...base, holderReward: false });
	const on = await PUMP_SDK.createV2Instruction({ ...base, holderReward: true });
	assert.equal(off.data.length, on.data.length);
	assert.notDeepEqual(off.data, on.data, 'holderReward must change the create_v2 payload');
	assert.equal(on.data[on.data.length - 1], 1);
	assert.equal(off.data[off.data.length - 1], 0);
	assert.ok(holderRewardsPda(mint) instanceof PublicKey);
});
