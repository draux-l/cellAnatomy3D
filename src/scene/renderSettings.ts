import { NeutralToneMapping, SRGBColorSpace } from 'three';

/**
 * Renderer settings that are product rules, not preferences.
 *
 * `NeutralToneMapping` (Khronos PBR Neutral) is hue-preserving, which is the only reason
 * the palette swatch in the UI can match the rendered organelle. ACES shifts hue, so an
 * ACES pipeline would turn "the blue in the picker is not the blue on the model" into an
 * accessibility bug. `renderSettings.test.ts` fails the build if ACES appears anywhere in
 * `src/`.
 *
 * React Three Fiber's default tone mapping is ACES, so the viewer must set this explicitly.
 */
export const TONE_MAPPING = NeutralToneMapping;
export const TONE_MAPPING_EXPOSURE = 1.0;
export const OUTPUT_COLOR_SPACE = SRGBColorSpace;

/**
 * Design D12: cap the device pixel ratio; the quality tier lowers it further.
 *
 * Lowered from 2 to 1.5 during the post-PR-5a remediation, at the maintainer's decision.
 * The evidence, from `verify/perf-probe.mjs` on the composed cells at dsf 2: the plant cell
 * measured 9.0 fps before the shell-material fix and 13.2 after — still unusable on the
 * reference machine's integrated GPU. DPR 2 costs 4x the pixels of DPR 1; 1.5 costs 2.25x.
 *
 * The renderer is fill-rate bound, not scene-graph bound: a cell wall with 1 draw call and
 * 448 triangles measured SLOWER (33.2 fps) than a mitochondrion with 15 calls and 13,058
 * triangles (46.3 fps). Pixel count is therefore the lever that actually moves frame time.
 */
export const DPR_CAP = 1.5;

/** Design D1/D12: one downsampled HDRI-equivalent environment, 1024. */
export const ENVIRONMENT_RESOLUTION = 1024;

export const RENDERER_SETTINGS = {
  toneMapping: TONE_MAPPING,
  toneMappingExposure: TONE_MAPPING_EXPOSURE,
  outputColorSpace: OUTPUT_COLOR_SPACE,
} as const;
