import { useQueryClient } from '@tanstack/react-query';
import { Fragment, type ReactNode } from 'react';
import { setLocaleChoice, useLocaleVersion, type LangChoice } from '../lib/i18n.ts';

/** Re-renders everything below when the language changes. */
export function LocaleGate({ children }: { children: ReactNode }) {
  const version = useLocaleVersion();
  return <Fragment key={version}>{children}</Fragment>;
}

/**
 * Changes the language. Cached server data goes first: the server wrote some of its sentences in the previous
 * language, and no screen should mix the two.
 */
export function useChangeLocale() {
  const client = useQueryClient();
  return (choice: { language?: LangChoice }) => {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'settings' });
    setLocaleChoice(choice);
  };
}
