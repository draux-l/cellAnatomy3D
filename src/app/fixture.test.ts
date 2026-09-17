import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORGANELLE_ID,
  FIXTURE_POSES,
  HERO_POSE,
  parseFixture,
} from './fixture';

describe('parseFixture', () => {
  it('leaves the real app running when no fixture is requested', () => {
    const config = parseFixture('');

    expect(config.name).toBeNull();
    expect(config.freezeClock).toBe(false);
    expect(config.showLabels).toBe(true);
    expect(config.organelleId).toBe(DEFAULT_ORGANELLE_ID);
    expect(config.frozenTime).toBe(0);
    expect(config.camera).toBe(HERO_POSE);
  });

  it('freezes the clock and the labels for the organelle fixture', () => {
    const config = parseFixture('?fixture=organelle&id=mitochondrion');

    expect(config.name).toBe('organelle');
    expect(config.freezeClock).toBe(true);
    expect(config.showLabels).toBe(false);
    expect(config.organelleId).toBe('mitochondrion');
    expect(config.camera).toBe(FIXTURE_POSES.organelle);
  });

  it('accepts both parameter names the artifacts use for the organelle', () => {
    expect(parseFixture('?fixture=organelle&id=nucleus').organelleId).toBe('nucleus');
    expect(parseFixture('?fixture=organelle&organelle=nucleus').organelleId).toBe('nucleus');
  });

  it('ignores an unknown fixture instead of half-freezing the app', () => {
    const config = parseFixture('?fixture=nope&id=mitochondrion');

    expect(config.name).toBeNull();
    expect(config.freezeClock).toBe(false);
    expect(config.showLabels).toBe(true);
  });

  it('reads a frozen time but falls back to zero when it is unusable', () => {
    expect(parseFixture('?fixture=organelle&t=12.5').frozenTime).toBe(12.5);
    expect(parseFixture('?fixture=organelle&t=-3').frozenTime).toBe(0);
    expect(parseFixture('?fixture=organelle&t=abc').frozenTime).toBe(0);
  });

  it('lets the caller supply the fallback organelle id', () => {
    expect(parseFixture('', { defaultOrganelleId: 'nucleus' }).organelleId).toBe('nucleus');
    expect(parseFixture('?fixture=organelle', { defaultOrganelleId: 'nucleus' }).organelleId).toBe(
      'nucleus',
    );
  });
});
