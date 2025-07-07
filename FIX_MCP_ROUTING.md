# MCP Tool Routing Fix

## Problem Identified

The MCP server's `isGCPTool()` function doesn't recognize Claude's `mcp__gcp__` prefixed tools:

```javascript
// Current broken flow:
Claude sends: "mcp__gcp__gcp-sql"
Server checks: isGCPTool("mcp__gcp__gcp-sql") // returns false
Result: Bypasses AI predictions, goes to default handler
```

## Required Fix

Update the `isGCPTool` function in `/src/tools/gcp-tools.ts`:

```typescript
// Original (broken):
export function isGCPTool(toolName: string): boolean {
  return GCP_TOOLS.some(tool => tool.name === toolName);
}

// Fixed version:
export function isGCPTool(toolName: string): boolean {
  // Handle both direct names and MCP-prefixed names
  const normalizedName = toolName.replace(/^mcp__gcp__/, '');
  return GCP_TOOLS.some(tool => tool.name === normalizedName);
}
```

Also update tool name conversion:

```typescript
// Add new function to normalize tool names
export function normalizeMCPToolName(toolName: string): string {
  return toolName.replace(/^mcp__gcp__/, '');
}
```

And update the handler in `index.ts`:

```typescript
// In handleGCPTool method:
const normalizedToolName = normalizeMCPToolName(toolName);
const backendToolName = convertToolNameForBackend(normalizedToolName);
```

## Impact of Fix

Once fixed, the system will:
1. ✅ Intercept Claude's MCP tool calls
2. ✅ Run AI predictions (<5ms)
3. ✅ Provide cost warnings before execution
4. ✅ Block dangerous queries
5. ✅ Deliver the promised 73% accuracy

## Testing the Fix

After implementing:
```bash
# Run the agent test again
node tests/agent-test-scenarios.js

# Expected results:
- Syntax errors: Blocked before execution
- Cost warnings: "$500 query detected, add LIMIT?"
- Response time: <5ms (not 200-500ms)
```

## Business Impact

Without this fix:
- System provides 0% of advertised value
- Acts as expensive BigQuery proxy
- No cost protection
- No time savings

With this fix:
- Full AI-powered predictions
- 73% accuracy as designed
- <5ms response times
- Actual ROI delivery