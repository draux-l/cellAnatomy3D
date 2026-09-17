import { DoubleSide, FrontSide, Material, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { ORGANELLE_MATERIAL_KEYS } from './builders/primitives';
import { M0_COLORS, createOrganelleMaterials } from './materials';

describe('createOrganelleMaterials', () => {
  const materials = createOrganelleMaterials();

  it('covers every material key a builder can ask for', () => {
    for (const key of ORGANELLE_MATERIAL_KEYS) {
      expect(materials[key]).toBeInstanceOf(Material);
    }
  });

  it('colours the outer and inner membrane from the M0 placeholder values', () => {
    const shell = materials.outerMembrane as MeshStandardMaterial;
    const folds = materials.innerMembrane as MeshStandardMaterial;

    expect(shell.color.getHexString()).toBe(M0_COLORS.outerMembrane.replace('#', ''));
    expect(folds.color.getHexString()).toBe(M0_COLORS.innerMembrane.replace('#', ''));
  });

  it('colours each new surface from the placeholder table', () => {
    const pairs: [keyof typeof materials, string][] = [
      ['membrane', M0_COLORS.membrane],
      ['nuclearEnvelope', M0_COLORS.nuclearEnvelope],
      ['nucleolus', M0_COLORS.nucleolus],
      ['nuclearPore', M0_COLORS.nuclearPore],
      ['granule', M0_COLORS.granule],
      ['lysosome', M0_COLORS.lysosome],
      ['er', M0_COLORS.er],
      ['golgi', M0_COLORS.golgi],
      ['vesicle', M0_COLORS.vesicle],
      ['chloroplast', M0_COLORS.chloroplast],
      ['grana', M0_COLORS.grana],
      ['cellWall', M0_COLORS.cellWall],
      ['vacuole', M0_COLORS.vacuole],
    ];

    for (const [key, hex] of pairs) {
      const material = materials[key] as MeshStandardMaterial;

      expect(material.color.getHexString()).toBe(hex.replace('#', ''));
    }
  });

  it('keeps the outer membrane translucent so the folds stay legible', () => {
    const shell = materials.outerMembrane as MeshStandardMaterial;

    expect(shell.transparent).toBe(true);
    expect(shell.opacity).toBeGreaterThan(0);
    expect(shell.opacity).toBeLessThan(1);
  });

  it('keeps every boundary shell translucent and depth-write-free', () => {
    // Every surface that encloses something else: the cell membrane, the nuclear envelope and the
    // three plant boundaries. All of them must be `transparent` + `opacity`, never `transmission`.
    for (const key of ['membrane', 'nuclearEnvelope', 'chloroplast', 'cellWall', 'vacuole'] as const) {
      const shell = materials[key] as MeshStandardMaterial;

      expect(shell.transparent).toBe(true);
      expect(shell.opacity).toBeGreaterThan(0);
      expect(shell.opacity).toBeLessThan(0.5);
      expect(shell.depthWrite).toBe(false);
    }
  });

  /*
   * The shells are single-sided because every one of them is a geometrically closed surface — the
   * closure is asserted independently in `builders/shell-closure.test.ts`. `DoubleSide` on a
   * transparent, depth-write-free shell shades each covered pixel twice for no shape benefit, and
   * measured ~35% of the frame (44.1 -> 59.5 fps p50 on the animal cell). These two assertions exist
   * so a future shell cannot silently reintroduce the cost.
   */
  it('renders every boundary shell single-sided', () => {
    for (const key of [
      'outerMembrane',
      'membrane',
      'nuclearEnvelope',
      'chloroplast',
      'cellWall',
      'vacuole',
    ] as const) {
      expect(materials[key].side).toBe(FrontSide);
    }
  });

  it('keeps the shells on the standard shader path, never the physical one', () => {
    // `transmission` is banned, so a shell uses no `MeshPhysicalMaterial` feature at all. The
    // physical path still cost ~11% over the standard path with clearcoat already at 0.
    for (const key of [
      'outerMembrane',
      'membrane',
      'nuclearEnvelope',
      'chloroplast',
      'cellWall',
      'vacuole',
    ] as const) {
      expect(materials[key]).not.toBeInstanceOf(MeshPhysicalMaterial);
    }
  });

  it('never enables transmission (the most expensive fill-rate option available)', () => {
    for (const key of ORGANELLE_MATERIAL_KEYS) {
      const material = materials[key] as MeshPhysicalMaterial & { transmission?: number };

      expect(material.transmission ?? 0).toBe(0);
    }
  });

  it('renders the thin folds double-sided', () => {
    expect(materials.innerMembrane.side).toBe(DoubleSide);
  });

  it('keeps the nucleolus opaque and distinct from the envelope that hides it', () => {
    const envelope = materials.nuclearEnvelope as MeshStandardMaterial;
    const nucleolus = materials.nucleolus as MeshStandardMaterial;

    expect(nucleolus.transparent).toBe(false);
    expect(nucleolus.color.getHexString()).not.toBe(envelope.color.getHexString());
  });

  it('renders small granules flat-shaded', () => {
    expect((materials.granule as MeshStandardMaterial).flatShading).toBe(true);
    expect((materials.lysosome as MeshStandardMaterial).flatShading).toBe(false);
  });

  it('disposes every material it created', () => {
    const fresh = createOrganelleMaterials();
    const disposed: string[] = [];

    for (const key of ORGANELLE_MATERIAL_KEYS) {
      fresh[key].addEventListener('dispose', () => {
        disposed.push(key);
      });
    }

    fresh.dispose();

    expect([...disposed].sort()).toEqual([...ORGANELLE_MATERIAL_KEYS].sort());
  });
});
