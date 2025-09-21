# CHANGELOG

## v0.8.0
- MCP prompts: `ensure_kip_header` and `run_kip`.
- Nexus parser: support for
  - `FIND <Label> [WHERE field = 'v' | field CONTAINS 'v'] [LIMIT N]`
  - `FIND WHERE field = 'v' [LIMIT N]`
  - `FIND *` / `FIND ALL` [LIMIT N]
  - `UPSERT <Label> { key:'value', ... }`
- Patch script to **KIP-enforce** *all* custom commands recursively (`~/.claude/commands/**.md`).
