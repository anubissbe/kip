
# KIP (Knowledge Integration Platform) - Claude Code Integration

Complete integration system for enforcing KIP usage across all Claude Code command sets with automatic restoration after `/init` commands.

## Quick Start

### One-Line Install
```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/kip/main/scripts/install-kip-claude.sh | bash
```

### Manual Install
```bash
git clone https://github.com/yourusername/kip.git /opt/projects/kip
cd /opt/projects/kip
bash scripts/install-kip-claude.sh
```

### Test Installation
```bash
# In Claude Code TUI:
/kip-q FIND Policy WHERE name='Password Rotation'
/init  # Should auto-restore KIP headers
```

### Uninstall
```bash
bash /opt/projects/kip/scripts/uninstall-kip-claude.sh
```

## What This Does

1. **KIP Enforcement**: All Claude Code commands enforce KIP usage for knowledge operations
2. **Auto-Restoration**: `/init` automatically restores KIP headers (no more manual fixes!)
3. **Convenient Aliases**: `/kip`, `/kip-q`, `/kip-now` for easy KIP queries
4. **Universal**: Works across all projects and command sets

## Architecture

```
Claude Code TUI ──► MCP Bridge ──► KIP Nexus ──► Neo4j Database
     │
     └─► Enhanced Commands (with KIP headers)
```

## Key Features

- ✅ **Automatic**: `/init` command automatically restores KIP after running
- ✅ **Universal**: Works with all SuperClaude and custom commands
- ✅ **Safe**: Full backup system with easy rollback
- ✅ **Clean**: Easy uninstall removes everything cleanly
- ✅ **Tested**: Comprehensive test suite and verification

## File Structure

```
/opt/projects/kip/
├── docs/KIP-CLAUDE-INTEGRATION.md  # Complete documentation
├── scripts/
│   ├── install-kip-claude.sh       # One-shot installer
│   ├── uninstall-kip-claude.sh     # Clean removal
│   └── restore-kip-after-init.sh   # Universal restore script
├── mcp/                            # MCP bridge implementation
├── nexus/                          # KIP server
└── docker-compose.yml             # Service orchestration
```

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `/kip` | Execute KIP query | `/kip FIND Policy WHERE name='Backup'` |
| `/kip-q` | Quiet mode (JSON only) | `/kip-q FIND * LIMIT 3` |
| `/kip-now` | Set KIP reminder | `/kip-now` |
| `/init` | **Auto-restores KIP!** | `/init` |

## Development Setup

### Local KIP Nexus + Neo4j
```bash
cp .env.example .env
docker compose up -d --build
docker compose ps
curl -sS http://localhost:8081/.well-known/ai-plugin.json | jq .name_for_human
./scripts/seed.sh
```

## Documentation

📚 **Full Documentation**: [`docs/KIP-CLAUDE-INTEGRATION.md`](docs/KIP-CLAUDE-INTEGRATION.md)

- Complete setup guide
- Architecture overview
- Troubleshooting
- Configuration options
- Security considerations

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/kip/issues)
- **Logs**: `docker compose -f /opt/projects/kip/docker-compose.yml logs`
- **Status**: `bash /opt/projects/kip/scripts/test_suite.sh`

## License

MIT License - see [LICENSE](LICENSE) file for details.
