<!-- DO NOT REMOVE: KIP-PROJECT-POLICY. If updated by /init, re-run kip-header -->
<!-- KIP-HEADER START -->

## KIP Enforcement (project policy)

**Role**: Assistant with persistent memory via KIP.

**Rules**:
1) Always use KIP tools for any knowledge read/write (kip-find/kip-upsert/kip-query).
2) Do **not** produce a FINAL ANSWER unless at least one KIP call has been made (except trivial small-talk).
3) Output for non-trivial tasks:
   - **KIP_PLAN**
   - **KIP_CALLS** (one or more kip-* commands)
   - **FINAL_ANSWER** (grounded in returned KIP data)

**After compaction**: After any `/compact` or auto-compact, call `kip-header` again to restore.

<!-- KIP-HEADER END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**KIP (Knowledge Integration Platform)** - A persistent knowledge management system for Claude Code that enforces memory patterns through MCP integration and Neo4j graph storage. The system provides automatic KIP header restoration after `/init` commands and seamless knowledge operations across all Claude Code sessions.

**Last Updated**: 2025-09-21

## Architecture Components

### 1. MCP Bridge Server (`mcp/index.js`)
- **Type**: Stdio-based MCP server (v0.8.0)
- **Tools**:
  - `execute_kip`: Execute KIP queries against Nexus backend
  - `ensure_kip_header`: Enforce KIP headers in CLAUDE.md files
- **Auto-Discovery**: Finds project root via .git/.claude markers
- **Communication**: HTTP POST to KIP Nexus with Bearer auth
- **Execution**: Direct stdio communication with Claude Code

### 2. KIP Nexus Server (`nexus/server.js`)
- **Type**: Express server with Neo4j graph backend
- **Port**: 8081 (configurable via PORT env)
- **Auth**: Bearer token authentication
- **Endpoints**:
  - `GET /.well-known/ai-plugin.json`: Service discovery
  - `POST /execute_kip`: Query execution endpoint (legacy)
  - `POST /kql`: KQL query execution (new)
  - `POST /propositions`: Proposition-based queries
- **Query Engine**:
  - Custom KQL parser (`kql-parser.js`)
  - Proposition handler for natural language
  - Legacy KIP syntax support

### 3. Neo4j Database
- **Version**: Neo4j 5.x
- **Ports**: 7474 (HTTP), 7687 (Bolt)
- **Storage**: Persistent volumes for data and logs
- **Health Check**: Cypher shell validation

### 4. Integration Layer
- **Install Script**: `scripts/install-kip-claude.sh` - Complete setup
- **Uninstall Script**: `scripts/uninstall-kip-claude.sh` - Clean removal
- **Command Patcher**: `scripts/patch_all_commands.sh` - Universal enforcement
- **Init Restorer**: `scripts/restore-kip-after-init.sh` - Auto-restoration
- **HTTP Wrappers**: kip-query, kip-upsert, kip-header commands

## Installation & Setup

### Quick Install (One-Line)
```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/kip/main/scripts/install-kip-claude.sh | bash
```

### Manual Installation
```bash
# Clone repository
git clone https://github.com/yourusername/kip.git /opt/projects/kip
cd /opt/projects/kip

# Run installer
bash scripts/install-kip-claude.sh

# Start services
docker compose up -d --build

# Verify installation
bash scripts/test_suite.sh
```

### Uninstall
```bash
bash /opt/projects/kip/scripts/uninstall-kip-claude.sh
```

## Commands & Usage

### KIP Query Commands (in Claude Code TUI)
```bash
/kip FIND Policy WHERE name='Password Rotation'  # Execute KIP query
/kip-q FIND * LIMIT 5                            # Quiet mode (JSON only)
/kip-now                                          # Set KIP reminder
/init                                             # Auto-restores KIP headers!
```

### Development Commands
```bash
# Service Management
docker compose up -d --build      # Start all services
docker compose down              # Stop services
docker compose logs -f           # View logs
bash scripts/restart.sh          # Restart services

# Testing
bash scripts/test_suite.sh       # Run complete test suite
bash scripts/test-http-wrappers.sh  # Test HTTP wrapper commands

# MCP Management
claude mcp list                  # List registered MCP servers
claude mcp unregister kip-mcp-bridge  # Unregister MCP

# Database Operations
bash scripts/seed.sh             # Seed sample data
```

## Environment Configuration

```bash
# KIP Server Settings
KIP_URL=http://localhost:8081/execute_kip  # KIP Nexus endpoint
KIP_TOKEN=changeme-kip-token               # Authentication token

# Neo4j Connection (for Nexus server)
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme-neo4j
PORT=8081  # Nexus server port
```

## KIP Query Language Reference

### KQL (KIP Query Language) - New Syntax
```cypher
# FIND operations
FIND Policy WHERE name = 'Password Rotation'
FIND Task WHERE status = 'pending' AND priority = 'high'
FIND <Label> WHERE field = 'exact-value'

# UPSERT operations
UPSERT Policy {name: 'Backup Policy', frequency: 'daily'}
UPSERT Task {name: 'Review Code', status: 'pending'}
UPSERT <Label> {name: 'value', field: 'value'}

# Natural Language Propositions
"Find all policies related to security"
"Show me pending tasks"
"Create a new backup policy"
```

### Non-Working Patterns (Avoid)
```cypher
# These patterns are NOT supported:
FIND * LIMIT 10              # Wildcard without WHERE
FIND Policy LIMIT 5          # Missing WHERE clause
FIND Policy WHERE name CONTAINS 'test'  # CONTAINS not working
```

## System Behavior & Patterns

### KIP Enforcement Flow
1. **Query Execution**: All operations via kip-query/kip-upsert HTTP wrappers
2. **Header Injection**: Auto-patches CLAUDE.md with enforcement rules
3. **Init Recovery**: `/init` automatically restores KIP headers
4. **Session Memory**: Persists across sessions via Neo4j
5. **Multi-syntax Support**: KQL, propositions, and legacy KIP queries

### File Organization
```
/opt/projects/kip/          # Main project directory
├── mcp/index.js           # MCP bridge implementation
├── nexus/server.js        # KIP Nexus server
├── scripts/               # Installation & management
├── docker-compose.yml     # Service orchestration
└── CLAUDE.md             # This file (auto-patched)

/opt/projects/kip-mcp/     # MCP installation directory
/opt/k3s/                  # Local registration scope
~/.claude/commands/        # Patched command definitions
~/.claude/backups/         # Command backup directory
```

### Critical Implementation Details

1. **Authentication**: Bearer token required for all Nexus operations
2. **Query Parser**: Custom regex-based parser in nexus/server.js
3. **MCP Tools**: execute_kip and ensure_kip_header via stdio transport
4. **Auto-Discovery**: Finds project root via .git/.claude markers
5. **Idempotent Scripts**: All installation scripts safe to re-run

## Development Notes

### Recent Updates (2025-09-21)
- KIP system fully operational with Neo4j backend
- MCP bridge server registered and active
- HTTP wrappers (kip-query, kip-upsert, kip-header) functioning
- Auto-restoration of KIP headers after `/init` commands working
- Support for KQL syntax, propositions, and legacy queries

### Known Issues & Solutions
- **FIND syntax**: Use exact equality (=) without spaces around operator
- **Query format**: Always include WHERE clause for FIND operations
- **Token auth**: Ensure KIP_TOKEN environment variable matches across services
