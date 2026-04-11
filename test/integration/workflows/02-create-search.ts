/**
 * Workflow 02: Create & Search
 *
 * Creates two notes (simple and rich), waits for indexing, then searches
 * for them to verify they are findable. Returns note IDs for downstream workflows.
 */

import { assertTruthy, assertHasField, assertIsArray, assertEqual } from '../assertions.js';
import type { WorkflowContext, WorkflowResult, SharedState, StepResult } from '../types.js';

function summarizeSearchResults(
  results: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return results.slice(0, 8).map((r) => ({
    remId: r.remId,
    title: r.title,
    headline: r.headline,
    hasContent: 'content' in r,
    hasContentStructured: 'contentStructured' in r,
  }));
}

function findMatchingSearchResult(
  results: Array<Record<string, unknown>>,
  remId: string
): Record<string, unknown> {
  const match = results.find((r) => r.remId === remId);
  assertTruthy(match, 'should find matching note');
  return match as Record<string, unknown>;
}

function assertParentContext(
  note: Record<string, unknown>,
  state: SharedState,
  label: string
): void {
  assertTruthy(typeof state.integrationParentRemId === 'string', `${label}: parent remId in state`);
  assertTruthy(typeof state.integrationParentTitle === 'string', `${label}: parent title in state`);
  assertEqual(
    note.parentRemId as string,
    state.integrationParentRemId as string,
    `${label}: parentRemId`
  );
  assertEqual(
    note.parentTitle as string,
    state.integrationParentTitle as string,
    `${label}: parentTitle`
  );
}

function assertSearchContentModeShape(
  note: Record<string, unknown>,
  mode: 'markdown' | 'structured' | 'none'
): void {
  if (mode === 'markdown') {
    assertTruthy(typeof note.content === 'string', 'markdown mode should include string content');
    assertTruthy((note.content as string).length > 0, 'markdown content should be non-empty');
    assertTruthy(!('contentStructured' in note), 'markdown mode should omit contentStructured');
    return;
  }

  if (mode === 'structured') {
    assertIsArray(note.contentStructured, 'structured mode contentStructured');
    assertTruthy(
      Array.isArray(note.contentStructured) && note.contentStructured.length > 0,
      'structured mode should include non-empty contentStructured'
    );
    assertTruthy(!('content' in note), 'structured mode should omit markdown content');
    return;
  }

  assertTruthy(!('content' in note), 'none mode should omit markdown content');
  assertTruthy(!('contentStructured' in note), 'none mode should omit structured content');
}

interface ExpectedTagTarget {
  remId: string;
  remType: string;
  source: 'documentAncestor' | 'nearestNonDocumentAncestor' | 'self';
}

async function resolveExpectedSearchByTagTarget(
  ctx: WorkflowContext,
  taggedRemId: string
): Promise<ExpectedTagTarget> {
  const tagged = (await ctx.client.callTool('remnote_read_note', {
    remId: taggedRemId,
    includeContent: 'none',
  })) as Record<string, unknown>;

  let currentParentId =
    typeof tagged.parentRemId === 'string' && tagged.parentRemId.length > 0
      ? (tagged.parentRemId as string)
      : undefined;

  let nearestNonDocumentAncestor: { remId: string; remType: string } | undefined;

  while (currentParentId) {
    const parent = (await ctx.client.callTool('remnote_read_note', {
      remId: currentParentId,
      includeContent: 'none',
    })) as Record<string, unknown>;

    const parentRemId = parent.remId as string;
    const parentRemType = parent.remType as string;
    if (!nearestNonDocumentAncestor) {
      nearestNonDocumentAncestor = { remId: parentRemId, remType: parentRemType };
    }

    if (parentRemType === 'document' || parentRemType === 'dailyDocument') {
      return {
        remId: parentRemId,
        remType: parentRemType,
        source: 'documentAncestor',
      };
    }

    currentParentId =
      typeof parent.parentRemId === 'string' && parent.parentRemId.length > 0
        ? (parent.parentRemId as string)
        : undefined;
  }

  if (nearestNonDocumentAncestor) {
    return {
      remId: nearestNonDocumentAncestor.remId,
      remType: nearestNonDocumentAncestor.remType,
      source: 'nearestNonDocumentAncestor',
    };
  }

  return {
    remId: tagged.remId as string,
    remType: tagged.remType as string,
    source: 'self',
  };
}

export async function createSearchWorkflow(
  ctx: WorkflowContext,
  state: SharedState
): Promise<WorkflowResult> {
  const steps: StepResult[] = [];
  const delay = parseInt(process.env.MCP_TEST_DELAY ?? '2000', 10);
  const sanitizedRunId = ctx.runId.replace(/[^a-zA-Z0-9]/g, '-');
  const mdTreeRootOnlyTag = `mcp-tree-root-${sanitizedRunId}`;

  if (!state.integrationParentRemId) {
    return {
      name: 'Create & Search',
      steps: [
        {
          label: 'Skipped — integration parent note not initialized',
          passed: false,
          durationMs: 0,
          error: 'No integrationParentRemId in shared state',
        },
      ],
      skipped: true,
    };
  }

  if (!state.searchByTagTag) {
    state.searchByTagTag = `mcp-test-tag-${sanitizedRunId}`;
  }
  // Step 1: Create simple note
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_create_note', {
        title: `[MCP-TEST] Simple Note ${ctx.runId}`,
        parentId: state.integrationParentRemId,
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'create simple note');
      assertIsArray(result.remIds, 'remIds should be an array');
      state.noteAId = result.remIds[0];
      steps.push({ label: 'Create simple note', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Create simple note',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 2: Create rich note with content and tags
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_create_note', {
        title: `[MCP-TEST] Rich Note ${ctx.runId}`,
        parentId: state.integrationParentRemId,
        content: 'Bullet one\nBullet two\nBullet three',
        tags: [state.searchByTagTag],
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'create rich note');
      assertIsArray(result.remIds, 'remIds should be an array');
      state.noteBId = result.remIds[0];
      steps.push({
        label: 'Create rich note with content and tags',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Create rich note with content and tags',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 3: Create flashcard note
  {
    const start = Date.now();
    try {
      const result = (await ctx.client.callTool('remnote_create_note', {
        title: `[MCP-TEST] Flashcard Note ${ctx.runId}`,
        parentId: state.integrationParentRemId,
        content: 'Front :: Back',
        tags: [state.searchByTagTag as string],
      })) as { remIds: string[] };
      assertHasField(result, 'remIds', 'create flashcard note');
      assertIsArray(result.remIds, 'remIds should be an array');
      state.noteCId = result.remIds[0];
      steps.push({ label: 'Create flashcard note', passed: true, durationMs: Date.now() - start });
    } catch (e) {
      steps.push({
        label: 'Create flashcard note',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 4: Create markdown tree with various flashcard types
  {
    const start = Date.now();
    try {
      const markdownContent = [
        `- Flashcard Tree`,
        `  - Basic Forward >> Answer`,
        `  - Basic Backward << Answer`,
        `  - Two-way :: Answer`,
        `  - Disabled >- Answer`,
        `  - Cloze with {{hidden}}{({hint text})} text`,
        `  - Concept :: Definition`,
        `  - Concept Forward :> Definition`,
        `  - Concept Backward :< Definition`,
        `  - Descriptor ;; Detail`,
        `  - Multi-line >>>`,
        `    - Card Item 1`,
        `    - Card Item 2`,
        `  - List-answer >>1.`,
        `    - First list item`,
        `    - Second list item`,
        `  - Multiple-choice >>A)`,
        `    - Correct option`,
        `    - Wrong option`,
      ].join('\n');

      const result = (await ctx.client.callTool('remnote_create_note', {
        content: markdownContent,
        title: `[MCP-TEST] Flashcard Tree ${ctx.runId}`,
        parentId: state.integrationParentRemId,
        tags: [state.searchByTagTag as string, mdTreeRootOnlyTag],
      })) as { remIds: string[] };

      assertHasField(result, 'remIds', 'create markdown tree');
      assertIsArray(result.remIds, 'markdown tree remIds');
      state.mdTreeIds = result.remIds as string[];
      steps.push({
        label: 'Create md tree with flashcards',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Create md tree with flashcards',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Wait for RemNote indexing
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Step 5: Search finds simple note
  {
    const start = Date.now();
    try {
      const result = await ctx.client.callTool('remnote_search', {
        query: `[MCP-TEST] Simple Note ${ctx.runId}`,
        limit: 5,
      });
      assertHasField(result, 'results', 'search simple note');
      assertIsArray(result.results, 'search results');
      const results = result.results as Array<Record<string, unknown>>;
      assertTruthy(results.length > 0, 'search should return at least one result');
      const found = results.some((r) => typeof r.title === 'string' && r.title.includes(ctx.runId));
      assertTruthy(found, 'at least one result title should contain runId');
      assertTruthy(typeof state.noteAId === 'string', 'simple note remId should be recorded');
      const simpleMatch = findMatchingSearchResult(results, state.noteAId as string);
      assertParentContext(simpleMatch, state, 'search simple note parent context');
      steps.push({
        label: 'Search finds simple note',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Search finds simple note',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  // Step 6-8: Search with includeContent modes
  for (const mode of ['markdown', 'structured', 'none'] as const) {
    const start = Date.now();
    const label = `Search includeContent=${mode} returns expected shape`;
    const query = `${ctx.runId}`;
    let debugResults: Array<Record<string, unknown>> | null = null;
    try {
      const result = await ctx.client.callTool('remnote_search', {
        query,
        includeContent: mode,
      });
      assertHasField(result, 'results', `search ${mode}`);
      assertIsArray(result.results, `search ${mode} results`);
      const results = result.results as Array<Record<string, unknown>>;
      debugResults = results;
      assertTruthy(results.length > 0, `search ${mode} should return results`);
      assertTruthy(typeof state.noteBId === 'string', 'rich note remId should be recorded');
      const match = findMatchingSearchResult(results, state.noteBId as string);
      assertSearchContentModeShape(match, mode);
      assertParentContext(match, state, `search ${mode} parent context`);
      // Live RemNote currently lacks reliable reverse note -> tags lookup for plain search/read.
      // Keep write + search_by_tag coverage, but do not fail the live suite on omitted search tags:
      // https://github.com/robert7/remnote-mcp-bridge/blob/main/docs/tag-readback-limitations.md
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
          `${(e as Error).message} | query=${JSON.stringify(query)} expectedRemId=${JSON.stringify(
            state.noteBId ?? null
          )}` +
          (debugResults
            ? ` resultCount=${debugResults.length} topResults=${JSON.stringify(
                summarizeSearchResults(debugResults)
              )}`
            : ''),
      });
    }
  }

  // Step 9: Search finds markdown tree root
  {
    const start = Date.now();
    let debugResults: Array<Record<string, unknown>> | null = null;
    try {
      assertTruthy(
        typeof state.mdTreeIds?.[0] === 'string',
        'markdown tree root remId should be recorded'
      );
      const result = await ctx.client.callTool('remnote_search', {
        query: `${ctx.runId}`,
        includeContent: 'structured',
      });
      assertHasField(result, 'results', 'search markdown tree root');
      assertIsArray(result.results, 'search markdown tree root results');
      const results = result.results as Array<Record<string, unknown>>;
      debugResults = results;
      const match = findMatchingSearchResult(results, state.mdTreeIds[0] as string);
      assertSearchContentModeShape(match, 'structured');
      assertParentContext(match, state, 'search markdown tree root parent context');
      steps.push({
        label: 'Search finds markdown tree root',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Search finds markdown tree root',
        passed: false,
        durationMs: Date.now() - start,
        error:
          `${(e as Error).message} | expectedRemId=${JSON.stringify(state.mdTreeIds?.[0] ?? null)}` +
          (debugResults
            ? ` resultCount=${debugResults.length} topResults=${JSON.stringify(
                summarizeSearchResults(debugResults)
              )}`
            : ''),
      });
    }
  }

  // Step 10: Root-only markdown tree tag does not bleed to descendants
  {
    const start = Date.now();
    let debugResults: Array<Record<string, unknown>> | null = null;
    try {
      assertTruthy(
        typeof state.mdTreeIds?.[0] === 'string',
        'markdown tree root remId should be recorded'
      );
      const expectedTarget = await resolveExpectedSearchByTagTarget(
        ctx,
        state.mdTreeIds[0] as string
      );
      const result = await ctx.client.callTool('remnote_search_by_tag', {
        tag: mdTreeRootOnlyTag,
        includeContent: 'none',
        limit: 10,
      });
      assertHasField(result, 'results', 'search_by_tag markdown tree root-only tag');
      assertIsArray(result.results, 'search_by_tag markdown tree root-only tag results');
      const results = result.results as Array<Record<string, unknown>>;
      debugResults = results;
      assertEqual(
        results.length,
        1,
        'root-only markdown tree tag should resolve to exactly one target'
      );
      findMatchingSearchResult(results, expectedTarget.remId);
      steps.push({
        label: 'Root-only markdown tree tag excludes descendants',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Root-only markdown tree tag excludes descendants',
        passed: false,
        durationMs: Date.now() - start,
        error:
          `${(e as Error).message} | tag=${JSON.stringify(mdTreeRootOnlyTag)}` +
          (debugResults
            ? ` resultCount=${debugResults.length} topResults=${JSON.stringify(
                summarizeSearchResults(debugResults)
              )}`
            : ''),
      });
    }
  }

  // Step 11-13: Search by tag with includeContent modes
  let expectedTagTarget: ExpectedTagTarget | undefined;
  {
    const start = Date.now();
    try {
      assertTruthy(typeof state.noteBId === 'string', 'rich note remId should be recorded');
      expectedTagTarget = await resolveExpectedSearchByTagTarget(ctx, state.noteBId as string);
      steps.push({
        label: 'Resolve expected search-by-tag ancestor target',
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (e) {
      steps.push({
        label: 'Resolve expected search-by-tag ancestor target',
        passed: false,
        durationMs: Date.now() - start,
        error: (e as Error).message,
      });
    }
  }

  for (const mode of ['markdown', 'structured', 'none'] as const) {
    const start = Date.now();
    const label = `Search by tag includeContent=${mode} returns expected shape`;
    let debugResults: Array<Record<string, unknown>> | null = null;
    try {
      assertTruthy(typeof state.searchByTagTag === 'string', 'searchByTagTag should be recorded');
      const result = await ctx.client.callTool('remnote_search_by_tag', {
        tag: state.searchByTagTag as string,
        includeContent: mode,
      });
      assertHasField(result, 'results', `search_by_tag ${mode}`);
      assertIsArray(result.results, `search_by_tag ${mode} results`);
      const results = result.results as Array<Record<string, unknown>>;
      debugResults = results;
      assertTruthy(results.length > 0, `search_by_tag ${mode} should return results`);
      assertTruthy(expectedTagTarget, 'expected tag target should be resolved');
      const match = findMatchingSearchResult(
        results,
        (expectedTagTarget as ExpectedTagTarget).remId
      );
      assertSearchContentModeShape(match, mode);
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
          `${(e as Error).message} | tag=${JSON.stringify(state.searchByTagTag ?? null)} expectedTarget=${JSON.stringify(expectedTagTarget ?? null)}` +
          (debugResults
            ? ` resultCount=${debugResults.length} topResults=${JSON.stringify(
                summarizeSearchResults(debugResults)
              )}`
            : ''),
      });
    }
  }

  return { name: 'Create & Search', steps, skipped: false };
}
