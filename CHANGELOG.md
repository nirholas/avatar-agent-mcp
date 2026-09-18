# Changelog

All notable changes to `@three-ws/avatar-agent` are recorded here.

## [Unreleased]

### Changed

- Moved to `@nirholas/pump-sdk` 2.0, which tracks the pump.fun program upgrade (IDL synced to the deployed 47-instruction program, `@pump-fun/pump-swap-sdk` 1.20). The SDK no longer pulls in Puppeteer or Playwright, so installs are much smaller.
- `bn.js` is now a declared dependency; `atomic-launch.js` imported it directly while relying on it arriving transitively.

### Added

- `pump_launch` accepts `holderReward: true` to launch a holder-reward coin. The program records the mint's holder-rewards PDA as the creator, so creator fees are distributed to token holders. The result carries `holderReward` and `onChainCreator`. The pump.fun Global switch `isHolderRewardEnabled` is read before anything is signed; when it is off the tool returns `holder_reward_disabled` instead of spending a Jito tip on a bundle the program rejects with error 6084.
- `buildLaunchInstructions` in `src/lib/atomic-launch.js`: builds the create (and optional dev buy) instruction set with read-only RPC and no signing, used by `atomicLaunch` and usable as a dry run.

### Removed

- Cashback launches. The upgraded program rejects new cashback coins with error 6082, so `pump_launch` refuses `cashback: true` with `cashback_deprecated` before any metadata upload or signature. Trading and claims on existing cashback coins are unaffected.
