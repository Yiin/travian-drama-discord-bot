import { describe, it, expect } from 'vitest';
import { parseCoords } from './parse-coords';

describe('parseCoords', () => {
  it('parses simple coordinates', () => {
    expect(parseCoords('123|456')).toEqual({ x: 123, y: 456 });
    expect(parseCoords('123 456')).toEqual({ x: 123, y: 456 });
    expect(parseCoords('(123|456)')).toEqual({ x: 123, y: 456 });
  });

  it('parses negative coordinates', () => {
    expect(parseCoords('61|-145')).toEqual({ x: 61, y: -145 });
    expect(parseCoords('-61|145')).toEqual({ x: -61, y: 145 });
    expect(parseCoords('-61|-145')).toEqual({ x: -61, y: -145 });
    expect(parseCoords('(61|-145)')).toEqual({ x: 61, y: -145 });
  });

  it('handles Unicode minus signs', () => {
    // U+2212 MINUS SIGN
    expect(parseCoords('61|−145')).toEqual({ x: 61, y: -145 });
    // U+2013 EN DASH
    expect(parseCoords('61|–145')).toEqual({ x: 61, y: -145 });
    // U+2014 EM DASH
    expect(parseCoords('61|—145')).toEqual({ x: 61, y: -145 });
  });

  it('handles Unicode directional formatting characters', () => {
    // Real Discord input with LTR override (U+202D) and POP (U+202C) characters
    // This is the literal string: !def (‭28‬|‭−‭45‬‬) 2000
    const discordInput = '(‭28‬|‭−‭45‬‬)';
    expect(parseCoords(discordInput)).toEqual({ x: 28, y: -45 });
  });

  it('parses URL with coordinates', () => {
    expect(parseCoords('https://example.com?x=123&y=456')).toEqual({ x: 123, y: 456 });
    expect(parseCoords('https://example.com?x=-61&y=-145')).toEqual({ x: -61, y: -145 });
  });

  it('returns null for invalid input', () => {
    expect(parseCoords('abc')).toBeNull();
    expect(parseCoords('123')).toBeNull();
    expect(parseCoords('')).toBeNull();
  });
});
