import { useState } from 'react';
import { askClaude, type ClaudeRequest } from '../lib/prompts.ts';
import styles from './AskClaude.module.css';

/**
 * Buttons that open Claude with a ready request. The work happens in Claude, on your subscription, through the
 * connector, and the answer stays in your Claude chat.
 */
export function AskClaude({ requests }: { requests: ClaudeRequest[] }) {
  const [message, setMessage] = useState<string | null>(null);

  const open = async (request: ClaudeRequest) => {
    const copied = await askClaude(request);
    setMessage(copied === 'copied' ? `Opened Claude with “${request.label}”. If the message box is empty, paste: it’s on your clipboard.` : `Opened Claude with “${request.label}”.`);
  };

  return (
    <div className={styles.ask}>
      <ul className={styles.list}>
        {requests.map((request) => (
          <li key={request.id}>
            <button type="button" className={styles.request} onClick={() => void open(request)}>
              <span className={styles.label}>{request.label}</span>
              <span className={styles.hint}>{request.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
