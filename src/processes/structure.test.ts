import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Object3D, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CRISTA_PART_PREFIX,
  GRANA_PART_NAME,
  findCristae,
  findGrana,
  findParts,
  partsRadius,
  readInstancePlacements,
  rootLocalMatrixOf,
  samplePartSites,
} from './structure';
import { mountOrganelle } from './partMount';

/**
 * Reading the built structure (tasks 5.2/5.3).
 *
 * "Respiration happens on the cristae" and "photosynthesis happens on the grana" are claims about
 * *where*, and they are only true if the animation is placed on the parts the builders actually
 * produced. So these tests are about the seam between the two: does the name the process looks for
 * exist on the mesh the viewer mounts, and does the site land where the part is?
 *
 * The part names are the builders' own (`MeshPart.name`), and the last test asserts that the
 * component which mounts the parts writes them onto the objects — because a rename there would
 * silently move every molecule to the organelle's centre.
 */

const MITOCHONDRION = 'mitochondrion';
/** The catalog's chloroplast id, kept as a constant so a rename fails loudly in one place. */
const CHLOROPLAST = 'chloroplast';

const PART_MESH_SOURCE = readFileSync(
  join(process.cwd(), 'src/scene/PartMesh.tsx'),
  'utf8',
);

describe('part lookup', () => {
  it('finds every crista of a built mitochondrion, by the builder\'s own names', () => {
    const mounted = mountOrganelle(MITOCHONDRION);

    try {
      const cristae = findCristae(mounted.root);

      expect(cristae.length).toBeGreaterThan(0);
      expect(cristae.length).toBe(mounted.build.parts.length - 1);

      for (const crista of cristae) {
        expect(crista.name.startsWith(CRISTA_PART_PREFIX)).toBe(true);
      }

      // The shell is not a fold and must not be treated as one.
      expect(findParts(mounted.root, (name) => name === 'outer-membrane').length).toBe(1);
      expect(cristae.some((part) => part.name === 'outer-membrane')).toBe(false);
    } finally {
      mounted.dispose();
    }
  });

  it('finds the chloroplast\'s grana and nothing else', () => {
    const mounted = mountOrganelle(CHLOROPLAST, 'plant');

    try {
      const grana = findGrana(mounted.root);

      expect(grana).toHaveLength(1);
      expect(grana[0]?.name).toBe(GRANA_PART_NAME);
      expect(findCristae(mounted.root)).toEqual([]);
    } finally {
      mounted.dispose();
    }
  });

  it('returns nothing for an organelle that has neither structure', () => {
    const mounted = mountOrganelle('lysosome');

    try {
      expect(findGrana(mounted.root)).toEqual([]);
      expect(findCristae(mounted.root)).toEqual([]);
    } finally {
      mounted.dispose();
    }
  });

  it('mounts the parts under the names the process modules query', () => {
    // The seam this whole module depends on: `PartMesh` is the only place a part's identity reaches
    // the scene graph, so a change there must fail here rather than silently displace the animation.
    expect(PART_MESH_SOURCE).toContain('name={part.name}');
  });
});

describe('root-local resolution', () => {
  it('maps a part into the root\'s own space, placement included', () => {
    const root = new Object3D();
    const child = new Object3D();

    root.position.set(3, -2, 1);
    child.position.set(1, 0, 0);
    root.add(child);
    root.updateMatrixWorld(true);

    const toRoot = rootLocalMatrixOf(child, root);
    const mapped = new Vector3(0, 0, 0).applyMatrix4(toRoot);

    // The child sits one unit along its parent's x, expressed relative to the root: not world
    // coordinates, and not the child's own local origin.
    expect(mapped.x).toBeCloseTo(1);
    expect(mapped.y).toBeCloseTo(0);
    expect(mapped.z).toBeCloseTo(0);
  });
});

describe('surface sites', () => {
  it('places sites on each fold, and reports which fold each came from', () => {
    const mounted = mountOrganelle(MITOCHONDRION);

    try {
      const cristae = findCristae(mounted.root);
      const sites = samplePartSites(cristae, 3, mounted.root);

      expect(sites).toHaveLength(cristae.length * 3);
      // Every fold contributed, and the indices are the fold indices — the phase key the animation
      // uses to make the reaction travel from fold to fold.
      expect(new Set(sites.map((site) => site.part))).toEqual(
        new Set(cristae.map((_part, index) => index)),
      );

      for (const site of sites) {
        expect(site.normal.length()).toBeCloseTo(1, 5);
      }

      // Root-local, not world: the mitochondrion sits at (-0.52, -0.3, 0.26) in the animal cell, so
      // a bug that skipped the inverse transform would centre every site around that offset.
      const radius = partsRadius(cristae, mounted.root);

      for (const site of sites) {
        expect(site.position.length()).toBeLessThan(radius * 1.05);
      }
    } finally {
      mounted.dispose();
    }
  });

  it('samples the same sites twice from the same seed', () => {
    const mounted = mountOrganelle(MITOCHONDRION);

    try {
      const cristae = findCristae(mounted.root);
      const first = samplePartSites(cristae, 3, mounted.root);
      const second = samplePartSites(cristae, 3, mounted.root);

      expect(second.map((site) => site.position.toArray())).toEqual(
        first.map((site) => site.position.toArray()),
      );
    } finally {
      mounted.dispose();
    }
  });
});

describe('instance placements', () => {
  it('reads every granum back out of the instance buffer', () => {
    const mounted = mountOrganelle(CHLOROPLAST, 'plant');

    try {
      const grana = findGrana(mounted.root)[0]!;
      const placements = readInstancePlacements(grana);

      expect(placements).toHaveLength(5);

      for (const placement of placements) {
        expect(Number.isFinite(placement.position.y)).toBe(true);
        expect(placement.scale.x).toBeGreaterThan(0);
      }

      // The stacks really are spread along the organelle's axis rather than stacked at one point.
      const along = placements.map((placement) => placement.position.y);
      expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(0.3);
    } finally {
      mounted.dispose();
    }
  });

  it('returns nothing for a mesh with no instances', () => {
    const root = new Object3D();
    const plain = new Object3D();

    root.add(plain);

    expect(readInstancePlacements(plain)).toEqual([]);
  });
});

describe('bounding radius', () => {
  let mountedRadius = 0;

  beforeEach(() => {
    const mounted = mountOrganelle(MITOCHONDRION);

    try {
      mountedRadius = partsRadius(findCristae(mounted.root), mounted.root);
    } finally {
      mounted.dispose();
    }
  });

  it('is a positive, organelle-scale number', () => {
    // The catalog's mitochondrion has `size: 0.3`, so a radius near 0.3 is expected and a value near
    // 1.0 would mean the root's own placement leaked into the measurement.
    expect(mountedRadius).toBeGreaterThan(0.15);
    expect(mountedRadius).toBeLessThan(0.45);
  });

  it('is zero when there is nothing to measure, so callers can fall back', () => {
    expect(partsRadius([], new Object3D())).toBe(0);
  });
});

