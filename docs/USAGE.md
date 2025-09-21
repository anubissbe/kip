# Quick Start

```bash
unzip kip-suite-update.zip -d /tmp/kip-suite-update
cd /tmp/kip-suite-update

# 1) Install MCP server (Node ≥ 18)
npm -v >/dev/null || (echo "Node/npm required" && exit 1)

# 2) Register MCP (user + local /opt/k3s)
bash scripts/register_mcp.sh

# 3) Patch *all* custom commands (Serena/SuperClaude) to follow KIP
bash scripts/patch_superclaude.sh

# 4) Run sanity tests
bash scripts/test_suite.sh
```
