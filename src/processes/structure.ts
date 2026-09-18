import {
  Box3,
  InstancedMesh,
  Matrix3,
  Matrix4,
  Mesh,
  Quaternion,
  Sphere,
  Vector3,
  type Object3D,
} from 'three';import {
  createSeededNoise,
  sampleSurfacePoints,
  type SeededNoise,
} from '../scene/builders/primitives';

/**
 * Reading the built structure a process animates on (tasks 5.2/5.3).
 *
 * "Respiration happens **on the cristae**" and "photosynthesis happens **on the grana**" are
 * teaching claims about *where* the animation is, so the animation must be placed on the real
 * surfaces the builders produced — not on a generic cloud inside the organelle's bounding box. That
 * means the process has to find the parts and read their geometry, and this module is the only
 * place that does it.
 *
 * Three deliberate properties:
 *
 * 1. **The part names are the builders' own.** `PartMesh` writes each part's name onto its
 *    `Object3D`, and the names come from `primitives.ts`'s documented "stable name, unique inside a
 *    build". A test asserts the builders really publish the names this module queries, so a
 *    renamed part fails the build instead of silently animating in the wrong place.
 * 2. **Everything is resolved into the organelle root's local space.** The instance is parented to
 *    the organelle root (so it follows disassembly and isolation for free), which means its
 *    coordinates have to be root-relative. A part that carries its own transform is folded in
 *    rather than assumed away.
 * 3. **Determinism is seeded.** Surface sampling uses the project's seeded `MeshSurfaceSampler`
 *    wrapper, so the same organelle gets the same sites on every load, in every cell, and inside
 *    every fixture.
 */

/** The prefix the mitochondrion builder gives its folds. */
export const CRISTA_PART_PREFIX = 'crista-';
/** The one part the chloroplast builder instances every granum into. */
export const GRANA_PART_NAME = 'grana-stacks';

/** Every part of a build, named, in traversal order. Only meshes are returned. */
export function findParts(root: Object3D, matches: (name: string) => boolean): Object3D[] {
  const found: Object3D[] = [];

  root.traverse((child) => {
    if ((child instanceof Mesh || child instanceof InstancedMesh) && matches(child.name)) {
      found.push(child);
    }
  });

  return found;
}

/** The mitochondrion's folds, in build order. */
export function findCristae(root: Object3D): Object3D[] {
  return findParts(root, (name) => name.startsWith(CRISTA_PART_PREFIX));
}

/** The chloroplast's instanced grana stacks, or an empty list when the build has none. */
export function findGrana(root: Object3D): Object3D[] {
  return findParts(root, (name) => name === GRANA_PART_NAME);
}

/**
 * The matrix that maps an object's own local space into the organelle root's local space.
 *
 * Both matrices are refreshed here on purpose: a process can be built from an effect that runs
 * before the renderer's own update pass, and a stale `matrixWorld` would place every site at the
 * world origin. `updateWorldMatrix` walks the ancestors, so the root's own placement is included.
 */
export function rootLocalMatrixOf(object: Object3D, root: Object3D): Matrix4 {
  root.updateWorldMatrix(true, true);
  object.updateWorldMatrix(true, false);

  return new Matrix4().copy(root.matrixWorld).invert().multiply(object.matrixWorld);
}

export interface StructureSite {
  /** The point on the surface, in the organelle root's local space. */
  position: Vector3;
  /** The outward surface normal at that point, in the organelle root's local space, normalised. */
  normal: Vector3;
  /**
   * Which part of `parts` the site came from, by index.
   *
   * Consumers key their animation phase on this: sites that share a part are one structure (one
   * crista, one fold), and a wave that travels structure by structure needs to know which structure
   * a molecule belongs to without re-deriving it from the sampling order.
   */
  part: number;
}

const NORMAL_ROTATION = new Matrix3();

/**
 * Seeded points on the surfaces of a set of parts, expressed in the root's local space.
 *
 * `perPart` sites are sampled from each part, so a twelve-fold mitochondrion gets twelve groups of
 * sites rather than twelve sites somewhere in the organelle. The normal is rotated by the inverse
 * transpose of the part's transform (three's `Matrix3.getNormalMatrix`), which is the correct
 * transform for a direction under a non-uniform scale.
 */
export function samplePartSites(
  parts: readonly Object3D[],
  perPart: number,
  root: Object3D,
  noise: SeededNoise = createSeededNoise('process/structure/v1'),
): StructureSite[] {
  const sites: StructureSite[] = [];

  for (const [part, object] of parts.entries()) {
    const geometry = (object as Mesh).geometry;

    if (!geometry) {
      continue;
    }

    const toRoot = rootLocalMatrixOf(object, root);
    NORMAL_ROTATION.getNormalMatrix(toRoot);

    for (const sample of sampleSurfacePoints(geometry, perPart, noise)) {
      sites.push({
        position: sample.position.clone().applyMatrix4(toRoot),
        normal: sample.normal.clone().applyMatrix3(NORMAL_ROTATION).normalize(),
        part,
      });
    }
  }

  return sites;
}

/** One granum, as the instanced mesh actually places it. */
export interface InstancePlacement {
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}

const PLACEMENT_MATRIX = new Matrix4();

/**
 * The placements of an `InstancedMesh`, read from its own instance buffer.
 *
 * The grana are one instanced part — one draw call for every granum in the organelle (skill:
 * `InstancedMesh` gate) — so the individual grana only exist as matrices. Reading them back is what
 * lets the photosynthesis flow start on the grana that were actually built instead of on a pattern
 * this module invents.
 */
export function readInstancePlacements(object: Object3D): InstancePlacement[] {
  if (!(object instanceof InstancedMesh)) {
    return [];
  }

  const placements: InstancePlacement[] = [];

  for (let index = 0; index < object.count; index += 1) {
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();

    object.getMatrixAt(index, PLACEMENT_MATRIX);
    PLACEMENT_MATRIX.decompose(position, quaternion, scale);
    placements.push({ position, quaternion, scale });
  }

  return placements;
}

/**
 * The parts' combined bounding radius around their own centre — the scale unit this module's
 * consumers use for distances (how far an ATP molecule drifts, how far an emitted molecule travels).
 *
 * Measured from the geometry rather than taken from a builder constant so a record that changes
 * `size` keeps an animation that fits inside it. Positions are transformed into the root's local
 * space first, for the same reason as the site sampling.
 */
export function partsBounds(parts: readonly Object3D[], root: Object3D): Box3 | null {
  const box = new Box3();

  for (const part of parts) {
    const geometry = (part as Mesh).geometry;

    if (!geometry) {
      continue;
    }

    geometry.computeBoundingBox();

    const bounds = geometry.boundingBox;

    if (!bounds) {
      continue;
    }

    const toRoot = rootLocalMatrixOf(part, root);

    // All eight corners, not just min and max: a part that carries a rotation transforms its two
    // extreme corners somewhere that no longer bounds the box, so two corners under-report.
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          box.expandByPoint(new Vector3(x, y, z).applyMatrix4(toRoot));
        }
      }
    }
  }

  return box.isEmpty() ? null : box;
}

export function partsRadius(parts: readonly Object3D[], root: Object3D): number {
  const box = partsBounds(parts, root);

  return box === null ? 0 : box.getBoundingSphere(new Sphere()).radius;
}

/**
 * The centre of the parts' combined bounds, in the root's local space.
 *
 * The reproduction sequence needs the **nucleus's** own centre rather than a catalog constant: the
 * chromosomes condense inside the envelope it was actually built with, and the nucleus sits at a
 * different place in the plant cell (pressed to the periphery by the vacuole). Reading it from the
 * geometry is what keeps that placement a catalog fact instead of a second copy of the same number.
 */
export function partsCentre(parts: readonly Object3D[], root: Object3D): Vector3 {
  const box = partsBounds(parts, root);

  return box === null ? new Vector3() : box.getCenter(new Vector3());
}
