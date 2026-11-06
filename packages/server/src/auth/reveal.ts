/**
 * /reveal.js: Show/Hide buttons beside the password fields of the login, setup and consent pages, so a long passphrase
 * or a pasted key can be checked before sending. Served as a file because the pages' security policy allows no inline
 * script. The button labels come from data attributes on <html>, in the page's language. Fields go back to hidden on
 * submit, so the browser's password manager still recognises them.
 */
export const REVEAL_SCRIPT = `(() => {
  const labels = document.documentElement.dataset;
  for (const input of document.querySelectorAll('input[type=password]')) {
    const field = document.createElement('span');
    field.className = 'reveal-field';
    input.parentNode.insertBefore(field, input);
    field.appendChild(input);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reveal';
    const show = (shown) => {
      input.type = shown ? 'text' : 'password';
      button.textContent = shown ? labels.hide : labels.show;
      button.setAttribute('aria-label', shown ? labels.hideLabel : labels.showLabel);
      button.setAttribute('aria-pressed', String(shown));
    };
    button.addEventListener('click', () => {
      show(input.type === 'password');
      input.focus();
    });
    input.form?.addEventListener('submit', () => show(false));
    show(false);
    field.appendChild(button);
  }
})();
`;
