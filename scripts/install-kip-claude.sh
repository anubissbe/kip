#!/bin/bash
# KIP-Claude Integration Complete Installation Script
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}  KIP-Claude Integration Setup  ${NC}"
echo -e "${BLUE}================================${NC}"
echo

# Configuration
KIP_DIR="/opt/projects/kip"
KIP_MCP_DIR="/opt/projects/kip-mcp"
COMMANDS_DIR="$HOME/.claude/commands"
BACKUP_DIR="$HOME/.claude/backups/$(date +%Y%m%d_%H%M%S)"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}[1/9] Checking prerequisites...${NC}"

    # Check if running as non-root
    if [ "$EUID" -eq 0 ]; then
        echo -e "${RED}Error: Please run as non-root user${NC}"
        exit 1
    fi

    # Check required commands
    local missing=()
    for cmd in node npm docker docker-compose git claude; do
        if ! command -v $cmd >/dev/null 2>&1; then
            missing+=($cmd)
        fi
    done

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}Error: Missing required commands: ${missing[*]}${NC}"
        echo "Please install them before continuing."
        exit 1
    fi

    # Check Node.js version
    NODE_VERSION=$(node -v | sed 's/v//')
    if [ "$(printf '%s\n' "18.0.0" "$NODE_VERSION" | sort -V | head -n1)" != "18.0.0" ]; then
        echo -e "${RED}Error: Node.js 18+ required (found: $NODE_VERSION)${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ All prerequisites met${NC}"
}

# Setup directories
setup_directories() {
    echo -e "${YELLOW}[2/9] Setting up directories...${NC}"

    # Create project directories
    sudo mkdir -p /opt/projects
    sudo chown $USER:$USER /opt/projects

    # Create claude directories
    mkdir -p "$COMMANDS_DIR" "$BACKUP_DIR"

    echo -e "${GREEN}✓ Directories created${NC}"
}

# Install KIP repository
install_kip_repo() {
    echo -e "${YELLOW}[3/9] Installing KIP repository...${NC}"

    if [ ! -d "$KIP_DIR" ]; then
        # For now, we'll copy from the current location
        # In a real deployment, this would be: git clone <repo> "$KIP_DIR"
        if [ -d "/opt/projects/kip" ]; then
            echo -e "${GREEN}✓ KIP repository already present${NC}"
        else
            echo -e "${RED}Error: KIP repository not found${NC}"
            echo "Please ensure KIP repository is available at $KIP_DIR"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ KIP repository already installed${NC}"
    fi
}

# Install MCP Bridge
install_mcp_bridge() {
    echo -e "${YELLOW}[4/9] Installing MCP bridge...${NC}"

    # Create MCP directory
    sudo mkdir -p "$KIP_MCP_DIR"
    sudo chown $USER:$USER "$KIP_MCP_DIR"

    # Copy MCP files
    cp "$KIP_DIR/mcp/index.js" "$KIP_MCP_DIR/"
    cp "$KIP_DIR/mcp/run.sh" "$KIP_MCP_DIR/"
    chmod +x "$KIP_MCP_DIR/run.sh"

    # Install Node.js dependencies
    cd "$KIP_MCP_DIR"
    if [ ! -f "package.json" ]; then
        npm init -y >/dev/null 2>&1
    fi
    npm install @modelcontextprotocol/sdk node-fetch >/dev/null 2>&1

    echo -e "${GREEN}✓ MCP bridge installed${NC}"
}

# Start KIP services
start_kip_services() {
    echo -e "${YELLOW}[5/9] Starting KIP services...${NC}"

    cd "$KIP_DIR"

    # Copy environment file if it doesn't exist
    if [ ! -f ".env" ]; then
        cp .env.example .env
        echo -e "${YELLOW}  Created .env file from template${NC}"
    fi

    # Start services
    docker compose up -d >/dev/null 2>&1

    # Wait for services to be ready
    echo -e "${YELLOW}  Waiting for services to start...${NC}"
    sleep 15

    # Check if services are running
    if docker compose ps | grep -q "Up"; then
        echo -e "${GREEN}✓ KIP services started${NC}"
    else
        echo -e "${RED}Error: Failed to start KIP services${NC}"
        docker compose logs
        exit 1
    fi
}

# Register MCP server
register_mcp_server() {
    echo -e "${YELLOW}[6/9] Registering MCP server...${NC}"

    # Load environment
    cd "$KIP_DIR"
    set -a; source .env 2>/dev/null || true; set +a

    # Remove existing registration
    claude mcp remove kip -s user 2>/dev/null || true
    claude mcp remove kip -s local 2>/dev/null || true

    # Register at user scope
    claude mcp add kip --transport stdio --scope user "$KIP_MCP_DIR/run.sh" \
        --env KIP_URL=http://localhost:8081/execute_kip \
        --env KIP_TOKEN=${KIP_TOKEN:-changeme-kip-token} 2>/dev/null

    # Register at local scope (current directory)
    claude mcp add kip --transport stdio --scope local "$KIP_MCP_DIR/run.sh" \
        --env KIP_URL=http://localhost:8081/execute_kip \
        --env KIP_TOKEN=${KIP_TOKEN:-changeme-kip-token} 2>/dev/null

    # Verify registration
    if claude mcp list | grep -q "kip.*Connected"; then
        echo -e "${GREEN}✓ MCP server registered and connected${NC}"
    else
        echo -e "${RED}Error: MCP server registration failed${NC}"
        exit 1
    fi
}

# Backup existing commands
backup_commands() {
    echo -e "${YELLOW}[7/9] Backing up existing commands...${NC}"

    if [ -d "$COMMANDS_DIR" ]; then
        rsync -av "$COMMANDS_DIR/" "$BACKUP_DIR/" >/dev/null 2>&1
        echo -e "${GREEN}✓ Commands backed up to: $BACKUP_DIR${NC}"
    else
        echo -e "${GREEN}✓ No existing commands to backup${NC}"
    fi
}

# Install command enhancements
install_command_enhancements() {
    echo -e "${YELLOW}[8/9] Installing command enhancements...${NC}"

    cd "$KIP_DIR"
    bash scripts/patch_all_commands.sh | grep -E "(✓|processed|modified)" || true

    echo -e "${GREEN}✓ Command enhancements installed${NC}"
}

# Test installation
test_installation() {
    echo -e "${YELLOW}[9/9] Testing installation...${NC}"

    # Test MCP connection
    if claude mcp list | grep -q "kip.*Connected"; then
        echo -e "${GREEN}✓ MCP connection working${NC}"
    else
        echo -e "${RED}✗ MCP connection failed${NC}"
        return 1
    fi

    # Test KIP server
    cd "$KIP_DIR"
    set -a; source .env 2>/dev/null || true; set +a
    local response
    response=$(curl -s -X POST \
        -H "Authorization: Bearer ${KIP_TOKEN:-changeme-kip-token}" \
        -H "Content-Type: application/json" \
        http://localhost:8081/execute_kip \
        -d '{"query":"FIND Policy WHERE name = '\''Password Rotation'\''"}' 2>/dev/null || echo "failed")

    if echo "$response" | grep -q '"ok":\s*true'; then
        echo -e "${GREEN}✓ KIP server responding${NC}"
    else
        echo -e "${YELLOW}⚠ KIP server test failed (may need seeding)${NC}"
    fi

    # Test command files
    local enhanced_files
    enhanced_files=$(find "$COMMANDS_DIR" -name "*.md" -exec grep -l "KIP-ENFORCEMENT-START" {} \; 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ Enhanced $enhanced_files command files${NC}"

    echo -e "${GREEN}✓ Installation test completed${NC}"
}

# Generate summary
generate_summary() {
    echo
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}     Installation Complete!     ${NC}"
    echo -e "${BLUE}================================${NC}"
    echo
    echo -e "${GREEN}✅ KIP-Claude integration successfully installed${NC}"
    echo
    echo "📊 Summary:"
    echo "  • KIP repository: $KIP_DIR"
    echo "  • MCP bridge: $KIP_MCP_DIR"
    echo "  • Commands backup: $BACKUP_DIR"
    echo "  • Enhanced commands: $(find "$COMMANDS_DIR" -name "*.md" -exec grep -l "KIP-ENFORCEMENT-START" {} \; 2>/dev/null | wc -l) files"
    echo
    echo "🚀 Quick Test Commands:"
    echo "  claude /kip-q FIND Policy WHERE name='Password Rotation'"
    echo "  claude /kip-now"
    echo "  claude /init    # Auto-restores KIP headers"
    echo
    echo "📚 Documentation:"
    echo "  Full docs: $KIP_DIR/docs/KIP-CLAUDE-INTEGRATION.md"
    echo "  Troubleshooting: bash $KIP_DIR/scripts/test_suite.sh"
    echo
    echo "🔧 Management Commands:"
    echo "  Uninstall: bash $KIP_DIR/scripts/uninstall-kip-claude.sh"
    echo "  Logs: docker compose -f $KIP_DIR/docker-compose.yml logs"
    echo "  Status: docker compose -f $KIP_DIR/docker-compose.yml ps"
    echo
    echo -e "${GREEN}Happy KIP-enhanced coding! 🎉${NC}"
}

# Main execution
main() {
    check_prerequisites
    setup_directories
    install_kip_repo
    install_mcp_bridge
    start_kip_services
    register_mcp_server
    backup_commands
    install_command_enhancements
    test_installation
    generate_summary
}

# Error handling
trap 'echo -e "${RED}Installation failed! Check errors above.${NC}"' ERR

# Run main function
main "$@"