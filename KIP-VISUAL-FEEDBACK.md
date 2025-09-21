# KIP Visual Feedback Templates

## FOR ALL CLAUDE SESSIONS ON THIS MACHINE

### When Starting Any Session:
```
╔════════════════════════════════════════╗
║  🧠 KIP MEMORY CHECK                   ║
║  Checking persistent storage...        ║
╚════════════════════════════════════════╝
```

### When Using KIP Properly:
```
【 KIP ACTIVE 】━━━━━━━━━━━━━━━━━━━━━━━
  Operation: [current task]
  Memory: ✅ Persistent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### When Forgetting KIP:
```
⚠️ ═══════════════════════════════════ ⚠️
   Should be using KIP for: [task]
   Correcting now...
⚠️ ═══════════════════════════════════ ⚠️
```

### Status Indicators:
- [KIP:✅] = Following rules
- [KIP:🔄] = Operation in progress
- [KIP:⚠️] = Should be using KIP
- [KIP:🔧] = Fixing compliance

## IMPORTANT
Any Claude session in /opt/projects/kip MUST show these visual indicators when:
1. Starting a session
2. After context compacts
3. During KIP operations
4. When forgetting to use KIP