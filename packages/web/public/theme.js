// Applies the colour theme before the page draws, so a dark-mode start never flashes white.
// The choice ("system", "light" or "dark") is per device; "system" follows the phone or laptop setting live.
// A plain script, not a module, so it runs immediately; it lives in its own file because the security policy
// allows no inline scripts. The app changes the choice through the same localStorage key and the "themechange" event.
(function () {
  var KEY = 'theme';
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  function choice() {
    try {
      return localStorage.getItem(KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  }
  function apply() {
    var c = choice();
    var dark = c === 'dark' || (c === 'system' && media.matches);
    var root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0e171d' : '#eef1ef');
    document.dispatchEvent(new Event('themechange'));
  }
  apply();
  media.addEventListener('change', function () {
    if (choice() === 'system') apply();
  });
  window.__applyTheme = apply;
})();
