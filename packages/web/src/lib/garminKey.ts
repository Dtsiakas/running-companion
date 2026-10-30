import type { SettingsResponse } from '../api/hooks.ts';
import { longDay } from './dates.ts';

/** What's true about the key, and the one thing to do about it, if anything. */
export function keySentence(garmin: SettingsResponse['garmin'], where = 'in Settings'): string {
  const days = garmin.daysLeft;
  switch (garmin.state) {
    case 'missing':
      return `Without a key the app can’t get anything from your watch. Create one at Garmin Connect and paste it ${where}.`;
    case 'rejected':
      return 'The last sync was refused: the key is wrong, expired or deleted. New data stops until you add a new key.';
    case 'expired':
      return `It expired on ${longDay(garmin.expiresOn!)}. Create a new one and paste it ${where}.`;
    case 'expiring':
      return `It expires ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} (${longDay(garmin.expiresOn!)}). Create a new one before then and paste it ${where}; nothing is lost in between.`;
    case 'ok':
      if (garmin.source === 'file') return 'Using the key saved for Garmin’s own tools on this computer.';
      if (garmin.source === 'environment') return 'Using the key set on the server.';
      return garmin.expiresOn ? `Valid until ${longDay(garmin.expiresOn)}.` : `No expiry date entered, so the app can’t remind you before it runs out. Add it ${where}.`;
  }
}
