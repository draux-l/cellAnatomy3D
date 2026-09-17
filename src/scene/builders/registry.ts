import type { BuilderId } from '../../catalog/types';
import { buildMitochondrion } from './mitochondrion';
import type { OrganelleBuild } from './primitives';

/**
 * The builder extension point.
 *
 * The catalog's `geometry.builder` id resolves here. Adding an organelle is one record plus
 * one line in this map — no viewer, palette, i18n, or quiz change (design D2).
 *
 * The map holds **pure geometry factories**, not React components. Design D2 sketches them as
 * components, but a factory keeps the deterministic-identity and triangle/draw-call budgets
 * unit-testable in Node, with no WebGL context; the React host (M1's `OrganelleHost`) consumes
 * the result. Same extension point, testable side.
 *
 * `BuilderId` is the catalog's declared vocabulary (`src/catalog/types.ts`), not a local type.
 * This map is deliberately **partial** while the builders land across PR 3 and PR 4: the
 * catalog declares all ten ids, and `integrity.ts` validates record *data* against that
 * vocabulary without resolving it here. Task 3.2 adds registry-resolution validation once this
 * map covers the catalog — until then, a partial registry must not be able to fail the build.
 */

export type { BuilderId };

export type OrganelleBuilder = (params?: Record<string, number | string | boolean>) => OrganelleBuild;

export const BUILDER_REGISTRY: Partial<Record<BuilderId, OrganelleBuilder>> = {
  mitochondrion: buildMitochondrion,
};

/** The builders that actually exist today. */
export const BUILDER_IDS = Object.keys(BUILDER_REGISTRY) as BuilderId[];

const REGISTERED_BUILDER_IDS: ReadonlySet<string> = new Set<string>(BUILDER_IDS);

export function isBuilderId(value: string): value is BuilderId {
  return REGISTERED_BUILDER_IDS.has(value);
}

export function getBuilder(id: string): OrganelleBuilder {
  const builder = isBuilderId(id) ? BUILDER_REGISTRY[id] : undefined;

  if (!builder) {
    throw new Error(
      `No builder registered for "${id}". Registered builders: ${BUILDER_IDS.join(', ')}`,
    );
  }

  return builder;
}
