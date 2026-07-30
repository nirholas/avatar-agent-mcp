# avatar-agent-mcp examples

3D AI Agent Avatar — MCP server that spawns a textured GLB avatar, inspects/validates/optimizes any 3D model, gives the agent a Solana wallet + a voice, and ships full pump.fun powers (atomic Jito-bundled launches + creator-fee collection). Powered by three.ws.

## Example 1

```bash
npm install @three-ws/avatar-agent
```

## Example 2

```bash
npx -y @three-ws/avatar-agent          # MCP stdio server
npm install -g @three-ws/avatar-agent  # exposes `three-avatar-agent`
```

## Example 3

```bash
claude mcp add avatar-agent -- npx -y @three-ws/avatar-agent
```

## Example 4

```bash
npx -y @modelcontextprotocol/inspector npx -y @three-ws/avatar-agent
```


Every snippet above is taken from the [repository documentation](https://github.com/nirholas/avatar-agent-mcp#readme).
