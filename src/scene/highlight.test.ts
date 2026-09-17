import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DIMMED_OPACITY_FACTOR,
  HIGHLIGHT_EMISSIVE,
  HIGHLIGHT_EMISSIVE_INTENSITY,
  RESTING_EMISSIVE,
  applyEmphasis,
  emphasisFor,
  prepareEmphasis,
} from './highlight';

/**
 * Hover highlight and isolate de-emphasis.
 *
 * Two claims matter and both are asserted rather than assumed: exactly one organelle can be in a
 * highlight, and de-emphasis is always relative to the palette's own opacity — so returning to
 * rest restores the value the material was created with, not a previously emphasized one.
 */

describe('emphasisFor', () => {
  it('highlights exactly one organelle at a time', () => {
    const ids = ['mitochondrion', 'golgi', 'nucleus', 'er'];

    const modes = ids.map((id) => emphasisFor(id, 'golgi', null));

    expect(modes.filter((mode) => mode === 'hovered')).toEqual(['hovered']);
    expect(modes).toEqual(['base', 'hovered', 'base', 'base']);
  });

  it('dims everything except the isolated organelle', () => {
    expect(emphasisFor('golgi', null, 'golgi')).toBe('base');
    expect(emphasisFor('nucleus', null, 'golgi')).toBe('dimmed');
  });

  it('lets hover win over the isolate dimming', () => {
    // Answering "what is this?" with a dimmer version of the same answer would be worse than
    // showing it.
    expect(emphasisFor('nucleus', 'nucleus', 'golgi')).toBe('hovered');
  });

  it('never treats a null hover as a match', () => {
    expect(emphasisFor('mitochondrion', null, null)).toBe('base');
  });
});

describe('applyEmphasis', () => {
  it('adds emissive on hover and returns it to black at rest', () => {
    const material = prepareEmphasis(new MeshStandardMaterial({ color: '#ffffff' }));

    applyEmphasis(material, 'hovered');
    expect(material.emissive.getHexString()).toBe(HIGHLIGHT_EMISSIVE.replace('#', ''));
    expect(material.emissiveIntensity).toBeCloseTo(HIGHLIGHT_EMISSIVE_INTENSITY, 6);

    applyEmphasis(material, 'base');
    expect(material.emissive.getHexString()).toBe(RESTING_EMISSIVE.replace('#', ''));
    expect(material.emissiveIntensity).toBe(1);
  });

  it('dims and restores the material\'s own opacity, not the last mode\'s', () => {
    const shell = prepareEmphasis(new MeshPhysicalMaterial({ opacity: 0.22, transparent: true }));

    applyEmphasis(shell, 'dimmed');
    expect(shell.opacity).toBeCloseTo(0.22 * DIMMED_OPACITY_FACTOR, 6);

    applyEmphasis(shell, 'base');
    expect(shell.opacity).toBeCloseTo(0.22, 6);
  });

  it('is idempotent, so a repeated store change cannot compound the dimming', () => {
    const material = prepareEmphasis(new MeshPhysicalMaterial({ opacity: 0.5, transparent: true }));

    applyEmphasis(material, 'dimmed');
    applyEmphasis(material, 'dimmed');
    applyEmphasis(material, 'dimmed');

    expect(material.opacity).toBeCloseTo(0.5 * DIMMED_OPACITY_FACTOR, 6);
  });

  it('makes an opaque body translucent when it is de-emphasized', () => {
    const body = prepareEmphasis(new MeshStandardMaterial({ opacity: 1, transparent: false }));

    applyEmphasis(body, 'dimmed');

    expect(body.transparent).toBe(true);
    expect(body.opacity).toBeLessThan(1);
  });

  it('records the resting opacity once, even if prepare runs again later', () => {
    const material = new MeshStandardMaterial({ opacity: 0.4, transparent: true });

    prepareEmphasis(material);
    applyEmphasis(material, 'dimmed');
    prepareEmphasis(material);

    expect(material.userData.cellBaseOpacity).toBeCloseTo(0.4, 6);
  });
});
