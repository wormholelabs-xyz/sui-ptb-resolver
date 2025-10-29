/**
 * Validate that a number is within range
 * @param value - Number to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @param name - Name for error message
 * @throws Error if value is out of range
 */
export function validateRange(value: number, min: number, max: number, name = 'value'): void {
  if (value < min || value > max) {
    throw new Error(`${name} out of range: ${value} (expected ${min}-${max})`);
  }
}

/**
 * Find index of separator byte in array
 * @param bytes - Bytes to search
 * @param separator - Byte to find (default: 0xff)
 * @returns Index of separator, or -1 if not found
 */
export function findSeparator(bytes: Uint8Array, separator = 0xff): number {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === separator) return i;
  }
  return -1;
}

/**
 * Split bytes at separator
 * @param bytes - Bytes to split
 * @param separator - Byte to split on (default: 0xff)
 * @returns Array of byte segments
 */
export function splitBytes(bytes: Uint8Array, separator = 0xff): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let start = 0;

  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === separator) {
      parts.push(bytes.slice(start, i));
      start = i + 1;
    }
  }

  if (start < bytes.length) {
    parts.push(bytes.slice(start));
  }

  return parts;
}
