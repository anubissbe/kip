#!/bin/bash
# Add KIP reminder to bash prompt

# Add to .bashrc if not already present
if ! grep -q "KIP_REMINDER" ~/.bashrc 2>/dev/null; then
    echo '# KIP_REMINDER - Forces Claude to remember KIP rules' >> ~/.bashrc
    echo 'export PS1="[KIP-ACTIVE] $PS1"' >> ~/.bashrc
    echo 'echo "⚠️  KIP Enforcement Active: Run kip-enforce after context compact"' >> ~/.bashrc
fi

# Create a visible marker file
echo "KIP ENFORCEMENT ACTIVE - $(date)" > /opt/projects/kip/KIP-STATUS.txt

echo "✅ KIP prompt reminder configured"