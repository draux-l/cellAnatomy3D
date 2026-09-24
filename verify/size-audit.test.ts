import { describe, expect, it } from 'vitest';
import {
  BUDGETS,
  ROLES,
  SPLIT_MARKERS,
  auditEntries,
  carries3dModule,
  formatBytes,
} from './size-audit.mjs';

interface Entry {
  file: string;
  role: string;
  rawBytes: number;
  gzipBytes: number;
  has3dModule: boolean;
}

function entry(overrides: Partial<Entry>): Entry {
  return {
    file: 'assets/index.js',
    role: ROLES.entryJs,
    rawBytes: 1000,
    gzipBytes: 400,
    has3dModule: false,
    ...overrides,
  };
}

/** The lazy 3D chunk every healthy build has: three.js lives here, not in the entry graph. */
function threeChunk(overrides: Partial<Entry> = {}): Entry {
  return entry({
    file: 'assets/CellViewer-abc123.js',
    role: ROLES.lazy,
    rawBytes: 988_000,
    gzipBytes: 264_700,
    has3dModule: true,
    ...overrides,
  });
}

describe('formatBytes', () => {
  it('scales units for readable failure messages', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(26 * 1024 * 1024)).toBe('26.00 MB');
  });
});

describe('carries3dModule', () => {
  it('recognises three.js by a marker that survives minification', () => {
    expect(carries3dModule(Buffer.from('var x=1;class WebGLRenderer{}'), 'assets/a.js')).toBe(true);
    expect(carries3dModule(Buffer.from('var x=1;'), 'assets/a.js')).toBe(false);
  });

  it('never inspects non-JS files', () => {
    expect(carries3dModule(Buffer.from('WebGLRenderer'), 'assets/index.css')).toBe(false);
    expect(carries3dModule(Buffer.from('WebGLRenderer'), 'index.html')).toBe(false);
  });

  it('searches for every declared marker', () => {
    expect(SPLIT_MARKERS.length).toBeGreaterThan(0);

    for (const marker of SPLIT_MARKERS) {
      expect(carries3dModule(Buffer.from(marker), 'assets/a.js')).toBe(true);
    }
  });
});

describe('auditEntries', () => {
  it('passes a small, properly split build', () => {
    const audit = auditEntries([
      entry({ file: 'index.html', role: ROLES.html, rawBytes: 600, gzipBytes: 350 }),
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      entry({ file: 'assets/index.css', role: ROLES.entryCss, rawBytes: 800, gzipBytes: 450 }),
      threeChunk(),
    ]);

    expect(audit.ok).toBe(true);
    expect(audit.failures).toEqual([]);
    expect(audit.totals.shellGzipBytes).toBe(60_000);
    // The initial payload is entry + 3D chunk + the largest model (only one model loads first).
    expect(audit.totals.initialGzipBytes).toBe(60_800 + 264_700);
    expect(audit.totals.lazyGzipBytes).toBe(264_700);
    expect(audit.totals.threeChunkFiles).toEqual(['assets/CellViewer-abc123.js']);
    expect(audit.totals.modelRows).toEqual([]);
  });

  it('reports each shipped cell model as its own row', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      threeChunk(),
      entry({ file: 'models/animal-cell.glb', role: ROLES.lazy, rawBytes: 2_187_596, gzipBytes: 2_100_000 }),
      entry({ file: 'models/plant-cell.glb', role: ROLES.lazy, rawBytes: 2_616_236, gzipBytes: 2_500_000 }),
    ]);

    expect(audit.ok).toBe(true);
    expect(audit.totals.modelRows.map((row: { file: string }) => row.file)).toEqual([
      'models/animal-cell.glb',
      'models/plant-cell.glb',
    ]);
    // Only the larger model counts toward the initial payload.
    expect(audit.totals.initialGzipBytes).toBe(60_000 + 264_700 + 2_500_000);
    expect(audit.totals.totalStaticAssetsBytes).toBeGreaterThan(4_800_000);
  });

  it('fails when total static assets exceed the 6.5 MB ceiling', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      threeChunk(),
      entry({ file: 'models/animal-cell.glb', role: ROLES.lazy, rawBytes: 7_000_000, gzipBytes: 7_000_000 }),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures.some((failure) => failure.includes('total static assets'))).toBe(true);
  });

  it('accepts the shape PR 2 actually shipped', () => {
    // Measured after the split: entry 62.0 KB gz, one 264.7 KB gz lazy chunk carrying three.js.
    const audit = auditEntries([
      entry({ file: 'index.html', role: ROLES.html, rawBytes: 559, gzipBytes: 348 }),
      entry({ file: 'assets/index-CTvG2ocX.js', rawBytes: 199_870, gzipBytes: 62_000 }),
      entry({ file: 'assets/index-BX0RI9p9.css', role: ROLES.entryCss, rawBytes: 1310, gzipBytes: 642 }),
      threeChunk(),
    ]);

    expect(audit.ok).toBe(true);
    expect(audit.totals.shellGzipBytes).toBeLessThan(BUDGETS.postSplitShellGzipBytes);
  });

  it('fails when the 3D module is back in the entry graph, and names the file', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index-abc123.js', gzipBytes: 330_000, has3dModule: true }),
      threeChunk(),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures.some((failure) => failure.includes('assets/index-abc123.js'))).toBe(true);
    expect(audit.failures.some((failure) => failure.includes('lazy boundary is gone'))).toBe(true);
    expect(audit.failures.some((failure) => failure.includes('post-split budget'))).toBe(true);
  });

  it('fails when no lazy chunk carries the 3D module', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      threeChunk({ has3dModule: false }),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures).toHaveLength(1);
    expect(audit.failures[0]).toContain('no lazy chunk carries the 3D module');
    expect(audit.failures[0]).toContain(SPLIT_MARKERS[0]);
  });

  it('fails when the build emits no lazy chunk at all', () => {
    const audit = auditEntries([entry({ file: 'assets/index.js', gzipBytes: 60_000 })]);

    expect(audit.ok).toBe(false);
    expect(audit.failures).toHaveLength(1);
    expect(audit.failures[0]).toContain('no lazy JS chunk');
    expect(audit.totals.threeChunkFiles).toEqual([]);
  });

  it('fails a shell over the post-split 150 KB budget', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: BUDGETS.postSplitShellGzipBytes + 1 }),
      threeChunk(),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures).toHaveLength(1);
    expect(audit.failures[0]).toContain('post-split budget');
  });

  it('fails a synthetic oversized file and names it', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      threeChunk(),
      entry({ file: 'assets/oversized.bin', role: ROLES.lazy, rawBytes: 26 * 1024 * 1024, gzipBytes: 1024 }),
    ]);

    expect(audit.ok).toBe(false);
    // Two failures now: the single-file cap and the total-static-assets ceiling, which the same
    // oversized file also breaks.
    expect(audit.failures).toHaveLength(2);
    expect(audit.failures[0]).toContain('assets/oversized.bin');
    expect(audit.failures[0]).toContain('26.00 MB');
    expect(audit.failures[0]).toContain('single-file cap');
  });

  it('fails a shell over the 350 KB gzip spec budget', () => {
    const audit = auditEntries([
      entry({ gzipBytes: BUDGETS.shellGzipBytes + 1 }),
      threeChunk({ has3dModule: false }),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures[0]).toContain('app shell JS');
    expect(audit.failures[0]).toContain('over the');
  });

  it('fails an initial payload over the 6 MB gzip budget', () => {
    // The shell stays inside both of its own budgets; the initial payload does not, because CSS
    // is part of what must load before the first 3D render.
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 140 * 1024 }),
      entry({
        file: 'assets/index.css',
        role: ROLES.entryCss,
        rawBytes: 7_000_000,
        gzipBytes: 6_500_000,
      }),
      threeChunk(),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures.some((failure) => failure.includes('initial payload'))).toBe(true);
    expect(audit.totals.shellGzipBytes).toBeLessThanOrEqual(BUDGETS.shellGzipBytes);
  });

  it('reports the largest file regardless of role', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', rawBytes: 1000, gzipBytes: 400 }),
      threeChunk({ file: 'assets/vendor.js', rawBytes: 900_000, gzipBytes: 200_000 }),
    ]);

    expect(audit.totals.largestFile).toEqual({ file: 'assets/vendor.js', rawBytes: 900_000 });
    expect(audit.totals.fileCount).toBe(2);
  });

  it('keeps the ratified budgets', () => {
    expect(BUDGETS.maxFileBytes).toBe(25 * 1024 * 1024);
    expect(BUDGETS.shellGzipBytes).toBe(350 * 1024);
    expect(BUDGETS.postSplitShellGzipBytes).toBe(150 * 1024);
    // Re-ratified for the mesh path (task 11.8): ≤6 MB initial, ≤6.5 MB total static assets.
    expect(BUDGETS.initialGzipBytes).toBe(6 * 1024 * 1024);
    expect(BUDGETS.totalStaticAssetsBytes).toBe(6.5 * 1024 * 1024);
  });
});
