import type { RouteResponse } from '@companion/queries';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { clock } from '../../lib/format.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import { createMap, isDark, type MapConfig, mix } from './base.ts';
import styles from './map.module.css';

const BUCKETS = 8;

/**
 * The run's route coloured by pace: the app's one-hue effort ramp, strong for your fastest stretches and pale for the
 * slowest, scaled to this run's own range (10th to 90th percentile) so an easy run shows its variation too.
 * Default export so the map library loads only when a run page opens.
 */
export default function RouteMap({ route, config }: { route: NonNullable<RouteResponse>; config: MapConfig }) {
  const element = useRef<HTMLDivElement>(null);
  const colors = useThemeColors();
  const [fast, slow] = route.pace_range ?? [0, 0];

  useEffect(() => {
    if (!element.current) return;
    const map = createMap(element.current, isDark(), config);
    const colourOf = (pace: number | null) => {
      if (pace === null || slow <= fast) return colors['--ink-3'];
      const t = Math.min(1, Math.max(0, (pace - fast) / (slow - fast)));
      // Quantised, so consecutive points share a colour and the route is a few dozen lines, not hundreds.
      const step = Math.round(t * (BUCKETS - 1)) / (BUCKETS - 1);
      return mix(colors['--intensity-high'], colors['--intensity-low'], step);
    };
    // A wider line in the page colour underneath keeps the route readable over busy streets.
    L.polyline(route.points, { color: colors['--surface'], weight: 7, opacity: 0.9, interactive: false }).addTo(map);
    let start = 0;
    for (let i = 1; i <= route.points.length; i++) {
      const colour = colourOf(route.pace[start] ?? null);
      if (i === route.points.length || colourOf(route.pace[i] ?? null) !== colour) {
        L.polyline(route.points.slice(start, i + 1), { color: colour, weight: 4, opacity: 1, lineCap: 'round', interactive: false }).addTo(map);
        start = i;
      }
    }
    const first = route.points[0]!;
    const last = route.points.at(-1)!;
    L.circleMarker(last, { radius: 6, color: colors['--surface'], weight: 2, fillColor: colors['--ink'], fillOpacity: 1 }).bindTooltip('Finish').addTo(map);
    L.circleMarker(first, { radius: 6, color: colors['--ink'], weight: 2, fillColor: colors['--surface'], fillOpacity: 1 }).bindTooltip('Start').addTo(map);
    map.fitBounds(route.bounds, { padding: [16, 16] });
    return () => {
      map.remove();
    };
  }, [route, colors, fast, slow, config]);

  return (
    <figure className={styles.figure}>
      <div ref={element} className={styles.map} role="img" aria-label="Map of the route, coloured by pace" />
      {route.pace_range ? (
        <figcaption className={styles.scale}>
          <span>{clock(fast)}</span>
          <i style={{ background: `linear-gradient(to right, ${colors['--intensity-high']}, ${colors['--intensity-low']})` }} />
          <span>{clock(slow)} /km</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
