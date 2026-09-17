import type { BuilderId } from '../../catalog/types';
import { buildCellWall } from './cell-wall';
import { buildChloroplast } from './chloroplast';
import { buildCytoplasm } from './cytoplasm';
import { buildEndoplasmicReticulum } from './er';
import { buildGolgi } from './golgi';
import { buildLysosome } from './lysosome';
import { buildMembrane } from './membrane';
import { buildMitochondrion } from './mitochondrion';
import { buildNucleus } from './nucleus';
import { buildRibosome } from './ribosome';
import { buildVacuole } from './vacuole';
import type { OrganelleBuild } from './primitives';

/**
 * The builder extension point.
 *
 * The catalog's `geometry.builder` id resolves here. Adding an organelle is one record plus
 * one line in this map — no viewer, palette, i18n, or quiz change (design D2).
 *
 * The map holds **pure geometry factories**, not React components. Design D2 sketches them as
 * components, but a factory keeps the deterministic-identity and triangle/draw-call budgets
 * unit-testable in Node, with no WebGL context; the React host (M1d's `OrganelleHost`) consumes
 * the result. Same extension point, testable side.
 *
 * `BuilderId` is the catalog's declared vocabulary (`src/catalog/types.ts`), not a local type.
 * M1b registered the seven shared organelles and M1c / PR 4 registered the plant three
 * (chloroplast, vacuole, cell wall), so this map now covers the **whole declared vocabulary** and
 * `catalog/integrity.ts`'s pending allowlist is empty.
 */

export type { BuilderId };

export type OrganelleBuilder = (params?: Record<string, number | string | boolean>) => OrganelleBuild;

export const BUILDER_REGISTRY: Partial<Record<BuilderId, OrganelleBuilder>> = {
  membrane: buildMembrane,
  cytoplasm: buildCytoplasm,
  nucleus: buildNucleus,
  mitochondrion: buildMitochondrion,
  'endoplasmic-reticulum': buildEndoplasmicReticulum,
  golgi: buildGolgi,
  ribosome: buildRibosome,
  lysosome: buildLysosome,
  chloroplast: buildChloroplast,
  vacuole: buildVacuole,
  'cell-wall': buildCellWall,
};

/**
 * The builders that actually exist today.
 *
 * Named distinctly from `catalog/types.ts`'s `BUILDER_IDS` (the *declared* vocabulary) on
 * purpose: two lists with the same name, one of them partial, is how a resolution check gets
 * miswired. `catalog/integrity.ts` takes this list as data.
 */
export const REGISTERED_BUILDER_IDS = Object.keys(BUILDER_REGISTRY) as BuilderId[];

const REGISTERED: ReadonlySet<string> = new Set<string>(REGISTERED_BUILDER_IDS);

export function isBuilderId(value: string): value is BuilderId {
  return REGISTERED.has(value);
}

export function getBuilder(id: string): OrganelleBuilder {
  const builder = isBuilderId(id) ? BUILDER_REGISTRY[id] : undefined;

  if (!builder) {
    throw new Error(
      `No builder registered for "${id}". Registered builders: ${REGISTERED_BUILDER_IDS.join(', ')}`,
    );
  }

  return builder;
}
