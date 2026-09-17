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

/** Design D12: cap the device pixel ratio at 2; the quality tier lowers it further. */
export const DPR_CAP = 2;

/** Design D1/D12: one downsampled HDRI-equivalent environment, 1024. */
export const ENVIRONMENT_RESOLUTION = 1024;

export const RENDERER_SETTINGS = {
  toneMapping: TONE_MAPPING,
  toneMappingExposure: TONE_MAPPING_EXPOSURE,
  outputColorSpace: OUTPUT_COLOR_SPACE,
} as const;
