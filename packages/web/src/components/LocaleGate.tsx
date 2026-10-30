import { useQueryClient } from '@tanstack/react-query';
import { Fragment, type ReactNode } from 'react';
import { setLocaleChoice, useLocaleVersion, type LangChoice, type UnitsChoice } from '../lib/i18n.ts';

/** Re-renders everything below when the language or units change. */
export function LocaleGate({ children }: { children: ReactNode }) {
  const version = useLocaleVersion();
  return <Fragment key={version}>{children}</Fragment>;
}

/**
 * Changes language or units. Cached server data goes first: the server wrote some of its sentences and paces in the
 * previous language and units, and no screen should mix the two.
 */
export function useChangeLocale() {
  const client = useQueryClient();
  return (choice: { language?: LangChoice; units?: UnitsChoice }) => {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'settings' });
    setLocaleChoice(choice);
  };
}
