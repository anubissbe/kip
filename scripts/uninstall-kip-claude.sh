#!/bin/bash
# KIP-Claude Integration Complete Uninstall Script
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================${NC}"
echo -e "${BLUE}  KIP-Claude Integration Removal  ${NC}"
echo -e "${BLUE}===================================${NC}"
echo

# Configuration
KIP_DIR="/opt/projects/kip"
KIP_MCP_DIR="/opt/projects/kip-mcp"
COMMANDS_DIR="$HOME/.claude/commands"

# Confirmation prompt
confirm_removal() {
    echo -e "${YELLOW}This will completely remove KIP-Claude integration:${NC}"
    echo "  • Stop and remove KIP services"
    echo "  • Unregister MCP server"
    echo "  • Remove command enhancements"
    echo "  • Delete KIP directories"
    echo
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Removal cancelled${NC}"
        exit 0
    fi
}

# Stop KIP services
stop_services() {
    echo -e "${YELLOW}[1/6] Stopping KIP services...${NC}"

    if [ -d "$KIP_DIR" ]; then
        cd "$KIP_DIR"
        docker compose down -v 2>/dev/null || true
        echo -e "${GREEN}✓ KIP services stopped${NC}"
    else
        echo -e "${GREEN}✓ KIP directory not found (already removed)${NC}"
    fi
}

# Unregister MCP server
unregister_mcp() {
    echo -e "${YELLOW}[2/6] Unregistering MCP server...${NC}"

    claude mcp remove kip -s user 2>/dev/null || true
    claude mcp remove kip -s local 2>/dev/null || true

    if claude mcp list | grep -q "kip"; then
        echo -e "${YELLOW}⚠ Some KIP MCP registrations may still exist${NC}"
    else
        echo -e "${GREEN}✓ MCP server unregistered${NC}"
    fi
}

# Remove command enhancements
remove_command_enhancements() {
    echo -e "${YELLOW}[3/6] Removing command enhancements...${NC}"

    if [ ! -d "$COMMANDS_DIR" ]; then
        echo -e "${GREEN}✓ No commands directory found${NC}"
        return
    fi

    local count=0

    # Remove KIP-specific command files
    for file in kip.md kip-q.md kip-now.md superclaude-kip.md init.md; do
        if [ -f "$COMMANDS_DIR/$file" ]; then
            rm -f "$COMMANDS_DIR/$file"
            ((count++))
        fi
    done

    # Remove KIP headers from remaining command files
    find "$COMMANDS_DIR" -name "*.md" -type f | while read -r file; do
        if grep -q "KIP-ENFORCEMENT-START" "$file" 2>/dev/null; then
            # Remove KIP enforcement block
            sed -i '/<!-- KIP-ENFORCEMENT-START -->/,/<!-- KIP-ENFORCEMENT-END -->/d' "$file"
            # Remove KIP query shapes block
            sed -i '/<!-- KIP-QUERY-SHAPES-START -->/,/<!-- KIP-QUERY-SHAPES-END -->/d' "$file"
            # Remove empty lines at the beginning
            sed -i '/./,$!d' "$file"
            ((count++))
        fi
    done

    echo -e "${GREEN}✓ Removed enhancements from $count files${NC}"
}

# Remove KIP directories
remove_directories() {
    echo -e "${YELLOW}[4/6] Removing KIP directories...${NC}"

    # Remove KIP MCP directory
    if [ -d "$KIP_MCP_DIR" ]; then
        sudo rm -rf "$KIP_MCP_DIR"
        echo -e "${GREEN}✓ Removed $KIP_MCP_DIR${NC}"
    fi

    # Ask about removing main KIP directory
    if [ -d "$KIP_DIR" ]; then
        echo
        read -p "Remove main KIP directory ($KIP_DIR)? This contains all KIP data! (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo rm -rf "$KIP_DIR"
            echo -e "${GREEN}✓ Removed $KIP_DIR${NC}"
        else
            echo -e "${YELLOW}⚠ Kept $KIP_DIR${NC}"
        fi
    fi
}

# Clean Docker resources
clean_docker() {
    echo -e "${YELLOW}[5/6] Cleaning Docker resources...${NC}"

    # Remove KIP-related Docker containers and networks
    docker ps -a --filter "name=kip" --format "{{.Names}}" | while read -r container; do
        if [ -n "$container" ]; then
            docker rm -f "$container" 2>/dev/null || true
        fi
    done

    # Remove KIP-related Docker images (optional)
    read -p "Remove KIP Docker images? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker images --filter "reference=*kip*" --format "{{.Repository}}:{{.Tag}}" | while read -r image; do
            if [ -n "$image" ]; then
                docker rmi "$image" 2>/dev/null || true
            fi
        done
        echo -e "${GREEN}✓ Docker images removed${NC}"
    else
        echo -e "${GREEN}✓ Docker images kept${NC}"
    fi
}

# Verify removal
verify_removal() {
    echo -e "${YELLOW}[6/6] Verifying removal...${NC}"

    local issues=0

    # Check MCP registration
    if claude mcp list | grep -q "kip"; then
        echo -e "${YELLOW}⚠ KIP MCP server still registered${NC}"
        ((issues++))
    fi

    # Check directories
    if [ -d "$KIP_MCP_DIR" ]; then
        echo -e "${YELLOW}⚠ KIP MCP directory still exists: $KIP_MCP_DIR${NC}"
        ((issues++))
    fi

    # Check command files
    local remaining
    remaining=$(find "$COMMANDS_DIR" -name "*.md" -exec grep -l "KIP-ENFORCEMENT" {} \; 2>/dev/null | wc -l)
    if [ "$remaining" -gt 0 ]; then
        echo -e "${YELLOW}⚠ $remaining command files still have KIP enhancements${NC}"
        ((issues++))
    fi

    # Check Docker containers
    local containers
    containers=$(docker ps -a --filter "name=kip" --format "{{.Names}}" | wc -l)
    if [ "$containers" -gt 0 ]; then
        echo -e "${YELLOW}⚠ $containers KIP Docker containers still exist${NC}"
        ((issues++))
    fi

    if [ "$issues" -eq 0 ]; then
        echo -e "${GREEN}✓ Clean removal verified${NC}"
    else
        echo -e "${YELLOW}⚠ $issues issues found (see above)${NC}"
    fi
}

# Generate summary
generate_summary() {
    echo
    echo -e "${BLUE}===================================${NC}"
    echo -e "${BLUE}      Removal Complete!           ${NC}"
    echo -e "${BLUE}===================================${NC}"
    echo
    echo -e "${GREEN}✅ KIP-Claude integration removed${NC}"
    echo
    echo "📊 Summary:"
    echo "  • KIP services stopped"
    echo "  • MCP server unregistered"
    echo "  • Command enhancements removed"
    echo "  • Directories cleaned"
    echo
    echo "📚 Restoration:"
    echo "  To restore from backup:"
    echo "    ls ~/.claude/backups/  # Find your backup"
    echo "    rsync -av ~/.claude/backups/YYYYMMDD_HHMMSS/ ~/.claude/commands/"
    echo
    echo "  To reinstall KIP:"
    echo "    curl -fsSL <install-script-url> | bash"
    echo
    echo -e "${GREEN}System restored to pre-KIP state! 🧹${NC}"
}

# Main execution
main() {
    confirm_removal
    stop_services
    unregister_mcp
    remove_command_enhancements
    remove_directories
    clean_docker
    verify_removal
    generate_summary
}

# Error handling
trap 'echo -e "${RED}Removal failed! Check errors above.${NC}"' ERR

# Run main function
main "$@"