/**
 * The `?fixture=` route.
 *
 * The metric harness cannot compare animated WebGL pixels across machines, so a fixture
 * freezes the two things that would otherwise drift: the camera pose and the clock.
 * Geometry is already seed-locked by the catalog, and the third control — no floating
 * labels — is carried by `showLabels`, which the M1 label layer reads.
 */

export type FixtureName = 'organelle';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** The hero pose every fixture and the landing view share. */
export const HERO_POSE: CameraPose = {
  position: [1.35, 1.0, 2.9],
  target: [0, 0, 0],
  fov: 35,
};

/** Named poses. M1b adds one per organelle; M0 has a single isolated organelle. */
export const FIXTURE_POSES: Record<FixtureName, CameraPose> = {
  organelle: HERO_POSE,
};

/** The only organelle that exists in M0. M1a replaces this with the catalog roster. */
export const DEFAULT_ORGANELLE_ID = 'mitochondrion';

const FIXTURE_NAMES: readonly string[] = ['organelle'];

export interface FixtureConfig {
  /** Active fixture, or null when the real app should run. */
  name: FixtureName | null;
  organelleId: string;
  /** Seconds the clock is pinned at. Always 0 for M0's static fixtures. */
  frozenTime: number;
  freezeClock: boolean;
  /** False under a fixture so nothing floats between two runs. */
  showLabels: boolean;
  camera: CameraPose;
}

export interface ParseFixtureOptions {
  /** Fallback organelle id when the URL does not name one. */
  defaultOrganelleId?: string;
}

function isFixtureName(value: string | null): value is FixtureName {
  return value !== null && FIXTURE_NAMES.includes(value);
}

function parseFrozenTime(raw: string | null): number {
  if (raw === null) {
    return 0;
  }

  const parsed = Number.parseFloat(raw);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Reads a query string into a fixture config. An unknown `fixture` value is ignored, so a
 * typo renders the real app instead of a half-frozen one.
 */
export function parseFixture(search: string, options: ParseFixtureOptions = {}): FixtureConfig {
  const params = new URLSearchParams(search);
  const rawName = params.get('fixture');
  const name = isFixtureName(rawName) ? rawName : null;

  // tasks.md writes `?fixture=organelle&id=…`; design.md writes `&organelle=…`.
  // Accept both so neither artifact's example is wrong.
  const organelleId =
    params.get('id') ?? params.get('organelle') ?? options.defaultOrganelleId ?? DEFAULT_ORGANELLE_ID;

  return {
    name,
    organelleId,
    frozenTime: parseFrozenTime(params.get('t')),
    freezeClock: name !== null,
    showLabels: name === null,
    camera: name ? FIXTURE_POSES[name] : HERO_POSE,
  };
}
