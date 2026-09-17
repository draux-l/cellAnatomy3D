import { describe, expect, it } from 'vitest';
import { BUDGETS, ROLES, auditEntries, formatBytes } from './size-audit.mjs';

interface Entry {
  file: string;
  role: string;
  rawBytes: number;
  gzipBytes: number;
}

function entry(overrides: Partial<Entry>): Entry {
  return { file: 'assets/index.js', role: ROLES.entryJs, rawBytes: 1000, gzipBytes: 400, ...overrides };
}

describe('formatBytes', () => {
  it('scales units for readable failure messages', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(26 * 1024 * 1024)).toBe('26.00 MB');
  });
});

describe('auditEntries', () => {
  it('passes a small build', () => {
    const audit = auditEntries([
      entry({ file: 'index.html', role: ROLES.html, rawBytes: 600, gzipBytes: 350 }),
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      entry({ file: 'assets/index.css', role: ROLES.entryCss, rawBytes: 800, gzipBytes: 450 }),
    ]);

    expect(audit.ok).toBe(true);
    expect(audit.failures).toEqual([]);
    expect(audit.totals.shellGzipBytes).toBe(60_000);
    expect(audit.totals.initialGzipBytes).toBe(60_800);
  });

  it('fails a synthetic oversized file and names it', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 60_000 }),
      entry({ file: 'assets/oversized.bin', role: ROLES.lazy, rawBytes: 26 * 1024 * 1024, gzipBytes: 1024 }),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures).toHaveLength(1);
    expect(audit.failures[0]).toContain('assets/oversized.bin');
    expect(audit.failures[0]).toContain('26.00 MB');
    expect(audit.failures[0]).toContain('single-file cap');
  });

  it('fails a shell over the 350 KB gzip budget', () => {
    const audit = auditEntries([entry({ gzipBytes: BUDGETS.shellGzipBytes + 1 })]);

    expect(audit.ok).toBe(false);
    expect(audit.failures[0]).toContain('app shell JS');
    expect(audit.failures[0]).toContain('over the');
  });

  it('fails an initial payload over the 2.5 MB gzip budget', () => {
    // The shell stays inside its own budget; the initial payload does not, because CSS is part
    // of what must load before the first 3D render.
    const audit = auditEntries([
      entry({ file: 'assets/index.js', gzipBytes: 300 * 1024 }),
      entry({ file: 'assets/index.css', role: ROLES.entryCss, rawBytes: 6_000_000, gzipBytes: 2.3 * 1024 * 1024 }),
    ]);

    expect(audit.ok).toBe(false);
    expect(audit.failures).toHaveLength(1);
    expect(audit.failures[0]).toContain('initial payload');
    expect(audit.totals.shellGzipBytes).toBeLessThanOrEqual(BUDGETS.shellGzipBytes);
  });

  it('reports the largest file regardless of role', () => {
    const audit = auditEntries([
      entry({ file: 'assets/index.js', rawBytes: 1000, gzipBytes: 400 }),
      entry({ file: 'assets/vendor.js', rawBytes: 900_000, gzipBytes: 200_000 }),
    ]);

    expect(audit.totals.largestFile).toEqual({ file: 'assets/vendor.js', rawBytes: 900_000 });
    expect(audit.totals.fileCount).toBe(2);
  });

  it('keeps the ratified budgets', () => {
    expect(BUDGETS.maxFileBytes).toBe(25 * 1024 * 1024);
    expect(BUDGETS.shellGzipBytes).toBe(350 * 1024);
    expect(BUDGETS.initialGzipBytes).toBe(2.5 * 1024 * 1024);
  });
});
