import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACESFilmicToneMapping, NeutralToneMapping, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DPR_CAP,
  ENVIRONMENT_RESOLUTION,
  OUTPUT_COLOR_SPACE,
  RENDERER_SETTINGS,
  TONE_MAPPING,
  TONE_MAPPING_EXPOSURE,
} from './renderSettings';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      sourceFiles(fullPath, found);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(fullPath);
    }
  }

  return found;
}

describe('renderer settings', () => {
  it('uses Khronos PBR Neutral tone mapping', () => {
    expect(TONE_MAPPING).toBe(NeutralToneMapping);
    expect(RENDERER_SETTINGS.toneMapping).toBe(NeutralToneMapping);
  });

  it('never falls back to ACES', () => {
    expect(TONE_MAPPING).not.toBe(ACESFilmicToneMapping);
  });

  it('pins exposure and sRGB output', () => {
    expect(TONE_MAPPING_EXPOSURE).toBe(1);
    expect(OUTPUT_COLOR_SPACE).toBe(SRGBColorSpace);
    expect(RENDERER_SETTINGS.outputColorSpace).toBe(SRGBColorSpace);
  });

  it('caps the device pixel ratio at 2 and resolves the environment at 1024', () => {
    expect(DPR_CAP).toBe(2);
    expect(ENVIRONMENT_RESOLUTION).toBe(1024);
  });

  it('does not mention ACES anywhere in src/', () => {
    const offenders = sourceFiles(SRC_ROOT)
      .filter((file) => !file.endsWith('renderSettings.test.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('ACESFilmicToneMapping'))
      .map((file) => relative(SRC_ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
