import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Model audit — the build step that makes a re-optimization fail loudly (design D20, task 11.7).
 *
 * It reads the committed GLBs and the committed identification map (`src/catalog/models.json`) and
 * asserts, for every mesh the map names:
 *
 * 1. **the file's sha256 matches the manifest** — so a silently re-optimized model cannot ship;
 * 2. **every manifest `(node, occurrence)` exists in the GLB** — a renamed or removed node fails,
 *    naming the row;
 * 3. **every mapped mesh belongs to exactly one record** — a mesh claimed twice, or unclaimed,
 *    is a mapping bug.
 *
 * It also emits a mesh-inventory diff and a per-record **disassembly suggestion sheet** (task 12.6:
 * bounds centre → direction, 1.5× the union bounding radius → distance).
 *
 * **No `@gltf-transform/core`.** That devDependency is unvetted against this project's lockfile, and
 * the audit only needs the GLB's JSON chunk plus each accessor's `min`/`max`, which is readable
 * directly. This keeps the dependency surface at zero.
 *
 * Pure functions are exported so `verify/model-audit.test.ts` can drive them with synthetic GLBs.
 */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

/** Normalization divisors for `KHR_mesh_quantization` accessors (componentType → divisor). */
const NORMALIZATION_DIVISOR = {
  5120: 127, // BYTE
  5121: 255, // UNSIGNED_BYTE
  5122: 32767, // SHORT
  5123: 65535, // UNSIGNED_SHORT
  5125: 1, // UNSIGNED_INT
  5126: 1, // FLOAT
};

export function sha256Of(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Reads a binary glTF's JSON chunk. Throws on a non-GLB or a file with no JSON chunk — a broken
 * file must never be mistaken for a valid one.
 */
export function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('not a GLB: magic bytes are missing');
  }

  const version = buffer.readUInt32LE(4);
  const totalLength = buffer.readUInt32LE(8);
  let offset = 12;
  let json = null;

  while (offset + 8 <= Math.min(totalLength, buffer.length)) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;

    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(buffer.subarray(start, start + chunkLength).toString('utf8'));
    }

    offset = start + chunkLength;
  }

  if (json === null) {
    throw new Error('GLB has no JSON chunk');
  }

  return { version, json };
}

/** Serialises a minimal valid GLB from a JSON chunk (used by the tests). */
export function buildGlb(json, binary = Buffer.alloc(0)) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (binary.length % 4)) % 4;
  const binChunk = Buffer.concat([binary, Buffer.alloc(binPadding, 0)]);
  const total = 12 + 8 + jsonChunk.length + (binChunk.length > 0 ? 8 + binChunk.length : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonChunk.copy(out, 20);
  let offset = 20 + jsonChunk.length;

  if (binChunk.length > 0) {
    out.writeUInt32LE(binChunk.length, offset);
    out.writeUInt32LE(0x004e4942, offset + 4);
    binChunk.copy(out, offset + 8);
  }

  return out;
}

function multiplyMatrices(a, b) {
  const out = new Array(16);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;

      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row] * b[column * 4 + k];
      }

      out[column * 4 + row] = sum;
    }
  }

  return out;
}

function matrixFromTRS(translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
  const [x, y, z, w] = rotation;
  const xx = x * x;
  const xy = x * y;
  const xz = x * z;
  const yy = y * y;
  const yz = y * z;
  const zz = z * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return [
    (1 - 2 * (yy + zz)) * scale[0],
    2 * (xy + wz) * scale[0],
    2 * (xz - wy) * scale[0],
    0,
    2 * (xy - wz) * scale[1],
    (1 - 2 * (xx + zz)) * scale[1],
    2 * (yz + wx) * scale[1],
    0,
    2 * (xz + wy) * scale[2],
    2 * (yz - wx) * scale[2],
    1 - 2 * (xx + yy),
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];
}

function applyMatrix(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12],
    matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13],
    matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14],
  ];
}

/** A mesh node's world matrix, walking ancestors. */
function worldMatrices(nodes) {
  const parent = new Array(nodes.length).fill(-1);

  nodes.forEach((node, index) => {
    for (const child of node.children ?? []) {
      parent[child] = index;
    }
  });

  const cache = new Array(nodes.length);
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const of = (index) => {
    if (cache[index]) {
      return cache[index];
    }

    const node = nodes[index];

    if (Array.isArray(node.matrix)) {
      cache[index] = node.matrix.slice();
    } else {
      const local = matrixFromTRS(node.translation, node.rotation, node.scale);
      cache[index] = parent[index] >= 0 ? multiplyMatrices(of(parent[index]), local) : local;
    }

    if (!cache[index]) {
      cache[index] = IDENTITY;
    }

    return cache[index];
  };

  return of;
}

/**
 * The model's mesh inventory: one entry per mesh node, in node order, with its occurrence among
 * same-named nodes, its triangle count, its world-space bounds and the material it carried.
 */
export function meshInventory(json) {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const materials = json.materials ?? [];
  const worldOf = worldMatrices(nodes);
  const occurrence = new Map();
  const inventory = [];

  nodes.forEach((node, index) => {
    if (node.mesh == null) {
      return;
    }

    const name = node.name ?? `node${index}`;
    const order = occurrence.get(name) ?? 0;
    occurrence.set(name, order + 1);

    const mesh = meshes[node.mesh];
    const matrix = worldOf(index);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let triangles = 0;
    let materialIndex = null;

    for (const primitive of mesh.primitives ?? []) {
      const position = accessors[primitive.attributes?.POSITION];
      const divisor = position?.normalized ? NORMALIZATION_DIVISOR[position.componentType] ?? 1 : 1;

      if (primitive.indices != null) {
        triangles += Math.floor(accessors[primitive.indices].count / 3);
      } else if (position) {
        triangles += Math.floor(position.count / 3);
      }

      if (primitive.material != null && materialIndex === null) {
        materialIndex = primitive.material;
      }

      if (position?.min && position?.max) {
        const lo = position.min.map((value) => value / divisor);
        const hi = position.max.map((value) => value / divisor);
        // Eight corners: conservative under rotation, exact for the scale+translation the models use.
        for (let corner = 0; corner < 8; corner += 1) {
          const point = [
            corner & 1 ? hi[0] : lo[0],
            corner & 2 ? hi[1] : lo[1],
            corner & 4 ? hi[2] : lo[2],
          ];
          const world = applyMatrix(matrix, point);

          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis], world[axis]);
            max[axis] = Math.max(max[axis], world[axis]);
          }
        }
      }
    }

    inventory.push({
      nodeId: index,
      name,
      occurrence: order,
      triangles,
      materialName: materialIndex === null ? null : materials[materialIndex]?.name ?? null,
      bounds: { min, max },
    });
  });

  return inventory;
}

/** Half the box diagonal — the same radius `Box3.getBoundingSphere()` derives. */
export function radiusOf(bounds) {
  return (
    0.5 *
    Math.hypot(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
    )
  );
}

/** The centre of a box. */
export function centerOf(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

/** The union of several boxes. */
export function unionBounds(boxes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], box.min[axis]);
      max[axis] = Math.max(max[axis], box.max[axis]);
    }
  }

  return { min, max };
}

/**
 * Compares the committed manifest for one cell against its GLB inventory.
 *
 * Every failure names the model, so a build log says *which* file and *which* row is wrong.
 */
export function auditModel(cell, manifestCell, inventory, actualSha256) {
  const failures = [];
  const expectedSha = manifestCell?.frame?.sha256;

  if (expectedSha && expectedSha !== actualSha256) {
    failures.push(
      `${cell}: sha256 is ${actualSha256}, but the manifest records ${expectedSha} — the model was re-optimized or replaced; re-run the identification map and update the manifest`,
    );
  }

  const byKey = new Map(inventory.map((entry) => [`${entry.name}#${entry.occurrence}`, entry]));
  const mappedKeys = new Set();

  for (const row of manifestCell?.meshes ?? []) {
    const key = `${row.node}#${row.occurrence ?? 0}`;
    const entry = byKey.get(key);

    if (!entry) {
      failures.push(`${cell}: manifest row "${key}" has no matching node in the model`);
      continue;
    }

    if (mappedKeys.has(key)) {
      failures.push(`${cell}: mesh "${key}" is claimed by more than one manifest row`);
    }

    mappedKeys.add(key);
  }

  // A mesh present in the model but absent from the map is the inventory diff the design wants
  // surfaced: it is not automatically a failure (the map may legitimately omit debris), but it is
  // reported so a re-optimization cannot silently add geometry nobody mapped.
  const unmappedInModel = inventory
    .map((entry) => `${entry.name}#${entry.occurrence}`)
    .filter((key) => !mappedKeys.has(key));

  return { failures, unmappedInModel };
}

/**
 * The per-record disassembly suggestion (task 12.6, design D22).
 *
 * The record's own meshes' union bounds give the centre (→ direction) and 1.5× the radius (→
 * distance). These are *suggestions*; the author reviews and commits the final values into `cells.ts`,
 * and the runtime never computes a vector.
 */
export function disassemblySuggestions(manifestCell, inventory, multiplier = 1.5) {
  const byKey = new Map(inventory.map((entry) => [`${entry.name}#${entry.occurrence}`, entry]));
  const byRecord = new Map();

  for (const row of manifestCell?.meshes ?? []) {
    if (row.policy !== 'map' || !row.recordId) {
      continue;
    }

    const entry = byKey.get(`${row.node}#${row.occurrence ?? 0}`);

    if (!entry) {
      continue;
    }

    const boxes = byRecord.get(row.recordId) ?? [];
    boxes.push(entry.bounds);
    byRecord.set(row.recordId, boxes);
  }

  const suggestions = {};

  for (const [recordId, boxes] of byRecord) {
    const union = unionBounds(boxes);
    const center = centerOf(union);
    const radius = radiusOf(union);
    const length = Math.hypot(...center);

    suggestions[recordId] = {
      meshCount: boxes.length,
      center: center.map((value) => Number(value.toFixed(3))),
      radius: Number(radius.toFixed(3)),
      suggestedDistance: Number((multiplier * radius).toFixed(3)),
      suggestedDirection:
        length > 1e-6 ? center.map((value) => Number((value / length).toFixed(4))) : [0, 0, 0],
    };
  }

  return suggestions;
}

function resolveModelPath(frame) {
  // The manifest's path is served from `public/`; on disk it is `public/models/<file>.glb`.
  return join('public', frame.file.replace(/^\//, ''));
}

export function auditCommittedModels(manifest, options = {}) {
  const models = options.models ?? {};
  const report = { ok: true, cells: {}, failures: [] };

  for (const cell of ['animal', 'plant']) {
    const manifestCell = manifest[cell];
    const relative = resolveModelPath(manifestCell.frame);

    if (!existsSync(relative)) {
      report.cells[cell] = { status: 'absent', expected: relative };
      continue;
    }

    const buffer = readFileSync(relative);
    const sha256 = sha256Of(buffer);
    const { json } = parseGlb(buffer);
    const inventory = meshInventory(json);
    const { failures, unmappedInModel } = auditModel(cell, manifestCell, inventory, sha256);

    report.cells[cell] = {
      status: 'present',
      file: relative,
      sha256,
      bytes: buffer.length,
      meshCount: inventory.length,
      triangles: inventory.reduce((total, entry) => total + entry.triangles, 0),
      unmappedInModel,
      suggestions: disassemblySuggestions(manifestCell, inventory),
    };

    report.failures.push(...failures);
    report.ok = report.ok && failures.length === 0;
  }

  if (models.writeSuggestions !== false && report.ok) {
    const { suggestions } = aggregateSuggestions(report);
    const target = 'artifacts/models/disassembly-suggestions.json';
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      `${JSON.stringify({ generatedBy: 'verify/model-audit.mjs', generatedAt: new Date().toISOString(), cells: suggestions }, null, 2)}\n`,
      'utf8',
    );
    report.suggestionsPath = target;
  }

  return report;
}

export function aggregateSuggestions(report) {
  const suggestions = {};

  for (const [cell, entry] of Object.entries(report.cells)) {
    if (entry.status === 'present') {
      suggestions[cell] = entry.suggestions;
    }
  }

  return { suggestions };
}

function main() {
  const manifestPath = process.argv.includes('--manifest')
    ? process.argv[process.argv.indexOf('--manifest') + 1]
    : 'src/catalog/models.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const report = auditCommittedModels(manifest);

  console.log('model-audit: reading the committed identification map and GLBs');

  for (const [cell, entry] of Object.entries(report.cells)) {
    if (entry.status === 'absent') {
      console.log(`  ${cell.padEnd(7)} absent (${entry.expected}) — not a failure until the asset ships`);
      continue;
    }

    console.log(
      `  ${cell.padEnd(7)} ${entry.file} sha=${entry.sha256.slice(0, 12)}… ${(entry.bytes / (1024 * 1024)).toFixed(2)} MB ${entry.meshCount} meshes ${entry.triangles} tris`,
    );

    if (entry.unmappedInModel.length > 0) {
      console.log(`          model meshes not in the map: ${entry.unmappedInModel.join(', ')}`);
    }
  }

  if (report.suggestionsPath) {
    console.log(`  suggestions written to ${report.suggestionsPath}`);
  }

  if (!report.ok) {
    console.error('\nmodel-audit: FAILED');
    for (const failure of report.failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log('model-audit: passed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
