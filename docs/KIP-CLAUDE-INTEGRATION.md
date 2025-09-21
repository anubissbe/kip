# KIP-Claude Integration Documentation

Complete guide for setting up KIP enforcement across all Claude Code command sets with auto-restoration.

## Overview

This system integrates KIP (Knowledge Integration Platform) with Claude Code to:
- Enforce KIP usage for all knowledge operations
- Automatically restore KIP headers after `/init` commands
- Provide convenient KIP query aliases
- Work seamlessly across all projects

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Claude Code   │    │   KIP MCP        │    │   KIP Nexus     │
│      TUI        │◄──►│    Bridge        │◄──►│    Server       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────┐                            ┌─────────────────┐
│ Command Files   │                            │   Neo4j Graph   │
│ (KIP Headers)   │                            │    Database     │
└─────────────────┘                            └─────────────────┘
```

## Components

### 1. KIP MCP Bridge (`/opt/projects/kip-mcp/`)
- **File**: `index.js` - Main MCP server implementation
- **File**: `run.sh` - Startup script for the MCP server
- **Tools**: `execute_kip`, `ensure_kip_header`
- **Transport**: stdio-based communication

### 2. KIP Nexus Server (`/opt/projects/kip/nexus/`)
- **File**: `server.js` - Express server with Neo4j backend
- **Port**: 8081 (configurable via PORT env var)
- **Auth**: Bearer token authentication
- **Database**: Neo4j graph database

### 3. Command Enhancement System
- **Location**: `~/.claude/commands/`
- **Files**: All `.md` command files with KIP enforcement headers
- **Aliases**: `/kip`, `/kip-q`, `/kip-now`, `/init` (overridden)

### 4. Auto-Restoration System
- **Override**: `~/.claude/commands/init.md` - Custom init command
- **Script**: `/opt/projects/kip/scripts/restore-kip-after-init.sh` - Universal restore script
- **Trigger**: Automatically runs after any `/init` command

## Installation Guide

### Prerequisites
- Ubuntu 22.04+ / WSL2
- Node.js 18+
- Docker & Docker Compose
- Claude Code CLI installed

### Quick Install
```bash
# Download and run the complete setup
curl -fsSL https://raw.githubusercontent.com/yourusername/kip/main/install-kip-claude.sh | bash

# Or clone and run locally
git clone https://github.com/yourusername/kip.git /opt/projects/kip
cd /opt/projects/kip
bash scripts/install-kip-claude.sh
```

### Manual Installation

#### Step 1: Clone KIP Repository
```bash
sudo mkdir -p /opt/projects
sudo chown $USER:$USER /opt/projects
git clone https://github.com/yourusername/kip.git /opt/projects/kip
cd /opt/projects/kip
```

#### Step 2: Install KIP MCP Bridge
```bash
# Install MCP bridge
sudo mkdir -p /opt/projects/kip-mcp
sudo cp mcp/index.js /opt/projects/kip-mcp/
sudo cp mcp/run.sh /opt/projects/kip-mcp/
sudo chmod +x /opt/projects/kip-mcp/run.sh

# Install dependencies
cd /opt/projects/kip-mcp
npm init -y
npm install @modelcontextprotocol/sdk node-fetch
```

#### Step 3: Start KIP Services
```bash
cd /opt/projects/kip

# Copy environment template
cp .env.example .env

# Start services (Neo4j + Nexus)
docker compose up -d

# Wait for services to be ready
sleep 10
```

#### Step 4: Register MCP Server
```bash
# Set environment variables
set -a; source .env; set +a

# Register at user scope
claude mcp add kip --transport stdio --scope user "/opt/projects/kip-mcp/run.sh" \
  --env KIP_URL=http://localhost:8081/execute_kip \
  --env KIP_TOKEN=${KIP_TOKEN:-changeme-kip-token}

# Verify registration
claude mcp list | grep kip
```

#### Step 5: Install Command Enhancements
```bash
# Run the command enhancement script
bash scripts/patch_all_commands.sh
```

## File Structure

```
/opt/projects/kip/
├── docs/
│   └── KIP-CLAUDE-INTEGRATION.md     # This documentation
├── mcp/
│   ├── index.js                      # MCP server implementation
│   └── run.sh                        # MCP startup script
├── nexus/
│   └── server.js                     # KIP Nexus server
├── scripts/
│   ├── install-kip-claude.sh         # Complete installation script
│   ├── uninstall-kip-claude.sh       # Clean removal script
│   ├── patch_all_commands.sh         # Command enhancement script
│   └── restore-kip-after-init.sh     # Universal restore script
├── docker-compose.yml                # Service orchestration
├── .env.example                      # Environment template
└── README.md                         # Basic project info

/opt/projects/kip-mcp/
├── index.js                          # MCP bridge (copied from mcp/)
├── run.sh                            # Startup script
└── package.json                      # Node.js dependencies

~/.claude/commands/
├── init.md                           # Overridden init command
├── kip.md                            # KIP query alias
├── kip-q.md                          # Quiet KIP queries
├── kip-now.md                        # KIP reminder
├── superclaude-kip.md               # SuperClaude wrapper
└── sc/                               # SuperClaude commands (all enhanced)
    ├── analyze.md                    # With KIP headers
    ├── task.md                       # With KIP headers
    └── ...                           # All other commands
```

## Configuration

### Environment Variables
```bash
# KIP Server Configuration
KIP_URL=http://localhost:8081/execute_kip
KIP_TOKEN=changeme-kip-token

# Neo4j Configuration
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme-neo4j

# Server Configuration
PORT=8081
```

### KIP Query Language
```
# Find Operations
FIND <Label> WHERE field = 'value' [LIMIT n]
FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
FIND * LIMIT n

# Write Operations
UPSERT <Label> {name: 'value', field: 'value'}
DELETE <Label> WHERE field = 'value'

# Examples
FIND Policy WHERE name = 'Password Rotation'
FIND Config WHERE type CONTAINS 'security' LIMIT 5
UPSERT Policy {name: 'Backup Schedule', value: 'daily at 2am'}
```

## Usage

### Command Aliases
```bash
# In Claude Code TUI:
/kip FIND Policy WHERE name = 'Password Rotation'      # Execute query
/kip-q FIND * LIMIT 3                                  # Quiet mode (JSON only)
/kip-now                                               # Set KIP reminder
/init                                                  # Auto-restores KIP headers
```

### Direct API Access
```bash
# Direct HTTP requests
curl -X POST http://localhost:8081/execute_kip \
  -H "Authorization: Bearer changeme-kip-token" \
  -H "Content-Type: application/json" \
  -d '{"query":"FIND Policy WHERE name = '\''Password Rotation'\''"}'
```

### Command Enhancement
All SuperClaude commands automatically include:
1. KIP enforcement reminder
2. Query syntax reference
3. Mandatory KIP usage for knowledge operations

## Auto-Restoration System

### How It Works
1. User runs `/init` in any project
2. Claude Code loads the overridden `~/.claude/commands/init.md`
3. Init runs normally, then automatically calls restore script
4. Restore script finds the project's CLAUDE.md and adds KIP header
5. Only affects KIP-enabled projects (others unaffected)

### The Magic
```bash
# This runs automatically after every /init:
if [ -f "/opt/projects/kip/scripts/restore-kip-after-init.sh" ]; then
    bash /opt/projects/kip/scripts/restore-kip-after-init.sh
    echo "✅ KIP headers restored after init"
fi
```

## Troubleshooting

### Common Issues

#### 1. MCP Tools Not Available
```bash
# Check MCP registration
claude mcp list | grep kip

# If not connected, re-register:
claude mcp remove kip -s user
claude mcp add kip --transport stdio --scope user "/opt/projects/kip-mcp/run.sh" \
  --env KIP_URL=http://localhost:8081/execute_kip \
  --env KIP_TOKEN=changeme-kip-token
```

#### 2. KIP Server Not Responding
```bash
# Check services
docker compose ps

# Check logs
docker compose logs nexus

# Restart services
docker compose restart
```

#### 3. Bad FIND Syntax Errors
```bash
# Wrong: FIND * LIMIT 3
# Right: FIND Policy WHERE name = 'value' LIMIT 3

# Test query format:
curl -X POST http://localhost:8081/execute_kip \
  -H "Authorization: Bearer changeme-kip-token" \
  -H "Content-Type: application/json" \
  -d '{"query":"FIND Policy WHERE name = '\''Password Rotation'\''"}'
```

#### 4. Headers Not Restored After /init
```bash
# Manual restoration:
bash /opt/projects/kip/scripts/restore-kip-after-init.sh

# Check if init override exists:
ls -la ~/.claude/commands/init.md
```

### Diagnostic Commands
```bash
# Check KIP system status
bash /opt/projects/kip/scripts/test_suite.sh

# Verify command enhancements
grep -r "KIP-ENFORCEMENT-START" ~/.claude/commands/ | wc -l

# Test MCP bridge
claude --print "/mcp__kip__ensure_kip_header"
```

## Maintenance

### Updates
```bash
# Update KIP system
cd /opt/projects/kip
git pull origin main
bash scripts/install-kip-claude.sh  # Re-run installer
```

### Backup Commands
```bash
# Backup command enhancements
tar -czf ~/claude-commands-backup-$(date +%Y%m%d).tar.gz ~/.claude/commands/

# Restore from backup
tar -xzf ~/claude-commands-backup-YYYYMMDD.tar.gz -C ~/
```

### Clean Removal
```bash
# Complete uninstall
bash /opt/projects/kip/scripts/uninstall-kip-claude.sh
```

## Security Considerations

### Token Management
- Change default KIP_TOKEN in production
- Use environment variables, not hardcoded tokens
- Restrict Neo4j access to localhost only

### Network Security
- KIP Nexus runs on localhost:8081 only
- No external network exposure by default
- Use Docker network isolation

### Access Control
- MCP bridge runs with user permissions
- No sudo access required for normal operations
- File permissions restrict access to user directory

## Advanced Configuration

### Custom Command Locations
```bash
# If commands are in different location:
export CLAUDE_COMMANDS_DIR="/custom/path/commands"
bash scripts/patch_all_commands.sh
```

### Multiple Environments
```bash
# Development environment
cp .env.example .env.dev
sed -i 's/changeme-kip-token/dev-token-123/g' .env.dev

# Production environment
cp .env.example .env.prod
sed -i 's/changeme-kip-token/prod-token-456/g' .env.prod
```

### Custom Restore Locations
```bash
# Project-specific restore script
cp /opt/projects/kip/scripts/restore-kip-after-init.sh ./restore-kip-after-init.sh
# Edit for project-specific logic
```

## Contributing

### Development Setup
```bash
# Clone for development
git clone https://github.com/yourusername/kip.git
cd kip

# Install development dependencies
npm install

# Run tests
npm test

# Start development servers
docker compose -f docker-compose.dev.yml up
```

### Testing Changes
```bash
# Test MCP bridge
node mcp/index.js < test-input.json

# Test command enhancements
bash scripts/test_suite.sh

# Test auto-restoration
/init  # In Claude Code TUI
```

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: https://github.com/yourusername/kip/issues
- Documentation: https://github.com/yourusername/kip/docs
- Discord: https://discord.gg/your-invite