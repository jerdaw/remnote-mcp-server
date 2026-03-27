# Integration Testing

The integration test suite validates the full MCP server chain end-to-end against a live RemNote instance. Unlike the
unit tests (which mock the WebSocket bridge), these tests send real MCP tool calls through the running server to RemNote
and verify the responses.

## Prerequisites

1. RemNote running with the RemNote Automation Bridge plugin installed and connected
2. MCP server running (`npm run dev` or `npm start`)
3. Plugin connected to the WebSocket server (check server logs for connection message)

## Running

```bash
# Interactive — prompts before creating content
npm run test:integration

# Non-interactive — skips confirmation
npm run test:integration -- --yes

# Fast connection check only (no test data creation)
./run-status-check.sh
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `REMNOTE_MCP_URL` | `http://127.0.0.1:3001` | MCP server base URL |
| `MCP_TEST_DELAY` | `2000` | Delay (ms) after creating notes before searching |

## What It Tests

The suite runs six sequential workflows:

1. **Status Check** — Verifies the server reports a connected plugin. If this fails, all subsequent workflows are
   skipped since there's no point testing tools without a live connection.
2. **Create & Search** — Creates two notes (simple and rich with content/tags), waits for RemNote indexing, then
   validates both `remnote_search` and `remnote_search_by_tag` across `includeContent` modes (`markdown`,
   `structured`, `none`).
3. **Read & Update** — Reads the created notes, updates title/content/tags, and re-reads to verify persistence.
4. **Journal** — Appends entries to today's daily document with and without timestamps.
5. **Error Cases** — Sends invalid inputs (nonexistent IDs, missing required fields) and verifies the server handles
   them gracefully.
6. **Read Table** — Reads a pre-configured Advanced Table by name and/or Rem ID, then validates pagination, filtering,
   and not-found behavior.

## Test Artifacts

All test content is prefixed with `[MCP-TEST]` followed by a unique run ID (ISO timestamp), and is created under the
shared root-level anchor note `RemNote Automation Bridge [temporary integration test data]`.

Anchor resolution is deterministic:
1. multi-query `remnote_search` lookup + exact title match (trim/whitespace normalized),
2. fallback `remnote_search_by_tag` lookup using the dedicated anchor tag `remnote-integration-root-anchor`,
3. create anchor note only if both lookups fail.

When reusing a title-only hit, integration setup backfills the anchor tag for future deterministic lookup.

Uniqueness is enforced: if more than one exact anchor-title match exists, the integration run fails immediately and
prints duplicate `remId`s so you can clean up test data in RemNote.

RemNote's bridge plugin does not support deleting notes, so test artifacts persist and must be cleaned up manually.

To clean up: search your RemNote knowledge base for `[MCP-TEST]` and delete the matching notes.

## Design Rationale

The integration tests are deliberately separate from the unit test suite. They require external infrastructure (running
server + connected plugin), create real content, and take seconds rather than milliseconds. They run via `tsx` with
custom lightweight assertions — no vitest dependency — to keep them independent of the mocked test environment.

---

## Testing read_table

The read_table integration test (workflow 06) requires an Advanced Table in RemNote to be pre-configured. This allows
testing the table reading functionality without needing write operations.

### Setup

1. Create an Advanced Table in RemNote with some data (at least one column and one row)
2. Find the table's exact name and, if possible, its `remId` (for deterministic ID-lookup coverage)
3. Create or edit the config file at:

   **Windows:** `C:\Users\<your-username>\.remnote-mcp-bridge\remnote-mcp-bridge.json`

   **macOS/Linux:** `~/.remnote-mcp-bridge/remnote-mcp-bridge.json`

4. Add the integration test configuration:

```json
{
  "integrationTest": {
    "tableName": "Your Table Name",
    "tableRemId": "abc123def"
  }
}
```

`tableNameOrId` is still accepted as a backward-compatible fallback, but `tableName` + `tableRemId` gives the best
coverage.

### Running

After setting up the config, run the integration tests as usual:

```bash
npm run test:integration
```

The read_table workflow is skipped when the table config is missing or invalid.
