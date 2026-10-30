/**
 * The two server-rendered pages: login (dashboard) and consent (Claude connector).
 * Plain HTML with no scripts, so they work before the dashboard exists and can't be broken by it.
 * Every interpolated value goes through escapeHtml.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Running Companion</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f6f3; --card: #fff; --text: #1d1d1b; --muted: #6b6b66; --accent: #2f6f4f; --border: #ddddd6; --error: #a33; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151614; --card: #1e201d; --text: #ecece6; --muted: #9c9d95; --accent: #6fbf8f; --border: #33352f; --error: #e88; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
  main { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: var(--muted); margin: 0 0 20px; }
  label { display: block; font-size: 14px; margin-bottom: 6px; }
  input[type=password] { width: 100%; padding: 10px 12px; font: inherit; color: inherit; background: transparent; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; }
  .actions { display: flex; gap: 8px; }
  button { flex: 1; padding: 10px; font: inherit; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
  button.secondary { background: transparent; color: var(--text); border-color: var(--border); }
  .error { color: var(--error); margin-bottom: 16px; }
  strong { color: var(--text); }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function loginPage({ next, error }: { next: string; error?: string }): string {
  return layout(
    'Log in',
    `<h1>Running Companion</h1>
<p>Log in to see your dashboard.</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/login">
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
  <div class="actions"><button type="submit">Log in</button></div>
</form>`,
  );
}

export function consentPage({ requestId, clientName, redirectHost, needsPassword, error }: {
  requestId: string;
  clientName: string;
  redirectHost: string;
  needsPassword: boolean;
  error?: string;
}): string {
  return layout(
    'Allow access',
    `<h1>Allow ${escapeHtml(clientName)}?</h1>
<p><strong>${escapeHtml(clientName)}</strong> (${escapeHtml(redirectHost)}) wants to read your training and health data and run Garmin syncs.</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/oauth/consent">
  <input type="hidden" name="request" value="${escapeHtml(requestId)}">
  ${needsPassword ? '<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>' : ''}
  <div class="actions">
    <button type="submit" name="action" value="deny" class="secondary" formnovalidate>Deny</button>
    <button type="submit" name="action" value="approve">Allow</button>
  </div>
</form>`,
  );
}

export function messagePage(title: string, message: string): string {
  return layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}
