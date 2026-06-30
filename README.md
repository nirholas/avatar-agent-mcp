<p align="center">
  <a href="https://three.ws"><img src="https://three.ws/three-ws-mcp-icon.svg" alt="three.ws" width="88" height="88"></a>
</p>

<h1 align="center">@three-ws/avatar-agent</h1>

<p align="center"><strong>An MCP server that turns any GLB into a 3D AI agent — inspect/validate/optimize models, then give one a Solana wallet, a voice, and pump.fun powers.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@three-ws/avatar-agent"><img alt="npm" src="https://img.shields.io/npm/v/@three-ws/avatar-agent?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@three-ws/avatar-agent"><img alt="downloads" src="https://img.shields.io/npm/dm/@three-ws/avatar-agent?color=cb3837"></a>
  <img alt="license" src="https://img.shields.io/npm/l/@three-ws/avatar-agent?color=3b82f6">
  <img alt="node" src="https://img.shields.io/node/v/@three-ws/avatar-agent?color=339933&logo=node.js">
  <a href="https://modelcontextprotocol.io"><img alt="mcp" src="https://img.shields.io/badge/Model%20Context%20Protocol-✓-9945FF"></a>
  <a href="https://registry.modelcontextprotocol.io/?q=io.github.nirholas"><img alt="MCP Registry" src="https://img.shields.io/badge/MCP%20Registry-io.github.nirholas-0ea5e9"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#setup">Setup</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#tools">Tools</a> ·
  <a href="#requirements">Requirements</a> ·
  <a href="https://three.ws">three.ws</a>
</p>

---

> A single [Model Context Protocol](https://modelcontextprotocol.io) server that is two things at once. It is a general-purpose **3D toolkit** — `inspect_glb`, `validate_glb`, `optimize_glb`, `thumbnail_glb`, and `viewer_url` work on any GLB/glTF model, no avatar required, powered by `@gltf-transform/core` and Khronos's official `gltf-validator`. It is also a **3D AI agent in a box** — spawn a textured GLB avatar, give it a voice (OpenAI TTS), hand it a Solana wallet, and run pump.fun operations (Jupiter swaps, atomic Jito-bundled launches, creator-fee collection). Built and maintained by [three.ws](https://three.ws). Registry name: `io.github.nirholas/3D-AI-Agent-Avatar`.

For a lightweight, read-only avatar viewer (no wallet, no signing), see the sibling package [`@three-ws/avatar-mcp`](https://www.npmjs.com/package/@three-ws/avatar-mcp), which renders a live, rotatable on-chain avatar inline in the chat.

## Install

```bash
npm install @three-ws/avatar-agent
```

Run it directly with `npx` (no install needed) or install globally for the CLI:

```bash
npx -y @three-ws/avatar-agent          # MCP stdio server
npm install -g @three-ws/avatar-agent  # exposes `three-avatar-agent`
```

## Setup

Add the server to your MCP client. **Claude Code**, one line:

```bash
claude mcp add avatar-agent -- npx -y @three-ws/avatar-agent
```

**Claude Desktop / Cursor** (JSON config):

```json
{
	"mcpServers": {
		"avatar-agent": {
			"command": "npx",
			"args": ["-y", "@three-ws/avatar-agent"],
			"env": {
				"SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
				"OPENAI_API_KEY": "sk-...",
				"REPLICATE_API_TOKEN": "r8_..."
			}
		}
	}
}
```

The 3D tools (`inspect_glb`, `validate_glb`, `optimize_glb`, `thumbnail_glb`, `viewer_url`) and `pump_snapshot` work with **no environment variables**. Voice, generation, and signing tools need the keys in [Requirements](#requirements). Restart your client after editing the config.

Inspect the full tool surface in a GUI:

```bash
npx -y @modelcontextprotocol/inspector npx -y @three-ws/avatar-agent
```

## Quick start

Once connected, ask your client in plain language:

> Inspect `https://three.ws/avatars/cz.glb` — how many triangles? Then validate it against the Khronos spec and optimize it with Draco.

Runs `inspect_glb` → `validate_glb` → `optimize_glb({ draco: true })`, returning the smaller GLB inline.

> Spawn the `cz` avatar, give him shades, mint him a `three`-prefixed Solana wallet, pull a snapshot of $THREE, and have him say "we're so back."

Runs `spawn_avatar` → `dress_avatar` → `wallet_create({ vanityPrefix: "three" })` → `pump_snapshot` → `speak`.

## Tools

All 20 tools are free MCP tools — there is no per-call x402 charge. Tools marked **execution** sign and broadcast real Solana transactions that move real funds; configure your client's tool-approval flow for them.

Every tool ships [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations): reads advertise `readOnlyHint: true`, and the four execution tools (`wallet_send`, `pump_buy`, `pump_launch`, `pump_collect_fees`) are flagged `destructiveHint: true`, so annotation-aware MCP clients prompt for confirmation before running them. The hints are advisory — the server-side `REQUIRE_CONFIRM` gate and spend caps (see [Safety](#safety)) apply regardless of client.

### 3D toolkit — works on any GLB, no avatar required

| Tool            | What it does                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inspect_glb`   | Mesh / material / texture / animation / skin breakdown, bounding box, vertex and triangle counts. `@gltf-transform/core`.                                              |
| `validate_glb`  | Runs Khronos's official `gltf-validator`; returns errors, warnings, infos, hints with JSON pointers.                                                                   |
| `optimize_glb`  | Dedup → prune → weld → optional Draco. Returns the optimized bytes inline with before/after sizes.                                                                     |
| `thumbnail_glb` | Renders any GLB to a PNG via three.ws's hosted three-light rig + auto-framing camera. Returns base64 PNG inline.                                                       |
| `viewer_url`    | Builds a `three.ws/viewer?...` URL + paste-ready iframe for any GLB or avatar session (background, auto-rotate, camera preset or explicit orbit, AR mode, dimensions). |

### Avatar

| Tool              | What it does                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `list_avatars`    | Catalog of default GLB avatars (`default`, `cz`), accessories, and pose presets.                              |
| `list_animations` | Live fetch of three.ws's pose presets (T-pose, wave, thinker, jump, dance, warrior2, …) grouped by category.  |
| `spawn_avatar`    | Creates an avatar session from a preset or custom GLB URL. Returns a `sessionId`.                             |
| `dress_avatar`    | Applies accessories + a pose to a session.                                                                    |
| `render_avatar`   | Renders a posed avatar to a PNG — pose preset + camera orbit (theta/phi/radius) + ARKit-52 facial expression. |
| `generate_avatar` | Text/image-to-3D via Replicate (Hunyuan-3D). New session preloaded with the generated GLB.                    |

### Voice

| Tool    | What it does                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `speak` | Synthesizes speech in the avatar's voice — free NVIDIA Magpie TTS lane first (`NVIDIA_API_KEY`), OpenAI TTS backstop (`OPENAI_API_KEY`). Returns base64 audio the client plays. |

### Wallet

| Tool             | What it does                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `wallet_create`  | Generates a Solana keypair. Optional vanity grinder (`vanityPrefix: "three"`). Secret is returned once. |
| `wallet_balance` | Reads SOL + all SPL token balances (incl. Token-2022).                                                  |
| `wallet_send`    | Sends SOL on mainnet. **Execution.**                                                                    |

### pump.fun

| Tool                | What it does                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pump_snapshot`     | Live market snapshot: USD price (Jupiter), 24h volume + DEX (Dexscreener), pump.fun metadata, top-holder distribution. Pass `target: "three"` for $THREE when `THREE_MINT` is set. Read-only, no signer. |
| `pump_buy`          | Jupiter swap, direct or **Jito-bundled** (funder→buyer transfer + swap atomic). Accepts any runtime mint. **Execution.**                                                                                 |
| `pump_launch`       | **Atomic launch** via Jito bundle: separate funder + creator wallets, both txs in the same block. Uploads metadata to pump.fun IPFS if no URI is supplied. **Execution.**                                |
| `pump_collect_fees` | **Atomic collect**: `collectCoinCreatorFee` + drain to a safe wallet in one tx inside a Jito bundle — resistant to a leaked creator key. **Execution.**                                                  |

### Identity

| Tool              | What it does                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `ens_sns_resolve` | Resolves `.eth` (ENS) and `.sol` (Bonfida SNS) names to addresses, with reverse + favorite-domain lookups. |

## How atomic pump.fun works

The `pump_launch` and `pump_collect_fees` tools wrap two patterns:

- **Launch** — the create tx's `payerKey` is the **creator** wallet, so the on-chain `creator` field (which receives pump.fun creator fees forever) is the creator wallet. The creator does not need to hold SOL: the funder transfers rent + tip in Tx1 of the same Jito bundle. Either both txs land or neither does.
- **Collect** — even if a creator key is shared or leaked, collect-and-drain runs as a single tx inside a Jito bundle, so no competing collector can interleave a tx between `collectCoinCreatorFee` and the drain.

If you start hitting `Bundles must write lock at least one tip account`, the [Jito tip-account list](https://docs.jito.wtf/) has rotated.

These tools accept an arbitrary mint supplied at runtime — generic plumbing for launching and managing your own coin. **$THREE** (`FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump`) is the only coin three.ws promotes.

## Requirements

- **Node** `>=20`.

Per-tool environment variables (all optional — set only what you use):

| Variable                         | Required for                              | Notes                                                                                                                   |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SOLANA_RPC_URL`                 | All Solana ops                            | Defaults to `https://api.mainnet-beta.solana.com`. Bring your own (Helius / QuickNode / Triton) for production traffic. |
| `ETH_RPC_URL`                    | `ens_sns_resolve`                         | Optional — falls back to ethers' default public providers.                                                              |
| `HELIUS_API_KEY`                 | `pump_snapshot` (enhanced)                | Adds exact supply + DAS data.                                                                                           |
| `NVIDIA_API_KEY`                 | `speak` (free lane)                       | NVIDIA NIM key (`nvapi-…`) — leads the TTS provider chain with Magpie TTS.                                              |
| `OPENAI_API_KEY`                 | `speak` (paid backstop)                   | Used against `api.openai.com/v1/audio/speech` when the free lane is unavailable.                                        |
| `REPLICATE_API_TOKEN`            | `generate_avatar`                         | Replicate text/image-to-3D.                                                                                             |
| `REPLICATE_TEXT_TO_AVATAR_MODEL` | `generate_avatar`                         | Pin a commercial-OK version, e.g. latest `tencent/hunyuan-3d-3.1`.                                                      |
| `SOLANA_SECRET_KEY`              | `wallet_send` / `pump_buy` default signer | Per-call `secret` args override. Treat like cash.                                                                       |
| `THREE_MINT`                     | `pump_snapshot` / `pump_buy` shorthand    | Set so tools accept `target: "three"`.                                                                                  |
| `MAX_SOL_PER_TX`                 | execution tools                           | Per-transaction spend cap in SOL. Default `0.5`.                                                                        |
| `REQUIRE_CONFIRM`                | execution tools                           | Default on: execution calls refuse until re-issued with `confirm: true`. Set `0`/`false` to disable.                    |

## Safety

`wallet_send`, `pump_buy`, `pump_launch`, and `pump_collect_fees` execute real on-chain transactions. The server makes no judgment about inputs — with a valid signer it does exactly what it is told. Secrets are never logged or persisted; the secret from `wallet_create` is returned once.

Three layers keep that power in check:

1. **Tool annotations** — the four execution tools are flagged `destructiveHint: true`, so annotation-aware MCP clients (Claude Code, Claude Desktop, Cursor) surface a confirmation prompt before running them. Read-only tools are flagged `readOnlyHint: true` and can be safely auto-approved.
2. **Confirmation gate** — with `REQUIRE_CONFIRM` on (the default), every execution call returns `confirmation_required` until re-issued with `confirm: true`, independent of the client.
3. **Spend caps** — `MAX_SOL_PER_TX` (default 0.5 SOL) bounds every send, buy, tip, and drain server-side.

## Links

- Homepage: https://three.ws
- Sibling package: [`@three-ws/avatar-mcp`](https://www.npmjs.com/package/@three-ws/avatar-mcp) — live, read-only avatar viewer for MCP
- Changelog: https://three.ws/changelog
- Issues: https://github.com/nirholas/three.ws/issues
- License: Apache-2.0 — see [LICENSE](./LICENSE)

---

<p align="center">
  <sub>
    Part of the <a href="https://three.ws">three.ws</a> SDK suite — 3D AI agents, on-chain identity, and agent payments.<br/>
    <a href="https://three.ws">Website</a> · <a href="https://three.ws/changelog">Changelog</a> · <a href="https://github.com/nirholas/three.ws">GitHub</a>
  </sub>
</p>

## License

Copyright © 2026 nirholas. All rights reserved.

This software is proprietary — see [LICENSE](./LICENSE). No rights are granted
without the express written permission of the copyright owner.
