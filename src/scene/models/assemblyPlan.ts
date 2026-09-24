import { Box3, Euler, Mesh, Vector3, type Object3D } from 'three';
import type {
  CellId,
  CellModelFrame,
  MaterialKeyName,
  ModelManifest,
} from '../../catalog/types';
import type { Bounds3 } from '../../catalog/vectors';
import { resolveManifestRows } from './manifestLookup';
/**
 * The scene-assembly arithmetic for a loaded cell model (design D23/D24, tasks 13.1/13.2).
 *
 * Two facts are computed here, both from the committed model plus the committed manifest, and both
 * **once per load** — never per frame:
 *
 * 1. **The cell frame.** A source model is authored in its own units and centred on its own origin
 *    (the animal's raw bounding box is about 590 units across). {@link applyCellFrame} writes the
 *    manifest's `{scale, rotation, center}` onto the parsed root so the model lands centred on the
 *    scene origin at roughly one scene unit of radius — the scale the composed camera, orbit clamp,
 *    isolate framing and disassembly distances were all authored against.
 * 2. **The record plans.** The animal model's node names are material-derived
 *    (`Nulo__Material.013_0`), so a consumer cannot guess which meshes belong to which catalog
 *    record; the manifest is the mapping. {@link partitionRecordMeshes} resolves each mesh to its
 *    record through the manifest and computes that record's **union** bounds — one box for a
 *    seven-mesh nucleus, and one box that contains both mitochondrial meshes, which is what makes
 *    the organelle travel as a single unit under disassembly (design D29).
 *
 * Both are pure over a three.js `Object3D` graph, so they are unit-testable in Node with hand-built
 * meshes: no GLB, no WebGL context, no meshopt decoder.
 */

/** One mesh the manifest maps to a catalog record, with the material key it was assigned. */
export interface PlannedMesh {
  mesh: Mesh;
  materialKey: MaterialKeyName;
}

/** One record's meshes plus the geometry facts scene assembly needs about them. */
export interface RecordMeshPlan {
  recordId: string;
  meshes: PlannedMesh[];
  /** The union of the meshes' bounds, in the model root's normalised space (scene units). */
  bounds: Bounds3;
  /** The centre of that union, in the same space. */
  center: [number, number, number];
}

/**
 * The process part-name vocabulary a mesh stands in for (tasks 5.2/6.4, unchanged).
 *
 * The process animations find the surfaces they animate **by the builder's stable part names**
 * (`crista-`, `nuclear-envelope`, …) — that is the documented seam in `partMesh`/`structure.ts`, and
 * it is deliberately a naming contract rather than a lookup table inside each process. A model mesh
 * arrives named after its GLB node, which is a material index and means nothing to a process, so the
 * host renames the mesh it reparents to the name the equivalent procedural part would have carried.
 *
 * This is a **bridge, not a process change**: no process module is touched, and none of this is
 * consulted by disassembly, picking or the annotations, which address records by id. A key with no
 * entry is simply left under its GLB name.
 *
 * **`membrane` and `cytoplasm` are deliberately absent.** Naming the model's boundary shells would
 * make the animal cytokinesis pinch them, and the pinch is a **vertex write**: it calls
 * `captureRestPose`, which requires a plain `BufferAttribute`. gltfpack interleaves those two
 * meshes' attributes, and the sequence throws on an `InterleavedBufferAttribute` — an uncaught
 * error that unmounts the whole viewer. Leaving the shells under their GLB names makes mitosis fall
 * back to its undeformed path instead, which is the honest state until the process step lands.
 */
export const PROCESS_PART_NAME_BY_MATERIAL_KEY: Partial<Record<MaterialKeyName, string>> = {
  innerMembrane: 'crista-0',
  nuclearEnvelope: 'nuclear-envelope',
  nucleolus: 'nucleolus',
};

/**
 * Writes the manifest's per-model frame onto a parsed model root (design D23).
 *
 * three composes a node as `world = T + R · S · v`, so the source centre maps to the scene origin
 * exactly when `T = -(R · S · centre)`. Both committed models carry an identity rotation, but the
 * rotation is applied rather than assumed away — a future model with a corrected up-axis must not
 * silently land off-centre.
 *
 * The world matrices are refreshed so a caller can immediately read `matrixWorld` for bounds work.
 */
export function applyCellFrame(root: Object3D, frame: CellModelFrame): void {
  const rotation = new Euler(frame.rotation[0], frame.rotation[1], frame.rotation[2], 'XYZ');

  root.quaternion.setFromEuler(rotation);
  root.scale.setScalar(frame.scale);
  root.position
    .set(frame.center[0], frame.center[1], frame.center[2])
    .multiply(root.scale)
    .applyEuler(rotation)
    .negate();

  root.updateWorldMatrix(true, true);
}

function emptyBounds(): Bounds3 {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function expandBounds(bounds: Bounds3, box: Box3): void {
  bounds.min[0] = Math.min(bounds.min[0], box.min.x);
  bounds.min[1] = Math.min(bounds.min[1], box.min.y);
  bounds.min[2] = Math.min(bounds.min[2], box.min.z);
  bounds.max[0] = Math.max(bounds.max[0], box.max.x);
  bounds.max[1] = Math.max(bounds.max[1], box.max.y);
  bounds.max[2] = Math.max(bounds.max[2], box.max.z);
}

function boundsCentre(bounds: Bounds3): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

/** Translates a box, returning a fresh value (the catalog's `Bounds3`, not a `Box3`). */
export function shiftBounds(bounds: Bounds3, offset: readonly [number, number, number]): Bounds3 {
  return {
    min: [bounds.min[0] + offset[0], bounds.min[1] + offset[1], bounds.min[2] + offset[2]],
    max: [bounds.max[0] + offset[0], bounds.max[1] + offset[1], bounds.max[2] + offset[2]],
  };
}

/**
 * Groups a model root's meshes by the catalog record the manifest maps them to.
 *
 * Occurrence is the ordinal among meshes sharing a node name **in traversal order**, which is the
 * same order the manifest lists them in — so the four chromatin meshes and three ribosome meshes
 * resolve to distinct rows. A mesh whose row is `omit`, `unmapped`, or absent is skipped: it has no
 * record, and design D26 is explicit that no label may be invented for it.
 *
 * Bounds are read in the root's normalised space, so {@link applyCellFrame} must run first. Every
 * mesh is included in its record's union whatever its own transform — the eight corner expansion
 * inside `Box3.expandByObject` is what keeps a rotated or scaled mesh's box honest.
 */
export function partitionRecordMeshes(
  root: Object3D,
  cell: CellId,
  manifest: ModelManifest,
): Map<string, RecordMeshPlan> {
  root.updateWorldMatrix(true, true);

  const byRecord = new Map<string, PlannedMesh[]>();
  const boxes = new Map<string, Bounds3>();
  // Runtime names are sanitised by `GLTFLoader`; the resolver is what turns them back into rows.
  const rowByMesh = resolveManifestRows(root, cell, manifest);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }

    const row = rowByMesh.get(object);

    if (!row || row.policy !== 'map' || row.recordId === null || row.materialKey === null) {
      return;
    }

    const planned = byRecord.get(row.recordId) ?? [];

    planned.push({ mesh: object, materialKey: row.materialKey });
    byRecord.set(row.recordId, planned);

    const union = boxes.get(row.recordId) ?? emptyBounds();

    expandBounds(union, new Box3().setFromObject(object));
    boxes.set(row.recordId, union);
  });

  const plans = new Map<string, RecordMeshPlan>();

  for (const [recordId, meshes] of byRecord) {
    const bounds = boxes.get(recordId)!;

    plans.set(recordId, { recordId, meshes, bounds, center: boundsCentre(bounds) });
  }

  return plans;
}

/**
 * Where one record's meshes sit once they are reparented under a root placed at `target`, and how
 * far the group has to be shifted so its **union centre** lands exactly on that root's origin.
 *
 * `recentre` is the offset that makes the union centre coincide with the record's declared
 * placement, so the record behaves like every procedural record: disassembly translates the root,
 * isolate frames the placement, and the pick proxy is sized from the record's own bounds.
 */
export interface RecordAssembly {
  /** Added to the record root's own local position so the union centre sits at its origin. */
  recentre: [number, number, number];
  /** The pick/anchor bounds, in the record root's local space (centred on its origin). */
  localBounds: Bounds3;
  /** The annotation anchor offset: the top-centre of the union box, in the root's local space. */
  anchorOffset: Vector3;
}

export function planRecordAssembly(
  plan: RecordMeshPlan,
  target: readonly [number, number, number],
): RecordAssembly {
  const recentre: [number, number, number] = [
    target[0] - plan.center[0],
    target[1] - plan.center[1],
    target[2] - plan.center[2],
  ];
  const localBounds = shiftBounds(plan.bounds, [
    -plan.center[0],
    -plan.center[1],
    -plan.center[2],
  ]);

  return {
    recentre,
    localBounds,
    anchorOffset: new Vector3(
      0,
      plan.bounds.max[1] - plan.center[1],
      0,
    ),
  };
}
