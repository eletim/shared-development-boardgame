export type RngSeed = string | number;

const fnv1a = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export class SeededRng {
  private state: number;

  constructor(readonly seed: RngSeed) {
    this.state = fnv1a(String(seed)) || 0x9e3779b9;
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer");
    }
    return this.nextUint32() % maxExclusive;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty list");
    return items[this.nextInt(items.length)];
  }

  chance(numerator: number, denominator: number): boolean {
    if (denominator <= 0 || numerator < 0 || numerator > denominator) {
      throw new Error("Invalid chance ratio");
    }
    return this.nextInt(denominator) < numerator;
  }
}
