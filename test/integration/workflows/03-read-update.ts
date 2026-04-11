/**
 * Workflow 03: Read & Update
 *
 * Reads notes created in workflow 02, updates title/content/tags,
 * and re-reads to verify the changes persisted.
 */

import {
  assertTruthy,
  assertHasField,
  assertContains,
  assertEqual,
  assertIsArray,
} from '../assertions.js';
import type { WorkflowContext, WorkflowResult, SharedState, StepResult } from '../types.js';

function summarizeReadResult(result: Record<string, unknown>): Record<string, unknown> {
  return {
    remId: result.remId,
    title: result.title,
    keys: Object.keys(result),
    hasContent: 'content' in result,
    hasContentStructured: 'contentStructured' in result,
    hasContentProperties: 'contentProperties' in result,
    contentLength: typeof result.content === 'string' ? result.content.length : undefined,
    contentProperties: result.contentProperties,
  };
}

function findMatchingSearchResult(
  results: Array<Record<string, unknown>>,
  remId: string
): Record<string, unknown> {
  const match = results.find((r) => r.remId === remId);
  assertTruthy(match, 'should find matching search-by-tag target');
  return match as Record<string, unknown>;
}

async function resolveExpectedSearchByTagTarget(
  ctx: WorkflowContext,
  taggedRemId: string
): Promise<string> {
  const tagged = (await ctx.client.callTool('remnote_read_note', {
    remId: taggedRemId,
    includeContent: 'none',
  })) as Record<string, unknown>;

  let currentParentId =
    typeof tagged.parentRemId === 'string' && tagged.parentRemId.length > 0
      ? (tagged.parentRemId as string)
      : undefined;
  let nearestNonDocumentAncestorId: string | undefined;

  while (currentParentId) {
    const parent = (await ctx.client.callTool('remnote_read_note', {
      remId: currentParentId,
      includeContent: 'none',
    })) as Record<string, unknown>;

    const parentRemId = parent.remId as string;
    const parentRemType = parent.remType as string;
    if (!nearestNonDocumentAncestorId) {
      nearestNonDocumentAncestorId = parentRemId;
    }

    if (parentRemType === 'document' || parentRemType === 'dailyDocument') {
      return parentRemId;
    }

    currentParentId =
      typeof parent.parentRemId === 'string' && parent.parentRemId.length > 0
        ? (parent.parentRemId as string)
        : undefined;
  }

  return nearestNonDocumentAncestorId ?? (tagged.remId as string);
}

export async function readUpdateWorkflow(
  ctx: WorkflowContext,
  state: SharedState
): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const tagVerificationName = `mcp-integration-verified-${ctx.runId.replace(/[^a-zA-Z0-9]/g, '-')}`;

  if (
    !state.noteAId ||
    !state.noteBId ||
    !state.integrationParentRemId ||
    !state.integrationParentTitle
  ) {
    return {
      name: 'Read & Update',
      steps: [
        {
          label: 'Skipped — missing note IDs or integration parent from workflow 02/setup',
          passed: false,
          durationMs: 0,
          error: 'No note IDs or integration parent state available',
        },
      ],
      skipped: true,
    };
  }

  const acceptReplaceOperation = state.acceptReplaceOperation ?? false;

  // Step 1: Read simple note
  {
    const start = Date.now();
    try {
      const result = await ctx.client.callTool('remnote_read_note', {
        remId: state.noteAId,
        depth: 1,
      });
      assertHasField(result, 'title', 'read simple note');
      assertHasField(result, 'remId', 'read simple note');
      assertHasField(result, 'parentRemId', 'read simple note parentRemId');
      assertHasField(result, 'parentTitle', 'read simple note parentTitle');
      assertEqual(
        result.parentRemId as string,
        state.integrationParentRemId as string,
        'read simple note parentRemId should match integration parent'
      );
      assertEqual(
        result.parentTitle as string,
        state.integrationParentTitle as string,
        'read simple note parentTitle should match integration parent'
      );
      steps.push({ label: 'Read simple note', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Read simple note',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 2-4: Read rich note includeContent modes
  for (const mode of ['markdown', 'structured', 'none'] as const) {
    const start = Date.now();
    const label = `Read rich note includeContent=${mode} returns expected shape`;
    let debugResult: Record<string, unknown> | null = null;
    try {
      const result = await ctx.client.callTool('remnote_read_note', {
        remId: state.noteBId,
        depth: 3,
        includeContent: mode,
      });
      debugResult = result;
      assertHasField(result, 'remId', 'read rich note remId');
      assertHasField(result, 'title', 'read rich note title');
      assertHasField(result, 'parentRemId', 'read rich note parentRemId');
      assertHasField(result, 'parentTitle', 'read rich note parentTitle');
      assertEqual(
        result.parentRemId as string,
        state.integrationParentRemId as string,
        'read rich note parentRemId should match integration parent'
      );
      assertEqual(
        result.parentTitle as string,
        state.integrationParentTitle as string,
        'read rich note parentTitle should match integration parent'
      );
      // Live RemNote currently lacks reliable reverse note -> tags lookup for plain search/read.
      // Keep write + search_by_tag coverage, but do not fail the live suite on omitted read tags:
      // https://github.com/robert7/remnote-mcp-bridge/blob/main/docs/tag-readback-limitations.md
      if (mode === 'markdown') {
        assertHasField(result, 'content', 'read rich note markdown');
        assertTruthy(typeof result.content === 'string', 'content should be a string');
        assertTruthy(
          (result.content as string).length > 0,
          'rich note should include rendered content in markdown mode'
        );
        assertHasField(result, 'contentProperties', 'read rich note contentProperties');
        const props = result.contentProperties as Record<string, unknown>;
        assertTruthy(
          typeof props.childrenRendered === 'number',
          'childrenRendered should be number'
        );
        assertTruthy(typeof props.childrenTotal === 'number', 'childrenTotal should be number');
        assertTruthy((props.childrenTotal as number) > 0, 'childrenTotal should be > 0');
      } else if (mode === 'structured') {
        assertHasField(result, 'contentStructured', 'read rich note structured content');
        assertTruthy(
          Array.isArray(result.contentStructured),
          'contentStructured should be an array in structured mode'
        );
        assertTruthy(
          Array.isArray(result.contentStructured) && result.contentStructured.length > 0,
          'contentStructured should contain nested child nodes in structured mode'
        );
        assertTruthy(!('content' in result), 'structured mode should omit markdown content');
        assertTruthy(
          !('contentProperties' in result),
          'structured mode should omit contentProperties'
        );
      } else {
        assertTruthy(!('content' in result), 'none mode should omit content');
        assertTruthy(!('contentStructured' in result), 'none mode should omit structured content');
        assertTruthy(!('contentProperties' in result), 'none mode should omit contentProperties');
      }
      steps.push({
        label,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label,
        passed: false,
        durationMs: Date.now() - start,
        error:
          `${(e as Error).message} | remId=${JSON.stringify(state.noteBId)} mode=${mode}` +
          (debugResult ? ` result=${JSON.stringify(summarizeReadResult(debugResult))}` : ''),
      });
    }
  }

  // Step 3: Update title
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_update_note', {
        remId: state.noteAId,
        title: `[MCP-TEST] Updated Note ${ctx.runId}`,
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'update title should succeed');
      assertIsArray(result.remIds, 'update title remIds');
      steps.push({ label: 'Update title', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Update title',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 4: Append content
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_update_note', {
        remId: state.noteAId,
        appendContent: 'Appended via integration test',
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'append content should succeed');
      assertIsArray(result.remIds, 'append content remIds');
      steps.push({ label: 'Append content', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Append content',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 5: Replace content (or validate gate rejection)
  {
    const start = Date.now();
    try {
      if (acceptReplaceOperation) {
        const replaceBody = `[MCP-TEST] Replaced via integration test ${ctx.runId}`;
        const result = (await ctx.client.callTool('remnote_update_note', {
          remId: state.noteAId,
          replaceContent: replaceBody,
        })) as { remIds: string[] };
        assertHasField(result, 'remIds', 'replace content should succeed when enabled');
        assertIsArray(result.remIds, 'replace content remIds');

        const reread = await ctx.client.callTool('remnote_read_note', {
          remId: state.noteAId,
          depth: 2,
          includeContent: 'markdown',
        });
        assertTruthy(typeof reread.content === 'string', 're-read content should be string');
        assertContains(
          reread.content as string,
          replaceBody,
          're-read content should include replaced body'
        );
        steps.push({ label: 'Replace content', passed: true, durationMs: Date.now() - start });
      } else {
        const errorText = await ctx.client.callToolExpectError('remnote_update_note', {
          remId: state.noteAId,
          replaceContent: 'Should be blocked',
        });
        assertContains(
          errorText,
          'Replace operation is disabled',
          'replace should be rejected when disabled'
        );
        steps.push({
          label: 'Replace content blocked by gate',
          passed: true,
          durationMs: Date.now() - start,
        });
      }
    } catch (e) {
      steps.push({
        label: acceptReplaceOperation ? 'Replace content' : 'Replace content blocked by gate',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 6: Replace with empty string clears direct children (when enabled)
  if (acceptReplaceOperation) {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_update_note', {
        remId: state.noteAId,
        replaceContent: '',
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'empty replace should succeed');
      assertIsArray(result.remIds, 'empty replace remIds');

      const reread = await ctx.client.callTool('remnote_read_note', {
        remId: state.noteAId,
        depth: 2,
        includeContent: 'markdown',
      });
      assertEqual(
        reread.content as string,
        '',
        'empty replace should clear direct child markdown content'
      );
      steps.push({
        label: 'Empty replace clears direct children',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Empty replace clears direct children',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 7: Add tag
  {
    const start = Date.now();
    try {
      const expectedTargetRemId = await resolveExpectedSearchByTagTarget(
        ctx,
        state.noteAId as string
      );
      const result = (await ctx.client.callTool('remnote_update_note', {
        remId: state.noteAId,
        addTags: [tagVerificationName],
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'add tag should succeed');
      assertIsArray(result.remIds, 'add tag remIds');
      const taggedSearch = await ctx.client.callTool('remnote_search_by_tag', {
        tag: tagVerificationName,
        includeContent: 'none',
        limit: 10,
      });
      assertHasField(taggedSearch, 'results', 'search_by_tag after add tag');
      assertIsArray(taggedSearch.results, 'search_by_tag after add tag results');
      const taggedResults = taggedSearch.results as Array<Record<string, unknown>>;
      findMatchingSearchResult(taggedResults, expectedTargetRemId);
      steps.push({ label: 'Add tag', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Add tag',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 8: Remove tag
  {
    const start = Date.now();
    try {
      const expectedTargetRemId = await resolveExpectedSearchByTagTarget(
        ctx,
        state.noteAId as string
      );
      const result = (await ctx.client.callTool('remnote_update_note', {
        remId: state.noteAId,
        removeTags: [tagVerificationName],
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'remove tag should succeed');
      assertIsArray(result.remIds, 'remove tag remIds');
      const taggedSearch = await ctx.client.callTool('remnote_search_by_tag', {
        tag: tagVerificationName,
        includeContent: 'none',
        limit: 10,
      });
      assertHasField(taggedSearch, 'results', 'search_by_tag after remove tag');
      assertIsArray(taggedSearch.results, 'search_by_tag after remove tag results');
      const taggedResults = taggedSearch.results as Array<Record<string, unknown>>;
      const match = taggedResults.find((r) => r.remId === expectedTargetRemId);
      assertTruthy(!match, 'removed tag should no longer resolve to the tagged target');
      steps.push({ label: 'Remove tag', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Remove tag',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 9: Re-read verifies changes
  {
    const start = Date.now();
    try {
      const result = await ctx.client.callTool('remnote_read_note', {
        remId: state.noteAId,
        depth: 2,
      });
      assertHasField(result, 'title', 're-read note');
      assertContains(result.title as string, 'Updated Note', 'title should reflect update');
      steps.push({
        label: 'Re-read verifies changes',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Re-read verifies changes',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 10: Update with markdown tree
  {
    const start = Date.now();
    try {
      const markdownTree = `[MCP-TEST] Markdown Tree ${ctx.runId}\n- Branch 1\n  - Leaf 1\n- Branch 2`;
      const result = (await ctx.client.callTool('remnote_update_note', {
        remId: state.noteAId,
        appendContent: markdownTree,
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'update with markdown tree');
      assertIsArray(result.remIds, 'markdown tree remIds');
      assertTruthy(result.remIds.length >= 4, 'should create multiple rems for tree');

      steps.push({
        label: 'Update with markdown tree',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Update with markdown tree',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  return { name: 'Read & Update', steps, skipped: false };
}
