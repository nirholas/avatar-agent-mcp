// glTF / GLB I/O helpers — load a GLB from a URL or a base64 data URL into
// a @gltf-transform/core Document, and serialize back to bytes when needed.
//
// The @gltf-transform NodeIO reader does the binary parsing (BIN chunk +
// JSON chunk per the glTF 2.0 spec). Registering ALL_EXTENSIONS is not enough
// on its own: the compression extensions declare read/write DEPENDENCIES that
// must be supplied separately, and the reader throws if one is missing. We
// attach both codecs on reader + writer:
//   - draco3d.{encoder,decoder} for KHR_draco_mesh_compression
//   - meshopt.{encoder,decoder} for EXT_meshopt_compression
// Meshopt is not optional here: every three.ws avatar GLB ships with
// EXT_meshopt_compression in extensionsRequired, so without the decoder the
// platform's own default avatar failed to parse.

import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3dgltf from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

let _io = null;

async function buildIo() {
	const [encoder, decoder] = await Promise.all([
		draco3dgltf.createEncoderModule(),
		draco3dgltf.createDecoderModule(),
	]);
	await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
	return new NodeIO()
		.registerExtensions(ALL_EXTENSIONS)
		.registerDependencies({
			'draco3d.encoder': encoder,
			'draco3d.decoder': decoder,
			'meshopt.encoder': MeshoptEncoder,
			'meshopt.decoder': MeshoptDecoder,
		});
}

export async function getIo() {
	if (!_io) _io = await buildIo();
	return _io;
}

export async function fetchGlbBytes(url) {
	if (url.startsWith('data:')) {
		const comma = url.indexOf(',');
		if (comma === -1) throw new Error('Invalid data URL');
		const meta = url.slice(5, comma);
		const data = url.slice(comma + 1);
		if (meta.includes(';base64')) {
			return Buffer.from(data, 'base64');
		}
		return Buffer.from(decodeURIComponent(data), 'utf8');
	}
	const r = await fetch(url);
	if (!r.ok) throw new Error(`Failed to fetch ${url}: HTTP ${r.status}`);
	return Buffer.from(await r.arrayBuffer());
}

export async function readDocument(url) {
	const io = await getIo();
	const bytes = await fetchGlbBytes(url);
	const doc = await io.readBinary(bytes);
	return { doc, bytes };
}

export async function writeBinary(doc) {
	const io = await getIo();
	return io.writeBinary(doc);
}
