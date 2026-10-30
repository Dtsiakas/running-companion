import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapConfig {
  provider: 'carto' | 'osm';
  key: string | null;
}

/**
 * Map tiles. With a CARTO key (free for personal use, CARTO_API_KEY in .env): CARTO's light or dark basemap to match
 * the app. Without one: OpenStreetMap's own tiles, which ask browsers to say which site the map is on, so tile
 * requests send the app's address (nothing else in the app sends one). OpenStreetMap has no dark style, so in dark mode
 * the tiles are inverted (see map.module.css). Like any online map, the tile server sees the area you look at; the
 * routes themselves are drawn in the browser and never sent anywhere.
 */
export function createMap(element: HTMLElement, dark: boolean, config: MapConfig): L.Map {
  // On a phone, one finger should scroll the page, not pan the map: panning is off on touch screens and the map is
  // fitted to the route, with the zoom buttons for a closer look.
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const map = L.map(element, { scrollWheelZoom: false, dragging: !touch, attributionControl: true, zoomSnap: 0.25 });
  const osm = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  if (config.provider === 'carto' && config.key) {
    const key = encodeURIComponent(config.key);
    const style = dark ? 'dark' : 'light';
    const tiles = (layer: string) => `https://{s}.basemaps.cartocdn.com/${style}_${layer}/{z}/{x}/{y}{r}.png?key=${key}`;
    L.tileLayer(tiles('nolabels'), { subdomains: 'abcd', maxZoom: 19, attribution: `${osm} © <a href="https://carto.com/attributions">CARTO</a>` }).addTo(map);
    // Place names in their own layer, above the streets and below the route, so dark mode can brighten them to
    // near-white (CARTO draws them dim grey) without washing out the map underneath (see map.module.css).
    map.createPane('labels');
    const pane = map.getPane('labels')!;
    pane.style.zIndex = '350';
    pane.style.pointerEvents = 'none';
    pane.dataset.labels = style;
    L.tileLayer(tiles('only_labels'), { subdomains: 'abcd', maxZoom: 19, pane: 'labels' }).addTo(map);
  } else {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: osm, referrerPolicy: 'strict-origin-when-cross-origin' }).addTo(map);
  }
  // Inverted tiles only for OpenStreetMap in dark mode; cleared otherwise, since the same element is reused.
  element.dataset.invert = String(dark && !(config.provider === 'carto' && config.key));
  map.attributionControl.setPrefix(false);
  return map;
}

/** Mix two #rrggbb colours: t = 0 gives a, t = 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export { isDarkTheme as isDark } from '../../lib/theme.ts';
