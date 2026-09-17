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
 */

export type BuilderId = 'mitochondrion';

export type OrganelleBuilder = (params?: Record<string, number | string | boolean>) => OrganelleBuild;

export const BUILDER_REGISTRY = {
  mitochondrion: buildMitochondrion,
} satisfies Record<BuilderId, OrganelleBuilder>;

export const BUILDER_IDS = Object.keys(BUILDER_REGISTRY) as BuilderId[];

export function isBuilderId(value: string): value is BuilderId {
  return Object.prototype.hasOwnProperty.call(BUILDER_REGISTRY, value);
}

export function getBuilder(id: string): OrganelleBuilder {
  if (!isBuilderId(id)) {
    throw new Error(
      `No builder registered for "${id}". Registered builders: ${BUILDER_IDS.join(', ')}`,
    );
  }

  return BUILDER_REGISTRY[id];
}
