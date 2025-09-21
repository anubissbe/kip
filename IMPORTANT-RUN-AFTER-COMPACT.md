# ⚠️ CRITICAL: RUN THESE COMMANDS AFTER CONTEXT COMPACT ⚠️

After ANY of these events:
- Context compact
- Session restart
- `/init` command
- New conversation

**YOU MUST RUN THESE COMMANDS:**

```bash
# 1. Restore KIP enforcement
kip-enforce

# 2. Check KIP is working
kip-query "FIND KIPReminder WHERE name = 'ENFORCE_KIP_RULES'"

# 3. Read enforcement file
cat /opt/projects/kip/KIP-ENFORCEMENT-ACTIVE.txt

# 4. Re-read CLAUDE.md
cat /opt/projects/kip/CLAUDE.md | head -30
```

## Why This Is Critical

Without running these commands, you will:
- ❌ Forget to use KIP
- ❌ Lose all context between sessions
- ❌ Not persist any information
- ❌ Violate the project's core requirements

## Quick Test

Run this to verify KIP is working:
```bash
kip-query "FIND Project WHERE name = 'KIP Implementation'"
```

Should return the KIP project with 98.47% compliance.