---
name: mcp-construction
description: 'Use when designing or building an MCP (Model Context Protocol) server — tool design, scaffolding, testing, verification.'
tools: [Read, Write, Edit, Bash, Grep, Glob]
x-anvil:
  kind: atomic
  group: development
  trigger: [build mcp, create mcp, mcp server, model context protocol, mcp tool]
  language: universal
  tags: [mcp, server, tools, integration]
  aliases: [mcp-server-builder, mcp-scaffolder]
---

> **Invoke via `Skill({skill: "anvil:mcp-construction"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# MCP Builder

**Announce:** I'm using the mcp-builder skill to design and implement an MCP server — tool design, scaffolding, implementation, and verification.

Design and build Model Context Protocol (MCP) servers. Guides tool design, scaffolds the server structure, implements tools, and verifies the result.

## Design Principles

1. **Workflow tools, not API mirrors** — Each MCP tool should represent a meaningful user workflow, not a 1:1 API endpoint wrapper. A good tool combines multiple API calls into one high-level operation.

2. **Minimal surface area** — Start with 3-5 tools. Users can always ask for more. Too many tools confuse the model's tool selection.

3. **Descriptive names and schemas** — Tool names should be verb-noun (`search-issues`, `create-branch`). Parameter descriptions should explain what values are valid, not just the type.

4. **Fail loudly** — Return structured errors with actionable messages. Never swallow errors silently.

5. **Stateless by default** — Each tool call should be self-contained. If state is needed, use resources (not tool-side caching).

## Process

1. **Scope** — What system/API does this MCP server connect to? What are the 3-5 most valuable operations a user would want?

2. **Design tools** — For each operation:
   - Name: `verb-noun` format
   - Description: One sentence explaining what it does and when to use it
   - Input schema: JSON Schema with required/optional fields, descriptions, defaults
   - Output: What the tool returns on success and failure
   - Example: One concrete input/output pair

3. **Scaffold** — Create the project structure:
   ```
   mcp-server-<name>/
   ├── package.json
   ├── tsconfig.json
   ├── src/
   │   ├── index.ts
   │   ├── tools/
   │   │   ├── <tool-a>.ts
   │   │   └── <tool-b>.ts
   │   └── lib/
   │       └── client.ts
   └── tests/
       └── tools/
           ├── <tool-a>.test.ts
           └── <tool-b>.test.ts
   ```

4. **Implement** — Build each tool following TDD:
   - Write a test with a mocked API response
   - Implement the tool handler
   - Verify the test passes
   - Add error handling test

5. **Wire up** — Register all tools in index.ts with the MCP SDK:
   ```typescript
   import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
   const server = new McpServer({ name: 'my-server', version: '1.0.0' })
   server.tool('tool-name', 'description', schema, handler)
   ```

6. **Verify** — Run the verification checklist (below).

## Verification Checklist

Before marking the MCP server as complete:

- [ ] All tools have descriptive names (verb-noun format)
- [ ] All input schemas have field descriptions
- [ ] All tools handle errors and return structured error messages
- [ ] All tools have at least one passing test
- [ ] Server starts without errors: `npx tsx src/index.ts`
- [ ] Each tool can be invoked via MCP Inspector or test client
- [ ] README.md documents: purpose, setup, available tools, configuration

## Anti-Patterns

- **API mirroring**: Wrapping every REST endpoint as a separate tool. Combine related operations.
- **Missing descriptions**: Tools without descriptions confuse the model. Every field needs one.
- **Swallowed errors**: Catching errors and returning empty results. Always surface the error.
- **Stateful tools**: Tools that depend on previous calls. Each call should be self-contained.
- **Kitchen sink**: Shipping 20+ tools. Start small, expand based on actual usage.
