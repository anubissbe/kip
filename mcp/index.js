import fetch from "node-fetch";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";

const KIP_URL   = process.env.KIP_URL   || "http://localhost:8081/execute_kip";
const KQL_URL   = process.env.KQL_URL   || "http://localhost:8081/kql";
const KIP_TOKEN = process.env.KIP_TOKEN || "changeme-kip-token";

async function exists(p){ try{ await fs.access(p); return true; }catch{ return false; } }
async function findRepoRoot(startDir){
  let dir = path.resolve(startDir);
  for (let i=0;i<10;i++){
    if (await exists(path.join(dir, ".git")) || await exists(path.join(dir, ".claude"))) return dir;
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  return null;
}
async function resolveClaudeMd({ explicitFile, explicitDir }){
  if (explicitFile) return path.resolve(explicitFile);
  if (explicitDir)  return path.resolve(explicitDir, "CLAUDE.md");
  const cwd = process.cwd();
  const fCwd = path.join(cwd, "CLAUDE.md");
  if (await exists(fCwd)) return fCwd;
  const proj = process.env.PROJECT_DIR; if (proj) return path.resolve(proj, "CLAUDE.md");
  const root = await findRepoRoot(cwd); if (root) return path.join(root, "CLAUDE.md");
  return fCwd;
}

const server = new Server(
  { name: "kip-mcp-bridge", version: "0.8.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

/* ===== TOOLS ===== */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_kip",
      description: "Run a KIP query (FIND/UPSERT/DELETE...) against KIP Nexus (legacy).",
      input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    },
    {
      name: "execute_kql",
      description: "Execute KQL query with full ldclabs/KIP protocol support (preferred).",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: { type: "string", enum: ["kql", "legacy"], default: "kql" }
        },
        required: ["query"]
      }
    },
    {
      name: "ensure_kip_header",
      description: "Ensure nearest CLAUDE.md has the KIP enforcement header and emit a reminder.",
      input_schema: { type: "object", properties: {
        file: { type:"string" },
        target_dir: { type:"string" }
      }, additionalProperties: false }
    }
  ]
}));

async function ensureHeaderAtFile(targetFile){
  const START = "<!-- KIP-HEADER START -->";
  const END   = "<!-- KIP-HEADER END -->";
  const HEADER = `${START}

## KIP Enforcement (project policy)

**Role**: Assistant with persistent memory via KIP.

**Rules**:
1) Always use the MCP tool \`execute_kip\` for any knowledge read/write (FIND/UPSERT/DELETE/...).
2) Do **not** produce a FINAL ANSWER unless at least one \`execute_kip\` call has been made (except trivial small-talk/formatting).
3) Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.

**After compaction**: After any \`/compact\` or auto-compact, call \`ensure_kip_header\` again.

${END}
`;

  const REMINDER = `SYSTEM REMINDER:
Always use "execute_kip" for knowledge read/write; no FINAL ANSWER without at least one "execute_kip" call.`;

  let current = "";
  if (await exists(targetFile)) current = await fs.readFile(targetFile, "utf8");
  else await fs.mkdir(path.dirname(targetFile), { recursive: true });

  const blockRe = new RegExp(`${START}[\s\S]*?${END}\n?`);
  const updated = blockRe.test(current) ? current.replace(blockRe, HEADER) : (HEADER + (current || ""));
  if (updated !== current) await fs.writeFile(targetFile, updated, "utf8");

  return {
    content: [
      { type: "text", text: `Target file: ${targetFile}` },
      { type: "text", text: updated === current ? "KIP header already present." : "KIP header ensured." },
      { type: "text", text: REMINDER }
    ]
  };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "ensure_kip_header") {
    const targetFile = await resolveClaudeMd({ explicitFile: args?.file, explicitDir: args?.target_dir });
    return await ensureHeaderAtFile(targetFile);
  }

  if (name === "execute_kip") {
    const query = (args && typeof args.query === "string") ? args.query : "";
    if (!query) return { content: [{ type: "text", text: "Error: 'query' is required." }] };
    try {
      const r = await fetch(KIP_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${KIP_TOKEN}` },
        body: JSON.stringify({ query })
      });
      const raw = await r.text();
      let json; try { json = JSON.parse(raw); } catch { json = { ok:false, raw }; }
      return { content: [{ type: "text", text: JSON.stringify(json) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Request failed: ${String(e)}` }] };
    }
  }

  if (name === "execute_kql") {
    const query = (args && typeof args.query === "string") ? args.query : "";
    const mode = (args && typeof args.mode === "string") ? args.mode : "kql";
    if (!query) return { content: [{ type: "text", text: "Error: 'query' is required." }] };

    // Use KQL endpoint for new syntax, legacy for old
    const endpoint = mode === "legacy" ? KIP_URL : KQL_URL;

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${KIP_TOKEN}` },
        body: JSON.stringify({ query })
      });
      const raw = await r.text();
      let json; try { json = JSON.parse(raw); } catch { json = { ok:false, raw }; }
      return { content: [{ type: "text", text: JSON.stringify(json) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Request failed: ${String(e)}` }] };
    }
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

/* ===== PROMPTS (MCP slashes) ===== */
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    { name: "ensure_kip_header", description: "Ensure nearest CLAUDE.md has the KIP header and emit a reminder, then stop." },
    { name: "run_kip", description: "Run a KIP query: `/mcp__kip__run_kip <query>`" }
  ]
}));

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  const { name } = req.params;
  if (name === "ensure_kip_header") {
    return {
      description: "Call ensure_kip_header tool and stop.",
      messages: [
        { role: "user", content: { type: "text", text: "Call the MCP tool `ensure_kip_header` now. Then stop and reply only with: KIP_HEADER_DONE." } }
      ]
    };
  }
  if (name === "run_kip") {
    const args = req.params?.arguments;
    let query = "";
    if (typeof args === "string") query = args.trim();
    else if (args && typeof args.query === "string") query = args.query;
    if (!query) query = "FIND Policy WHERE name='Password Rotation'";
    const esc = query.replace(/`/g, "\`").replace(/"/g, '\"');
    return {
      description: "Call execute_kip with the provided query and return raw JSON.",
      messages: [
        { role: "user", content: { type: "text", text:
`Call the MCP tool "execute_kip" with: { "query": "${esc}" }.
Then STOP and reply only with:
KIP_RUN_DONE
<RAW_JSON_RESULT>` } }
      ]
    };
  }
  return { description: "Unknown prompt", messages: [] };
});

await server.connect(new StdioServerTransport());
