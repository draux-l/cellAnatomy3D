import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { M0_COLORS, createOrganelleMaterials } from './materials';

describe('createOrganelleMaterials', () => {
  const materials = createOrganelleMaterials();

  it('colours the outer and inner membrane from the placeholder palette values', () => {
    const shell = materials.outerMembrane as MeshPhysicalMaterial;
    const folds = materials.innerMembrane as MeshStandardMaterial;

    expect(shell.color.getHexString()).toBe(M0_COLORS.outerMembrane.replace('#', ''));
    expect(folds.color.getHexString()).toBe(M0_COLORS.innerMembrane.replace('#', ''));
  });

  it('keeps the outer membrane translucent so the folds stay legible', () => {
    const shell = materials.outerMembrane as MeshPhysicalMaterial;

    expect(shell.transparent).toBe(true);
    expect(shell.opacity).toBeGreaterThan(0);
    expect(shell.opacity).toBeLessThan(1);
    expect(shell.side).toBe(DoubleSide);
  });

  it('never enables transmission (the most expensive fill-rate option available)', () => {
    const shell = materials.outerMembrane as MeshPhysicalMaterial;

    expect(shell.transmission).toBe(0);
  });

  it('renders the thin folds double-sided', () => {
    expect(materials.innerMembrane.side).toBe(DoubleSide);
  });

  it('disposes both materials', () => {
    let disposed = 0;
    const shell = materials.outerMembrane;
    const folds = materials.innerMembrane;
    shell.addEventListener('dispose', () => {
      disposed += 1;
    });
    folds.addEventListener('dispose', () => {
      disposed += 1;
    });

    materials.dispose();

    expect(disposed).toBe(2);
  });
});
