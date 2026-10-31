import { ENGLISH, type I18n } from '@companion/i18n';

type T = I18n['m']['pages'];

/**
 * The server-rendered pages: login (dashboard), first-start setup and consent (Claude connector), in the browser's
 * language (Accept-Language), since they come before the app and its language setting.
 * Plain HTML with no scripts, so they work before the dashboard exists and can't be broken by it.
 * Every interpolated value goes through escapeHtml.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function layout(title: string, body: string, t: T, width = 380): string {
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Running Companion</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f6f3; --card: #fff; --text: #1d1d1b; --muted: #6b6b66; --accent: #2f6f4f; --border: #ddddd6; --error: #a33; }
  @media (prefers-color-scheme: dark) { :root { --bg: #151614; --card: #1e201d; --text: #ecece6; --muted: #9c9d95; --accent: #6fbf8f; --border: #33352f; --error: #e88; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
  main { width: 100%; max-width: ${width}px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: var(--muted); margin: 0 0 20px; }
  label { display: block; font-size: 14px; margin-bottom: 6px; }
  input[type=password], input[type=text], input[type=date] { width: 100%; padding: 10px 12px; font: inherit; color: inherit; background: transparent; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; }
  .actions { display: flex; gap: 8px; }
  button { flex: 1; padding: 10px; font: inherit; border-radius: 8px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
  button.secondary { background: transparent; color: var(--text); border-color: var(--border); }
  .error { color: var(--error); margin-bottom: 16px; }
  h2 { font-size: 16px; margin: 24px 0 4px; }
  h2:first-of-type { margin-top: 8px; }
  .hint { font-size: 14px; margin: -10px 0 16px; }
  fieldset { border: 0; padding: 0; margin: 0 0 16px; display: flex; gap: 16px; }
  fieldset label { display: flex; align-items: center; gap: 6px; font-size: 16px; margin: 0; }
  a { color: var(--accent); }
  strong { color: var(--text); }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function loginPage({ next, error }: { next: string; error?: string }, t: T = ENGLISH.m.pages): string {
  return layout(
    t.logIn,
    `<h1>Running Companion</h1>
<p>${escapeHtml(t.logInIntro)}</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/login">
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <label for="password">${escapeHtml(t.password)}</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
  <div class="actions"><button type="submit">${escapeHtml(t.logIn)}</button></div>
</form>`,
    t,
  );
}

export function consentPage(
  { requestId, clientName, redirectHost, needsPassword, error }: { requestId: string; clientName: string; redirectHost: string; needsPassword: boolean; error?: string },
  t: T = ENGLISH.m.pages,
): string {
  return layout(
    t.allowTitle,
    `<h1>${escapeHtml(t.allow(clientName))}</h1>
<p>${t.wants(escapeHtml(clientName), escapeHtml(redirectHost))}</p>
${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/oauth/consent">
  <input type="hidden" name="request" value="${escapeHtml(requestId)}">
  ${needsPassword ? `<label for="password">${escapeHtml(t.password)}</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>` : ''}
  <div class="actions">
    <button type="submit" name="action" value="deny" class="secondary" formnovalidate>${escapeHtml(t.deny)}</button>
    <button type="submit" name="action" value="approve">${escapeHtml(t.allowButton)}</button>
  </div>
</form>`,
    t,
  );
}

export interface SetupForm {
  codeRequired: boolean;
  code?: string;
  expiresOn?: string;
  error?: string;
}

/**
 * First start: the only page there is until it's done. The setup code proves the person filling it in can see the
 * server's log, so whoever finds a fresh install's address first can't claim it.
 */
export function setupPage({ codeRequired, code = '', expiresOn = '', error }: SetupForm, t: T = ENGLISH.m.pages): string {
  const s = t.setup;
  const link = '<a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noreferrer">Garmin Connect</a>';
  return layout(
    s.title,
    `<h1>${escapeHtml(s.heading)}</h1>
<p>${escapeHtml(s.intro)}</p>
${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/setup">
  ${
    codeRequired
      ? `<label for="code">${escapeHtml(s.code)}</label>
  <input id="code" name="code" type="text" value="${escapeHtml(code)}" autocomplete="off" spellcheck="false" required>
  <p class="hint">${escapeHtml(s.codeHint)}</p>`
      : `<input type="hidden" name="code" value="${escapeHtml(code)}">`
  }
  <h2>${escapeHtml(s.passwordTitle)}</h2>
  <p class="hint" style="margin-top:0">${escapeHtml(s.passwordHint)}</p>
  <label for="password">${escapeHtml(s.newPassword)}</label>
  <input id="password" name="password" type="password" autocomplete="new-password" minlength="12" required>
  <label for="repeat">${escapeHtml(s.repeat)}</label>
  <input id="repeat" name="repeat" type="password" autocomplete="new-password" minlength="12" required>

  <h2>${escapeHtml(s.garminTitle)}</h2>
  <p class="hint" style="margin-top:0">${escapeHtml(s.garminHint('@@LINK@@')).replace('@@LINK@@', link)}</p>
  <label for="key">${escapeHtml(s.apiKey)}</label>
  <input id="key" name="key" type="password" autocomplete="off" spellcheck="false">
  <label for="expires">${escapeHtml(s.expires)}</label>
  <input id="expires" name="expires" type="date" value="${escapeHtml(expiresOn)}">
  <p class="hint">${escapeHtml(s.expiresHint)}</p>

  <div class="actions"><button type="submit">${escapeHtml(s.finish)}</button></div>
</form>`,
    t,
    460,
  );
}

export function messagePage(title: string, message: string, t: T = ENGLISH.m.pages): string {
  return layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`, t);
}
