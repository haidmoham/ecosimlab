/** Serializable deterministic PRNG. No calls to Math.random occur in the engine. */
export class Random {
  private value: number;

  constructor(seed = 0x9e3779b9) {
    this.value = seed >>> 0 || 0x6d2b79f5;
  }

  get state(): number { return this.value; }
  set state(value: number) { this.value = value >>> 0 || 0x6d2b79f5; }

  next(): number {
    let x = this.value;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.value = x >>> 0;
    return this.value / 0x1_0000_0000;
  }

  between(min: number, max: number): number { return min + this.next() * (max - min); }
  int(min: number, maxExclusive: number): number { return Math.floor(this.between(min, maxExclusive)); }

  // Box-Muller with intentionally uncached samples, making state restoration trivial.
  gaussian(): number {
    const u = Math.max(this.next(), Number.MIN_VALUE);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
