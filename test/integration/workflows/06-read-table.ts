/**
 * Workflow 06: Read Table
 *
 * Tests the read_table functionality by reading an Advanced Table configured
 * via integration test config.
 *
 * Prerequisites:
 * - Config file must exist at $HOME/.remnote-mcp-bridge/remnote-mcp-bridge.json
 * - Must contain integrationTest.tableNameOrId
 */

import {
  assertTruthy,
  assertHasField,
  assertIsArray,
  assertEqual,
} from '../assertions.js';
import { hasTableConfig, getIntegrationTestConfig, getTableConfigWarning } from '../../helpers/integration-config.js';
import type { WorkflowContext, WorkflowResult, SharedState, StepResult } from '../types';

/** Expected structure of read_table response */
interface ReadTableResponse {
  columns: Array<{ name: string; propertyId: string; type: string }>;
  rows: Array<{ name: string; remId: string; values: Record<string, string[]> }>;
}

export async function readTableWorkflow(
  ctx: WorkflowContext,
  _state: SharedState
): Promise<WorkflowResult> {
  const steps: StepResult[] = [];

  // Check if table config exists - skip test if not configured
  if (!hasTableConfig()) {
    const warning = getTableConfigWarning();
    steps.push({
      label: 'Table config check',
      passed: false,
      durationMs: 0,
      error: warning,
    });
    return {
      name: 'Read Table',
      steps,
      skipped: false,
    };
  }

  const config = getIntegrationTestConfig()!;
  const tableNameOrId = config.tableNameOrId!;

  // Step 1: Call remnote_read_table with table name or ID
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_read_table', {
        tableNameOrId,
      })) as Record<string, unknown>;

      // Verify response has columns and rows
      assertHasField(result, 'columns', 'read_table response');
      assertHasField(result, 'rows', 'read_table response');

      const columns = result.columns as ReadTableResponse['columns'];
      const rows = result.rows as ReadTableResponse['rows'];

      assertIsArray(columns, 'columns should be an array');
      assertIsArray(rows, 'rows should be an array');

      // Columns should have name, propertyId, type fields
      if (Array.isArray(columns) && columns.length > 0) {
        const firstCol = columns[0] as Record<string, unknown>;
        assertHasField(firstCol, 'name', 'column should have name');
        assertHasField(firstCol, 'propertyId', 'column should have propertyId');
        assertHasField(firstCol, 'type', 'column should have type');
      }

      // Rows should have name, remId, values fields
      if (Array.isArray(rows) && rows.length > 0) {
        const firstRow = rows[0] as Record<string, unknown>;
        assertHasField(firstRow, 'name', 'row should have name');
        assertHasField(firstRow, 'remId', 'row should have remId');
        assertHasField(firstRow, 'values', 'row should have values');
      }

      steps.push({
        label: `Read table (${columns?.length ?? 0} columns, ${rows?.length ?? 0} rows)`,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Read table',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 2: Call remnote_read_table with limit
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_read_table', {
        tableNameOrId,
        limit: 1,
      })) as Record<string, unknown>;

      assertHasField(result, 'rows', 'read_table with limit response');
      const rows = result.rows as ReadTableResponse['rows'];
      assertIsArray(rows, 'rows should be an array');
      assertTruthy(
        Array.isArray(rows) && rows.length <= 1,
        'limit=1 should return at most 1 row'
      );

      steps.push({
        label: 'Read table with limit=1',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Read table with limit=1',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 3: Call remnote_read_table with offset
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_read_table', {
        tableNameOrId,
        offset: 1,
      })) as Record<string, unknown>;

      assertHasField(result, 'rows', 'read_table with offset response');
      const rows = result.rows as ReadTableResponse['rows'];
      assertIsArray(rows, 'rows should be an array');

      steps.push({
        label: 'Read table with offset=1',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Read table with offset=1',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 4: Call remnote_read_table with invalid table name (error case)
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_read_table', {
        tableNameOrId: 'invalid-table-name-xyz-12345',
      })) as Record<string, unknown>;

      // If we get here without error, check if it's an error response
      // (depends on how the server handles invalid IDs)
      // This step just verifies the tool doesn't crash
      assertHasField(result, 'columns', 'read_table with invalid ID should return columns');
      assertHasField(result, 'rows', 'read_table with invalid ID should return rows');

      steps.push({
        label: 'Read table with invalid name',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      // Error is acceptable for invalid table name
      steps.push({
        label: 'Read table with invalid name',
        passed: true,
        durationMs: Date.now() - start,
        error: `Expected error (acceptable): ${(e as Error).message}`,
      });
    }
  }

  return { name: 'Read Table', steps, skipped: false };
}
