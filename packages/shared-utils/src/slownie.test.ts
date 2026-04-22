import { describe, it, expect } from 'vitest';
import { slownie } from './slownie.js';

describe('slownie', () => {
  it('0.01 → zero złotych 01/100', () => {
    expect(slownie(0.01)).toBe('zero złotych 01/100');
  });

  it('0.00 → zero złotych 00/100', () => {
    expect(slownie(0)).toBe('zero złotych 00/100');
  });

  it('1.00 → jeden złoty 00/100', () => {
    expect(slownie(1)).toBe('jeden złoty 00/100');
  });

  it('2.00 → dwa złote 00/100', () => {
    expect(slownie(2)).toBe('dwa złote 00/100');
  });

  it('5.00 → pięć złotych 00/100', () => {
    expect(slownie(5)).toBe('pięć złotych 00/100');
  });

  it('21.00 → dwadzieścia jeden złotych 00/100', () => {
    expect(slownie(21)).toBe('dwadzieścia jeden złotych 00/100');
  });

  it('21.50 → dwadzieścia jeden złotych 50/100', () => {
    expect(slownie(21.5)).toBe('dwadzieścia jeden złotych 50/100');
  });

  it('12.00 (teen) → dwanaście złotych 00/100', () => {
    expect(slownie(12)).toBe('dwanaście złotych 00/100');
  });

  it('13.00 → trzynaście złotych 00/100', () => {
    expect(slownie(13)).toBe('trzynaście złotych 00/100');
  });

  it('100.00 → sto złotych 00/100', () => {
    expect(slownie(100)).toBe('sto złotych 00/100');
  });

  it('1000.00 → tysiąc złotych 00/100', () => {
    expect(slownie(1000)).toBe('tysiąc złotych 00/100');
  });

  it('1001.00 → tysiąc jeden złotych 00/100', () => {
    expect(slownie(1001)).toBe('tysiąc jeden złotych 00/100');
  });

  it('2000.00 → dwa tysiące złotych 00/100', () => {
    expect(slownie(2000)).toBe('dwa tysiące złotych 00/100');
  });

  it('5000.00 → pięć tysięcy złotych 00/100', () => {
    expect(slownie(5000)).toBe('pięć tysięcy złotych 00/100');
  });

  it('1000000.00 → jeden milion złotych 00/100', () => {
    expect(slownie(1_000_000)).toBe('jeden milion złotych 00/100');
  });

  it('2000000.00 → dwa miliony złotych 00/100', () => {
    expect(slownie(2_000_000)).toBe('dwa miliony złotych 00/100');
  });

  it('5000000.00 → pięć milionów złotych 00/100', () => {
    expect(slownie(5_000_000)).toBe('pięć milionów złotych 00/100');
  });

  it('canonical FV 1/2/2026: 3997.50', () => {
    expect(slownie(3997.50)).toBe('trzy tysiące dziewięćset dziewięćdziesiąt siedem złotych 50/100');
  });

  it('11000 (eleven thousand) → jedenaście tysięcy złotych 00/100', () => {
    expect(slownie(11_000)).toBe('jedenaście tysięcy złotych 00/100');
  });

  it('112.00 → sto dwanaście złotych 00/100', () => {
    expect(slownie(112)).toBe('sto dwanaście złotych 00/100');
  });

  it('1234.56 → tysiąc dwieście trzydzieści cztery złote 56/100', () => {
    expect(slownie(1234.56)).toBe('tysiąc dwieście trzydzieści cztery złote 56/100');
  });

  it('999999999.99 → large number without throwing', () => {
    const result = slownie(999_999_999.99);
    expect(result).toContain('złotych');
    expect(result).toContain('99/100');
  });

  it('supports negative amounts with minus prefix', () => {
    expect(slownie(-1)).toBe('minus jeden złoty 00/100');
  });

  it('supports negative grosze values with minus prefix', () => {
    expect(slownie(-1291.5)).toBe('minus tysiąc dwieście dziewięćdziesiąt jeden złotych 50/100');
  });

  it('throws for NaN', () => {
    expect(() => slownie(Number.NaN)).toThrow(RangeError);
  });

  it('throws for Infinity', () => {
    expect(() => slownie(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('floating point safety: 0.1 + 0.2', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS — must produce 30/100
    const result = slownie(0.1 + 0.2);
    expect(result).toBe('zero złotych 30/100');
  });
});
