import type { PlacesResponse } from '@companion/queries';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import { createMap, isDark, type MapConfig } from './base.ts';
import styles from './map.module.css';

/** Every place you've started runs from, as a circle sized by how many runs began there. Tap one to open its latest run. */
export default function PlacesMap({ places, config }: { places: PlacesResponse; config: MapConfig }) {
  const element = useRef<HTMLDivElement>(null);
  const colors = useThemeColors();
  const navigate = useNavigate();

  useEffect(() => {
    if (!element.current || !places.length) return;
    const map = createMap(element.current, isDark(), config);
    const most = Math.max(...places.map((p) => p.runs));
    for (const place of places) {
      // Area, not radius, proportional to the count, so a place with 300 runs doesn't swallow the map.
      const radius = 5 + 15 * Math.sqrt(place.runs / most);
      L.circleMarker([place.lat, place.lon], { radius, color: colors['--surface'], weight: 2, fillColor: colors['--series-1'], fillOpacity: 0.85 })
        .bindTooltip(`${place.name ?? 'Run'}: ${place.runs} run${place.runs === 1 ? '' : 's'}, ${Math.round(place.km)} km`)
        .on('click', () => navigate(`/runs/${place.last_activity_id}`))
        .addTo(map);
    }
    map.fitBounds(
      places.map((p) => [p.lat, p.lon] as [number, number]),
      { padding: [24, 24], maxZoom: 13 },
    );
    return () => {
      map.remove();
    };
  }, [places, colors, navigate, config]);

  return <div ref={element} className={`${styles.map} ${styles.tall}`} role="img" aria-label={`Map of the ${places.length} places you’ve run`} />;
}
