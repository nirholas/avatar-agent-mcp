// Shared Zod fragments for tool OUTPUT schemas.
//
// Conventions (mirrors how each tool's inputSchema is a raw Zod shape):
//   • Every tool's `outputSchema` is a raw shape — the SDK wraps it in an
//     object schema and VALIDATES structuredContent against it on every
//     non-error result (isError:true responses skip validation).
//   • Schemas are HONEST: required only for fields every code path sets;
//     soft-fail paths (`{ ok:false, error, ... }` returned without isError)
//     must parse too, so most success fields are optional.
//   • Upstream-shaped subobjects (pump.fun metadata, Khronos validator info,
//     Dexscreener pairs, Replicate output) use `.passthrough()` so new
//     upstream fields never break validation.

import { z } from 'zod';

/** `error` + `message` — present on soft-fail returns, absent on success. */
export const softFailFields = {
	error: z.string().optional().describe('Machine-readable error code when ok is false.'),
	message: z.string().optional().describe('Human-readable explanation when ok is false.'),
};

/**
 * Standard result shape: `ok` is the only field EVERY path sets; soft-fail
 * fields and the given success fields are optional by construction.
 * @param {import('zod').ZodRawShape} successShape — success fields (already optional unless truly always present)
 * @returns {import('zod').ZodRawShape}
 */
export function resultShape(successShape = {}) {
	return {
		ok: z.boolean().describe('True when the operation succeeded (or, for on-chain bundles, confirmed).'),
		...softFailFields,
		...successShape,
	};
}

/**
 * An upstream-shaped subobject: known fields typed, unknown fields allowed.
 * @param {import('zod').ZodRawShape} shape
 */
export function upstreamObject(shape = {}) {
	return z.object(shape).passthrough();
}

/**
 * A per-source aggregation slot (pump_snapshot pattern): the source either
 * returned data, soft-failed with `{ error }`, or was skipped (`null`).
 * @param {import('zod').ZodRawShape} shape — the source's success fields (mark optional)
 */
export function softSource(shape = {}) {
	return upstreamObject({
		...shape,
		error: z.string().optional().describe('Set when this source was unreachable; other sources may still have data.'),
	}).nullable();
}

/** Solscan / Jito explorer URL. */
export const explorerUrl = z.string().describe('Block-explorer URL (Solscan account/tx or Jito bundle).');

/** Base58 transaction signature. */
export const txSignature = z.string().describe('Base58 Solana transaction signature.');

/** Avatar reference stored on a session ({ glb, source }). */
export const avatarRef = upstreamObject({
	glb: z.string().describe('GLB URL of the avatar.'),
	source: z.string().describe('"three.ws" for CDN-hosted defaults, "external" otherwise.'),
});

/** Catalog accessory entry ({ id, slot, glb, name }). */
export const accessoryEntry = upstreamObject({
	id: z.string(),
	slot: z.string(),
	glb: z.string(),
	name: z.string(),
});

/** Session id echo — null when the call ran without a session. */
export const sessionEcho = z.string().nullable().describe('Avatar session id, or null when no session was involved.');

/**
 * Jito-bundle / signature-wait outcome fields shared by wallet_send,
 * pump_buy, pump_launch, and pump_collect_fees results.
 */
export const bundleOutcomeFields = {
	status: z
		.union([z.string(), z.number()])
		.optional()
		.describe('"confirmed" | "pending" | "failed" on success paths; an upstream HTTP status on some soft fails.'),
	note: z.string().optional().describe('Set when status is "pending" — the tx MAY still land; check the explorer before retrying.'),
	statuses: z.array(z.string().nullable()).nullable().optional().describe('Per-signature confirmation statuses, null on timeout.'),
	err: z.unknown().describe('On-chain error object, "timeout", or null.'),
};

/**
 * Hosted PNG render outcome (three.ws /api/render/*) shared by
 * thumbnail_glb and render_avatar. Both success and upstream-error
 * envelopes set status/endpoint/durationMs; local invalid_input does not.
 */
export const pngRenderFields = {
	status: z.number().optional().describe('Upstream HTTP status.'),
	endpoint: z.string().optional().describe('three.ws render endpoint that produced the image.'),
	durationMs: z.number().optional(),
	sizeBytes: z.number().optional(),
	mime: z.literal('image/png').optional(),
	dataUrl: z
		.string()
		.nullable()
		.optional()
		.describe('base64 PNG data URL, or null when the image exceeded the inline cap.'),
	omittedInline: z.boolean().optional(),
	meta: upstreamObject({
		width: z.number().nullable(),
		height: z.number().nullable(),
		background: z.string().nullable(),
		pose: z.string().nullable(),
		poseLabel: z.string().nullable(),
	}).optional(),
};
