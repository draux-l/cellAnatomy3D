import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import { ORGANELLE_MATERIAL_KEYS, type OrganelleMaterialKey } from './builders/primitives';

/**
 * Materials for the M1b organelle set.
 *
 * Design D4 makes the palette the colour source of truth (`catalog/palettes.ts`, task 8.1)
 * and the record never carries a colour. That module does not exist yet, so the placeholder
 * values are pinned here and the viewer reads them through this factory; when 8.1 lands it
 * replaces this module and nothing else changes.
 *
 * `M0_COLORS` keeps its name on purpose: those two values are the M0 mitochondrion's identity and
 * have not moved. The rest of the table is new, grouped by the palette role each surface stands
 * in for — `membrane` role for the boundary shells, `nucleus` role for the nuclear layers,
 * `organelles` role for the bodies inside the cytosol.
 *
 * Two banned-technique guards live here and are unit-tested: no `transmission` (the single
 * biggest fill-rate cost available) and no ACES tone mapping anywhere in `src/`.
 */

export const M0_COLORS = {
  background: '#07090c',
  /** Outer (smooth) mitochondrial membrane. Translucent so the cristae stay legible. */
  outerMembrane: '#b4694a',
  /** Inner membrane folds — the teaching object for respiration. */
  innerMembrane: '#e9b783',
  /** Cool rim light keeps the silhouette readable against the dark background. */
  rimLight: '#9ec6ff',

  /** `membrane` palette role: the cell's own thin boundary. */
  membrane: '#7fa8cc',
  /** `nucleus` palette role, outer layer. Translucent so the nucleolus reads through it. */
  nuclearEnvelope: '#9b7fc4',
  /** `nucleus` palette role, the dense body. Opaque and dark: it must be unmistakable. */
  nucleolus: '#5b3f8c',
  /** `nucleus` palette role, pore rings and other envelope detail. */
  nuclearPore: '#cbb6ea',
  /** `organelles` palette role, small granules (ribosomes). */
  granule: '#d8c27a',
  /** `organelles` palette role, the digestive vesicle. */
  lysosome: '#cf7f5c',
  /** `organelles` palette role, the folded membrane network. */
  er: '#8fae85',
  /** `organelles` palette role, the stacked cisternae. */
  golgi: '#c9a05a',
  /** `organelles` palette role, the budding transport vesicles. */
  vesicle: '#e0c489',
} as const satisfies Record<string, string>;

export type OrganelleMaterials = Record<OrganelleMaterialKey, Material> & {
  dispose: () => void;
};

/** Translucent shell settings shared by the two boundary layers. */
function createShell(color: string, opacity: number): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    transparent: true,
    opacity,
    side: DoubleSide,
    // Layers inside the shell must not be depth-culled by the shell itself.
    depthWrite: false,
  });
}

/** Opaque body settings: the default for anything the shell is protecting. */
function createBody(color: string, flatShading = false): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    flatShading,
  });
}

export function createOrganelleMaterials(): OrganelleMaterials {
  const materials: Record<OrganelleMaterialKey, Material> = {
    outerMembrane: createShell(M0_COLORS.outerMembrane, 0.46),
    innerMembrane: new MeshStandardMaterial({
      color: M0_COLORS.innerMembrane,
      roughness: 0.62,
      metalness: 0,
      // The folds are thin sheets: without DoubleSide their backfaces vanish.
      side: DoubleSide,
    }),
    membrane: createShell(M0_COLORS.membrane, 0.22),
    nuclearEnvelope: createShell(M0_COLORS.nuclearEnvelope, 0.3),
    nucleolus: createBody(M0_COLORS.nucleolus),
    nuclearPore: createBody(M0_COLORS.nuclearPore),
    // A 20-triangle granule gets its legibility from facets, not from vertex count.
    granule: createBody(M0_COLORS.granule, true),
    lysosome: createBody(M0_COLORS.lysosome),
    er: createBody(M0_COLORS.er),
    golgi: createBody(M0_COLORS.golgi),
    vesicle: createBody(M0_COLORS.vesicle),
  };

  return {
    ...materials,
    dispose: () => {
      for (const key of ORGANELLE_MATERIAL_KEYS) {
        materials[key].dispose();
      }
    },
  };
}
