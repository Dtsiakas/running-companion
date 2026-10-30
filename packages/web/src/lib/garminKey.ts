import type { SettingsResponse } from '../api/hooks.ts';
import { f, m } from './i18n.ts';

/** What's true about the key, and the one thing to do about it, if anything. `where` says where to paste a new one. */
export function keySentence(garmin: SettingsResponse['garmin'], where: string = m.settings.where.inSettings): string {
  const s = m.settings.sentence;
  const date = garmin.expiresOn ? f.dayMonthYear(garmin.expiresOn) : '';
  switch (garmin.state) {
    case 'missing':
      return s.missing(where);
    case 'rejected':
      return s.rejected;
    case 'expired':
      return s.expired(date, where);
    case 'expiring':
      return s.expiring(garmin.daysLeft ?? 0, date, where);
    case 'ok':
      if (garmin.source === 'file') return s.file;
      if (garmin.source === 'environment') return s.environment;
      return garmin.expiresOn ? s.validUntil(date) : s.noDate(where);
  }
}
