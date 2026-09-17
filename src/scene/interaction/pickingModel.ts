import type { Object3D } from 'three';
import type { Bounds3 } from '../../catalog/vectors';
import type { OrganelleRecord } from '../../catalog/types';

/**
 * The pick-proxy model: layer, geometry, registry and the priority rule.
 *
 * Kept apart from `Picking.tsx` so every decision here is a unit test with no renderer: the box
 * arithmetic, which records are outer envelopes, and which hit wins. The React file only wires
 * these into pointer events.
 */

/**
 * The layer the hit volumes live on, and the only layer the pick ray tests.
 *
 * The camera renders layer 0, so a proxy is never drawn — the hit volumes cost **zero draw calls**
 * instead of one each. The ray is pointed at this layer alone, so it can never test an organelle
 * mesh even if one later acquires a handler.
 */
export const PICK_LAYER = 1;

/** Hit volumes are slightly larger than the part so a small organelle is not a pixel-hunt. */
export const PICK_PROXY_INFLATION = 1.08;

export interface PickProxyTransform {
  center: [number, number, number];
  size: [number, number, number];
}

/**
 * Where the hit box sits and how big it is, from a build's bounds.
 *
 * The box has to contain the organelle, and a degenerate axis (a flat crista sheet, a single
 * lamella) still needs a hittable thickness, so every axis carries a floor.
 */
export function pickProxyTransform(
  bounds: Bounds3,
  inflation = PICK_PROXY_INFLATION,
  minimumExtent = 0.02,
): PickProxyTransform {
  const span = (min: number, max: number): number => {
    const extent = (max - min) * inflation;

    return extent > minimumExtent ? extent : minimumExtent;
  };

  return {
    center: [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ],
    size: [
      span(bounds.min[0], bounds.max[0]),
      span(bounds.min[1], bounds.max[1]),
      span(bounds.min[2], bounds.max[2]),
    ],
  };
}

/**
 * True for a record that *is* the cell's outer boundary.
 *
 * This is not a new concept: the catalog already writes the outer envelope as the record that
 * never separates (`distance: 0`) and sits at the cell origin. The membrane and the cell wall are
 * exactly those records, and their hit boxes contain every other organelle — so testing them first
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
 * Which organelle a ray hits, from every proxy it crossed.
 *
 * **The rule that makes the cell clickable:** the nearest *inner* organelle wins, and an outer
 * envelope is picked only when nothing inside it was. A translucent membrane is something the user
 * looks *through*; treating its front face as the answer would make the whole cell one big
 * membrane button and no organelle reachable. Picking by distance alone is what the browser check
 * caught, and this is the fix.
 */
export function choosePick(hits: readonly PickHit[]): string | null {
  if (hits.length === 0) {
    return null;
  }

  const byDistance = [...hits].sort((a, b) => a.distance - b.distance);
  const inner = byDistance.find((hit) => !hit.envelope);

  return (inner ?? byDistance[0]!).organelleId;
}

export interface PickVolumeEntry {
  readonly object: Object3D;
  readonly organelleId: string;
  readonly envelope: boolean;
}

const VOLUMES = new Map<string, PickVolumeEntry>();

export function registerPickVolume(entry: PickVolumeEntry): void {
  VOLUMES.set(entry.organelleId, entry);
}

export function unregisterPickVolume(organelleId: string): void {
  VOLUMES.delete(organelleId);
}

export function clearPickVolumes(): void {
  VOLUMES.clear();
}

export function pickVolumeObjects(): Object3D[] {
  return [...VOLUMES.values()].map((entry) => entry.object);
}

export function pickVolumeIds(): string[] {
  return [...VOLUMES.keys()];
}

/** The priority rule applied to a raw raycast result, keyed through the registry. */
export function choosePickFromObjects(
  intersections: readonly { distance: number; object: Object3D }[],
): string | null {
  const byObject = new Map<Object3D, PickVolumeEntry>(
    [...VOLUMES.values()].map((entry) => [entry.object, entry]),
  );
  const hits: PickHit[] = [];

  for (const intersection of intersections) {
    const entry = byObject.get(intersection.object);

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
