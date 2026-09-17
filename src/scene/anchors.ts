import { Vector3, type Object3D } from 'three';
import { buildBounds } from '../catalog/vectors';
import type { OrganelleBuild } from './builders/primitives';

/**
 * Where each organelle's label anchor is, in world space.
 *
 * The annotation layer (PR 5b) projects an anchor per organelle every frame. That layer is plain
 * DOM and cannot walk the scene graph, so the scene publishes what it needs here: a **transient**
 * registry of `organelleId -> (root Object3D, local offset)`. Nothing in React state, nothing
 * per frame — a lookup and one matrix multiply.
 *
 * **Registered by identity, not by geometry.** The offset is computed from the organelle's built
 * bounding box rather than hand-authored, for the same reason `catalog/vectors.ts` computes travel
 * from built geometry: the anchor has to sit *on the part*, and the part is what the builder
 * produced. The top-centre of the box is the attachment point a leader line wants — it is the
 * silhouette's highest point, so the line does not have to cross the organelle to reach it.
 *
 * The registry is world-space-correct during orbit **and** disassembly because it stores the root
 * `Object3D` and reads its live `matrixWorld`; whatever moves the organelle moves the anchor.
 */

export interface OrganelleAnchor {
  readonly object: Object3D;
  readonly offset: Vector3;
}

const ANCHORS = new Map<string, OrganelleAnchor>();

/** The registry as data, for tests and for a diagnostic that needs to know what is published. */
export function registeredAnchorIds(): string[] {
  return [...ANCHORS.keys()];
}

/**
 * The registered root object for one organelle.
 *
 * The disassembly loop writes through this: it needs the same `Object3D` every other consumer
 * follows, and taking it from the registry is what keeps "the organelle" a single object rather
 * than a name looked up in two places.
 */
export function registeredOrganelleRoot(organelleId: string): Object3D | undefined {
  return ANCHORS.get(organelleId)?.object;
}

export function registerOrganelleAnchor(
  organelleId: string,
  object: Object3D,
  offset: Vector3,
): void {
  ANCHORS.set(organelleId, { object, offset: offset.clone() });
}

export function unregisterOrganelleAnchor(organelleId: string): void {
  ANCHORS.delete(organelleId);
}

export function clearOrganelleAnchors(): void {
  ANCHORS.clear();
}

/**
 * The anchor's local offset for one build: the top-centre of everything the record produced.
 *
 * "Everything" matters. A record's build is a list of parts — a nucleus is an envelope, a
 * nucleolus and a ring of pores — and the anchor must clear the union of them, not just the first
 * part, or the leader line would start inside the organelle.
 */
export function anchorOffsetFor(build: OrganelleBuild): Vector3 {
  const { min, max } = buildBounds(build.parts.map((part) => part.geometry));

  return new Vector3((min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2);
}

/**
 * The anchor in world space, or `null` when that organelle is not mounted.
 *
 * `target` is reused by the caller so a per-frame consumer allocates nothing.
 */
export function anchorWorldPosition(organelleId: string, target = new Vector3()): Vector3 | null {
  const anchor = ANCHORS.get(organelleId);

  if (!anchor) {
    return null;
  }

  // The root's parents may have moved (the cell group, the canvas group), and a fixture can
  // capture before the renderer's own update pass has run.
  anchor.object.updateWorldMatrix(true, false);

  return target.copy(anchor.offset).applyMatrix4(anchor.object.matrixWorld);
}
