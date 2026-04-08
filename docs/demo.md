# Demo

Visual demonstrations of the RemNote MCP Server with different AI clients.

## ChatGPT

Web-based integration using ChatGPT Apps with a custom MCP server.

**Setup:** [ChatGPT Configuration Guide](guides/configuration-chatgpt.md)

### 1) MCP status preflight

![ChatGPT MCP Status Check](images/remnote-mcp-server-demo-chatgpt-status-check.jpg)

ChatGPT calls `remnote_status` and reports connection, version alignment, and write/replace policy flags.

### 2) Notes-only synthesis

![ChatGPT Notes Summary](images/remnote-mcp-server-demo-chatgpt-notes-summary.jpg)

ChatGPT summarizes circadian-rhythm notes using MCP-retrieved RemNote content (notes-first synthesis).

### 3) Follow-up contradiction request

![ChatGPT Follow-up Diff Request](images/remnote-mcp-server-demo-chatgpt-followup-diff-request.jpg)

The user asks for a short comparison of notes vs. current internet knowledge, focused on differences/contradictions.

### 4) Notes vs internet diff output

![ChatGPT Notes vs Internet Diff](images/remnote-mcp-server-demo-chatgpt-notes-vs-internet-diff.jpg)

ChatGPT returns a concise mismatch list, preserving note-grounded context while highlighting conflicts.

PS: I first treated the "take melatonin ~7 hours before sleep" claim as a model error/hallucination. In the next
answer, ChatGPT quoted my actual note and context ("Take melatonin 9 hours after wake and 7 before sleep, eg 5 PM" for
delayed phase sleep disorder), so this was still a distortion, but not fully made up.

## Claude Desktop / Cowork

Cloud-based integration through Anthropic's remote connector interface in Claude Desktop or Cowork.

**Setup:** [Claude Desktop / Cowork Configuration Guide](guides/configuration-claude-desktop-cowork.md) | [Remote Access Guide](guides/remote-access.md)

### Connection Status Check

![RemNote MCP Server Status (Claude Cowork)](images/remnote-mcp-server-demo-claude-cowork1.jpg)

Checking RemNote Bridge connection status, displaying plugin version (0.4.1) and available features (search, create,
read, update, journal append).

### Knowledge Base Search

![RemNote Search (Claude Cowork)](images/remnote-mcp-server-demo-claude-cowork2.jpg)

Searching RemNote knowledge base for "blue light & sleep" with AI-generated summary. The RemNote Automation Bridge
plugin panel (right side) shows connection statistics and recent actions.

### Claude Desktop Search View

![RemNote Search (Claude Desktop / Cowork)](images/remnote-mcp-server-demo-claude-desktop-cowork-search.jpg)

Claude Desktop using the same remote connector to search RemNote for "blue light & sleep", returning the matching
notes and their key context directly in chat.

## Accomplish

Task-based interface using [Accomplish (formerly Openwork)](https://github.com/accomplish-ai/accomplish) with [OpenAI's
GPT 5.2 model](https://openai.com/).

**Setup:** [Accomplish Configuration Guide](guides/configuration-accomplish.md)

![RemNote Search via Accomplish (GPT 5.2)](images/remnote-mcp-server-demo-accomplish-with-gpt52.jpg)

The screenshot shows Accomplish querying RemNote about "diffusion of innovations" through the local MCP server. The
interface displays multiple MCP tool calls (`remnote_search` and `remnote_read_note`) with an AI-synthesized summary
of findings from the knowledge base.

## Claude Code CLI 

Local CLI-based integration showing search and connection logs.

**Setup:** [Claude Code CLI Configuration Guide](guides/configuration-claude-code-CLI.md)

![RemNote MCP Server Demo (Claude Code CLI)](images/remnote-mcp-server-demo-claude-code-CLI.jpg)

The screenshot shows Claude Code CLI searching RemNote for "AI assisted coding" through the terminal, with RemNote Bridge
connection logs visible in the background.
