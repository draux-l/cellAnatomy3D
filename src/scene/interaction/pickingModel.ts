import type { Object3D } from 'three';
import type { OrganelleRecord } from '../../catalog/types';

/**
 * The pick model: layer, registry, readiness and the priority rule.
 *
 * Kept apart from `Picking.tsx` so every decision here is a unit test with no renderer: which records
 * are outer envelopes, which hit wins, and whether the spatial index is armed. The React file only
 * wires these into pointer events.
 *
 * ## Geometry, not boxes
 *
 * The previous model raycast **one inflated box per record** (design D7). That is cheap but wrong for
 * this model: the mitochondrial outer membrane is a single mesh holding several ovals scattered across
 * the cell (bounds ≈417×302×539 model units — nearly the whole cell), so its box covers its
 * neighbours and wins wherever they overlap. The measured symptom was every interior probe resolving
 * to "Mitocondrias".
 *
 * The replacement raycasts the **real triangles**, accelerated by a per-geometry `MeshBVH` built once
 * when the model loads (`pickBvh.ts`). A ray now reports what is genuinely under the cursor. The
 * priority rule below survives because it is still the correct reading of a translucent envelope: the
 * membrane and the cytoplasm are surfaces the user looks *through*, not the answer.
 */

/**
 * The layer the pick ray tests.
 *
 * The real meshes keep the render layer (0) **and** enable this one, so the camera still draws them
 * and the pick ray can still select them. Keeping a dedicated pick layer means the ray's layer mask is
 * explicit — a ray pointed at layer 0 would also test anything else that happens to live there.
 */
export const PICK_LAYER = 1;

/**
 * True for a record that *is* the cell's outer boundary.
 *
 * This is not a new concept: the catalog already writes the outer envelope as the record that
 * never separates (`distance: 0`) and sits at the cell origin. The membrane and the cytoplasm are
 * exactly those records, and their surfaces enclose every other organelle — so testing them first
 * would make every inner organelle unreachable.
 */
export function isOuterEnvelope(record: Pick<OrganelleRecord, 'disassembly' | 'position'>): boolean {
  const [x, y, z] = record.position;

  return (
    record.disassembly.distance === 0 && Math.hypot(x, y, z) <= 1e-6
  );
}

export interface PickHit {
  organelleId: string;
  /** True for an outer-envelope record (see `isOuterEnvelope`). */
  envelope: boolean;
  distance: number;
}

/**
 * Which organelle a ray hits, from every surface it crossed.
 *
 * **The rule that makes the cell clickable:** the nearest *inner* organelle wins, and an outer
 * envelope is picked only when nothing inside it was. The membrane and the cytoplasm are translucent
 * surfaces the user looks *through*; treating the nearest of them as the answer would make the whole
 * cell one big membrane button and no organelle reachable.
 *
 * With real geometry the fallback is also meaningful: when only envelopes were crossed, the nearest
 * one is whichever surface is genuinely frontmost — the membrane at the rim, the cytoplasm over the
 * open interior.
 */
export function choosePick(hits: readonly PickHit[]): string | null {
  if (hits.length === 0) {
    return null;
  }

  const byDistance = [...hits].sort((a, b) => a.distance - b.distance);
  const inner = byDistance.find((hit) => !hit.envelope);

  return (inner ?? byDistance[0]!).organelleId;
}

export interface PickTargetEntry {
  readonly object: Object3D;
  readonly organelleId: string;
  readonly envelope: boolean;
}

const TARGETS = new Map<Object3D, PickTargetEntry>();

/**
 * Whether the spatial index has finished building.
 *
 * The BVH is built when the model mounts, over successive frames so the main thread is never blocked
 * for the whole build. Until it is armed, a pick is **not attempted**: a half-built index would resolve
 * some organelles and silently miss others, and a wrong answer is worse than a brief no-answer.
 */
let READY = false;

export function isPickIndexReady(): boolean {
  return READY;
}

export function setPickIndexReady(ready: boolean): void {
  READY = ready;
}

export function registerPickTarget(entry: PickTargetEntry): void {
  TARGETS.set(entry.object, entry);
}

export function unregisterPickTarget(object: Object3D): void {
  TARGETS.delete(object);
}

export function clearPickTargets(): void {
  TARGETS.clear();
  READY = false;
}

/** The real meshes the pick ray tests, one entry per mesh (a record may own several). */
export function pickTargetObjects(): Object3D[] {
  return [...TARGETS.keys()];
}

export function pickTargetIds(): string[] {
  return [...new Set([...TARGETS.values()].map((entry) => entry.organelleId))];
}

/**
 * The meshes that can **occlude** an anchor, for the annotation layer (design D14).
 *
 * Two exclusions, and both are load-bearing:
 *
 * 1. **Outer envelopes never occlude.** The membrane and the cytoplasm enclose every other organelle,
 *    so treating them as occluders would mark almost every annotation occluded — de-emphasizing ink
 *    for no visual reason.
 * 2. **The annotation's own organelle never occludes itself.** The anchor sits on that part's surface.
 *
 * What remains is the honest reading of "a part whose anchor sits behind the cell body": another
 * inner organelle stands between the camera and the anchor.
 */
export function occluderObjects(organelleId: string): Object3D[] {
  return [...TARGETS.values()]
    .filter((entry) => !entry.envelope && entry.organelleId !== organelleId)
    .map((entry) => entry.object);
}

/** The priority rule applied to a raw raycast result, keyed through the registry. */
export function choosePickFromObjects(
  intersections: readonly { distance: number; object: Object3D }[],
): string | null {
  const hits: PickHit[] = [];

  for (const intersection of intersections) {
    const entry = TARGETS.get(intersection.object);

    if (entry) {
      hits.push({
        organelleId: entry.organelleId,
        envelope: entry.envelope,
        distance: intersection.distance,
      });
    }
  }

  return choosePick(hits);
}
