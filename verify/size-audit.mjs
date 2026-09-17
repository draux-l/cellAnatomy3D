import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

/**
 * Size gates over the built bundle.
 *
 * Only sizes can hard-fail CI: draw calls and file sizes are deterministic, frame timing is not.
 * Every number here comes from the artifact that actually ships — `dist/`, after a real build.
 *
 * The pure functions are exported so the gates can be unit-tested with synthetic inputs; the CLI
 * at the bottom runs against a real build.
 */

export const BUDGETS = {
  /** Free host per-file cap. */
  maxFileBytes: 25 * 1024 * 1024,
  /** App shell JS, gzipped: the landing UI must paint before the 3D module loads. */
  shellGzipBytes: 350 * 1024,
  /**
   * Post-split shell, gzipped. Design D18 promoted the code split to a hard prerequisite of
   * PR 3 and set 150 KB as the architectural number to re-ratify when the split landed. It
   * landed in PR 2 at a measured **63.50 KB**, so the number stands with ~86 KB of headroom for
   * the catalog, the scene and the UI that later milestones add to the shell.
   *
   * This is the gate that actually detects a lost lazy boundary: with three.js back in the entry
   * graph the entry jumps to ~330 KB and cannot pass.
   */
  postSplitShellGzipBytes: 150 * 1024,
  /** Everything loaded before the first 3D render, gzipped. */
  initialGzipBytes: 2.5 * 1024 * 1024,
};

export const ROLES = {
  entryJs: 'entry-js',
  entryCss: 'entry-css',
  html: 'html',
  lazy: 'lazy',
};

/**
 * String literals three.js ships that survive minification, used to prove *where* the 3D module
 * lives rather than inferring it from a size. If a future three.js drops all of them the check
 * fails loudly and names what it searched for — a false failure, never a false pass.
 */
export const SPLIT_MARKERS = ['WebGLRenderer', 'MeshPhysicalMaterial', 'BufferGeometryUtils'];


export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function toPosix(path) {
  return path.split(sep).join(posix.sep);
}

/** Files referenced directly by index.html: the entry graph that paints before 3D loads. */
export function readEntryGraph(distDirectory) {
  const html = readFileSync(join(distDirectory, 'index.html'), 'utf8');
  const entryJs = [];
  const entryCss = [];

  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    entryJs.push(match[1].replace(/^\//, ''));
  }

  for (const match of html.matchAll(/<link[^>]+rel="(?:stylesheet|modulepreload)"[^>]+href="([^"]+)"/g)) {
    const href = match[1].replace(/^\//, '');

    if (href.endsWith('.css')) {
      entryCss.push(href);
    } else {
      entryJs.push(href);
    }
  }

  return { entryJs, entryCss };
}

function listFiles(directory, prefix = '') {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...listFiles(full, posix.join(prefix, entry.name)));
    } else {
      found.push(posix.join(prefix, entry.name));
    }
  }

  return found;
}

/** True when the built file text carries a three.js signature (string literals survive minification). */
export function carries3dModule(buffer, file) {
  if (!file.endsWith('.js')) {
    return false;
  }

  return SPLIT_MARKERS.some((marker) => buffer.includes(marker));
}

/** Every file in `dist/`, with raw and gzipped sizes and its role in the load graph. */
export function collectDistEntries(distDirectory) {
  const { entryJs, entryCss } = readEntryGraph(distDirectory);
  const files = listFiles(distDirectory);

  return files.map((file) => {
    const buffer = readFileSync(join(distDirectory, file.split('/').join(sep)));
    const isEntry = entryJs.includes(file) || entryCss.includes(file);

    let role = ROLES.lazy;

    if (file === 'index.html') {
      role = ROLES.html;
    } else if (entryCss.includes(file)) {
      role = ROLES.entryCss;
    } else if (entryJs.includes(file)) {
      role = ROLES.entryJs;
    } else if (!isEntry && file.endsWith('.js')) {
      role = ROLES.lazy;
    }

    return {
      file,
      role,
      rawBytes: statSync(join(distDirectory, file.split('/').join(sep))).size,
      gzipBytes: gzipSync(buffer).length,
      has3dModule: carries3dModule(buffer, file),
    };
  });
}

export function auditEntries(entries, budgets = BUDGETS) {
  const failures = [];
  const initialRoles = [ROLES.entryJs, ROLES.entryCss, ROLES.html];

  const sumGzip = (roles) =>
    entries.filter((entry) => roles.includes(entry.role)).reduce((total, entry) => total + entry.gzipBytes, 0);

  const shellGzipBytes = sumGzip([ROLES.entryJs]);
  const initialGzipBytes = sumGzip(initialRoles);
  const lazyGzipBytes = sumGzip([ROLES.lazy]);
  const largest = entries.reduce(
    (biggest, entry) => (biggest === null || entry.rawBytes > biggest.rawBytes ? entry : biggest),
    null,
  );

  for (const entry of entries) {
    if (entry.rawBytes > budgets.maxFileBytes) {
      failures.push(
        `dist/${entry.file} is ${formatBytes(entry.rawBytes)}, over the ${formatBytes(budgets.maxFileBytes)} single-file cap`,
      );
    }
  }

  if (shellGzipBytes > budgets.shellGzipBytes) {
    failures.push(
      `app shell JS is ${formatBytes(shellGzipBytes)} gzipped, over the ${formatBytes(budgets.shellGzipBytes)} budget`,
    );
  }

  if (initialGzipBytes > budgets.initialGzipBytes) {
    failures.push(
      `initial payload is ${formatBytes(initialGzipBytes)} gzipped, over the ${formatBytes(budgets.initialGzipBytes)} budget`,
    );
  }

  // The split assertions. A lazy boundary can be undone by one careless static import, and a
  // size alone cannot tell "the shell got bigger" from "the 3D module moved back in".
  const entryWith3d = entries.filter((entry) => entry.role === ROLES.entryJs && entry.has3dModule);
  const lazyJs = entries.filter((entry) => entry.role === ROLES.lazy && entry.file.endsWith('.js'));
  const lazyWith3d = lazyJs.filter((entry) => entry.has3dModule);

  if (entryWith3d.length > 0) {
    failures.push(
      `the 3D module is in the entry graph (${entryWith3d.map((entry) => entry.file).join(', ')}) — the lazy boundary is gone`,
    );
  }

  if (lazyJs.length === 0) {
    failures.push('the build emitted no lazy JS chunk — the 3D module has nowhere to load from');
  } else if (lazyWith3d.length === 0) {
    failures.push(
      `no lazy chunk carries the 3D module (looked for: ${SPLIT_MARKERS.join(', ')}) — the split is not doing its job`,
    );
  }

  if (shellGzipBytes > budgets.postSplitShellGzipBytes) {
    failures.push(
      `app shell JS is ${formatBytes(shellGzipBytes)} gzipped, over the ${formatBytes(budgets.postSplitShellGzipBytes)} post-split budget — the 3D module is probably back in the entry graph`,
    );
  }

  return {
    ok: failures.length === 0,
    failures,
    totals: {
      shellGzipBytes,
      initialGzipBytes,
      lazyGzipBytes,
      threeChunkFiles: lazyWith3d.map((entry) => entry.file),
      largestFile: largest ? { file: largest.file, rawBytes: largest.rawBytes } : null,
      fileCount: entries.length,
      entryCount: entries.filter((entry) => initialRoles.includes(entry.role)).length,
    },
  };
}

export function reportTable(entries) {
  return entries
    .map(
      (entry) =>
        `  ${entry.role.padEnd(10)} ${entry.file.padEnd(34)} ${formatBytes(entry.rawBytes).padStart(10)} raw ${formatBytes(entry.gzipBytes).padStart(10)} gz`,
    )
    .join('\n');
}

function main() {
  const distDirectory = process.argv.includes('--dist')
    ? process.argv[process.argv.indexOf('--dist') + 1]
    : 'dist';

  let entries;

  try {
    entries = collectDistEntries(distDirectory);
  } catch (error) {
    console.error(`size-audit: cannot read ${distDirectory}/ — run \`npm run build\` first (${String(error)})`);
    process.exit(1);
  }

  const audit = auditEntries(entries);

  console.log(`size-audit: ${entries.length} files in ${distDirectory}/`);
  console.log(reportTable(entries));
  console.log(
    `  shell (entry JS, gz)     ${formatBytes(audit.totals.shellGzipBytes)} / ${formatBytes(BUDGETS.shellGzipBytes)} spec budget`,
  );
  console.log(
    `  post-split shell (gz)    ${formatBytes(audit.totals.shellGzipBytes)} / ${formatBytes(BUDGETS.postSplitShellGzipBytes)} budget`,
  );
  console.log(`  lazy JS (gz)             ${formatBytes(audit.totals.lazyGzipBytes)}`);
  console.log(
    `  3D module                ${audit.totals.threeChunkFiles.length > 0 ? `lazy: ${audit.totals.threeChunkFiles.join(', ')}` : 'NOT IN A LAZY CHUNK'}`,
  );
  console.log(
    `  initial payload (gz)     ${formatBytes(audit.totals.initialGzipBytes)} / ${formatBytes(BUDGETS.initialGzipBytes)} budget`,
  );
  console.log(
    `  largest file             ${audit.totals.largestFile ? `${audit.totals.largestFile.file} ${formatBytes(audit.totals.largestFile.rawBytes)}` : 'n/a'} / ${formatBytes(BUDGETS.maxFileBytes)} cap`,
  );

  if (!audit.ok) {
    console.error('\nsize-audit: FAILED');
    for (const failure of audit.failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log('size-audit: passed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
