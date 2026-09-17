import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import type { OrganelleMaterialKey } from './builders/primitives';

/**
 * Materials for the M0 organelle.
 *
 * Design D4 makes the palette the colour source of truth (`catalog/palettes.ts`, task 8.1)
 * and the record never carries a colour. That module does not exist yet, so M0 pins the
 * placeholder values here and the viewer reads them through this factory; when 8.1 lands it
 * replaces this module and nothing else changes.
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
} as const;

export type OrganelleMaterials = Record<OrganelleMaterialKey, Material> & {
  dispose: () => void;
};

export function createOrganelleMaterials(): OrganelleMaterials {
  const shell = new MeshPhysicalMaterial({
    color: M0_COLORS.outerMembrane,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    transparent: true,
    opacity: 0.46,
    side: DoubleSide,
    // The fold geometry inside the shell must not be depth-culled by the shell itself.
    depthWrite: false,
  });

  const folds = new MeshStandardMaterial({
    color: M0_COLORS.innerMembrane,
    roughness: 0.62,
    metalness: 0,
    // The folds are thin sheets: without DoubleSide their backfaces vanish.
    side: DoubleSide,
  });

  return {
    outerMembrane: shell,
    innerMembrane: folds,
    dispose: () => {
      shell.dispose();
      folds.dispose();
    },
  };
}
