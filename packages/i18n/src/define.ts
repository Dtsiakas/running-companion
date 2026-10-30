/**
 * One area of the app's text, in every language. English comes first and defines the shape; the Greek must match it
 * exactly (same keys, same parameters), so a missing or misnamed message is a type error, not a blank on screen.
 *
 * Messages are plain strings, or functions when they take values. Values arrive already formatted (a distance with its
 * unit, a date in the reader's language), so a translation only places them; it never formats numbers itself.
 */
export function define<T>(en: T, el: NoInfer<T>): { en: T; el: T } {
  return { en, el };
}

/** English and Greek both have just "one" and "other" plural forms. */
export const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);
