const rotate = (word: number, count: number) => (word >>> count) | (word << (32 - count));

// prettier-ignore
export function sha256(value: string): string {
  const bytes = [...new TextEncoder().encode(value)], bitLength = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0); for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(bitLength / 2 ** shift) & 255);
  const words = new Uint32Array(64), hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), constants: number[] = [];
  for (let candidate = 2; constants.length < 64; candidate += 1) { let prime = true; for (let divisor = 2; divisor * divisor <= candidate; divisor += 1) if (candidate % divisor === 0) prime = false; if (prime) constants.push(Math.floor((Math.cbrt(candidate) % 1) * 2 ** 32) >>> 0); }
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = ((bytes[offset + index * 4]! << 24) | (bytes[offset + index * 4 + 1]! << 16) | (bytes[offset + index * 4 + 2]! << 8) | bytes[offset + index * 4 + 3]!) >>> 0;
    for (let index = 16; index < 64; index += 1) { const x = words[index - 15]!, y = words[index - 2]!; words[index] = (words[index - 16]! + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[index - 7]! + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0; }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) { const first = (h! + (rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + constants[index]! + words[index]!) >>> 0, second = ((rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0; [a, b, c, d, e, f, g, h] = [(first + second) >>> 0, a, b, c, (d! + first) >>> 0, e, f, g]; }
    [a, b, c, d, e, f, g, h].forEach((part, index) => (hash[index] = (hash[index]! + part!) >>> 0));
  }
  return [...hash].map((word) => word.toString(16).padStart(8, "0")).join("");
}
