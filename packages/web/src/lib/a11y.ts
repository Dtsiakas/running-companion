/**
 * Props for a box that scrolls sideways (a wide table on a phone): keyboard users can focus it and scroll with the
 * arrow keys, and screen readers announce what it holds. Without them the overflow is reachable by mouse or touch only.
 */
export const scrollRegion = (label: string) => ({ tabIndex: 0, role: 'region', 'aria-label': label }) as const;
