/** One-line description of a JSON value's shape, for the discovery report. */
export function describeShape(value: unknown): string {
  if (value === null || value === undefined) return 'empty';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'empty array';
    const first = value[0];
    const keys = first && typeof first === 'object' && !Array.isArray(first) ? Object.keys(first) : [];
    return `array of ${value.length}${keys.length ? `, item keys: ${preview(keys)}` : ''}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? `object, keys: ${preview(keys)}` : 'empty object';
  }
  return typeof value;
}

/** True when the response holds no actual data (null, empty array, object of only nulls/empties). */
export function isEmptyData(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(isEmptyData);
  return false;
}

function preview(keys: string[], max = 12): string {
  return keys.length > max ? `${keys.slice(0, max).join(', ')}, … (+${keys.length - max})` : keys.join(', ');
}
