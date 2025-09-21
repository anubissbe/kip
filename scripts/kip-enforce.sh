#!/bin/bash
# KIP Enforcement Script - Ensures KIP rules survive context compacts

# Store enforcement reminder in KIP
kip-query "UPSERT KIPReminder {name: 'ENFORCE_KIP_RULES', message: 'You MUST follow KIP rules in CLAUDE.md', timestamp: '$(date -Iseconds)'}" > /dev/null 2>&1

# Create prominent reminder file with visual feedback requirements
cat > /opt/projects/kip/KIP-ENFORCEMENT-ACTIVE.txt << 'EOF'
════════════════════════════════════════════════════════════════
⚠️  KIP ENFORCEMENT IS ACTIVE - YOU MUST FOLLOW THESE RULES  ⚠️
════════════════════════════════════════════════════════════════

1. ALWAYS make KIP calls for non-trivial tasks
2. NEVER provide answers without checking KIP first
3. Follow pattern: KIP_PLAN → KIP_CALLS → FINAL_ANSWER
4. After ANY context compact, immediately run: kip-enforce
5. Check CLAUDE.md for full rules
6. SHOW VISUAL FEEDBACK when using KIP:

   【 KIP ACTIVE 】━━━━━━━━━━━━━━━━━━━━━━━
     Status: [current operation]
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THIS IS NOT OPTIONAL - KIP IS YOUR MEMORY SYSTEM
════════════════════════════════════════════════════════════════
EOF

# Show visual feedback
echo "╔════════════════════════════════════════════╗"
echo "║  🔒 KIP ENFORCEMENT ACTIVATED              ║"
echo "║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ║"
echo "║  ✓ KIP rules loaded                       ║"
echo "║  ✓ Visual feedback enabled                ║"
echo "║  ✓ Memory persistence active              ║"
echo "╚════════════════════════════════════════════╝"