// Light/dark theme: follows the system setting until the visitor picks one,
// then remembers it (localStorage only). Used by the app shell, the static
// pages (via <!--theme-...--> markers) and the SEO templates.

export const THEME_KEY = 'isitpolite_theme';

// Runs in <head> before CSS paints, so a saved choice never flashes the wrong theme.
export const THEME_HEAD = `<script>try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

export const THEME_BUTTON = '<button type="button" class="theme-toggle" aria-label="Switch to dark mode" title="Switch to dark mode">' +
  '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
  '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>' +
  '</button>';

// End of <body>: wires every toggle on the page and keeps the browser theme colour in sync.
export const THEME_SCRIPT = `<script>(function(){var K='${THEME_KEY}',r=document.documentElement;
function eff(){var t=r.getAttribute('data-theme');return t||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function sync(){var d=eff()==='dark',l=d?'Switch to light mode':'Switch to dark mode';
document.querySelectorAll('.theme-toggle').forEach(function(b){b.setAttribute('aria-label',l);b.title=l});
if(r.getAttribute('data-theme'))document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',d?'#14110F':'#FAF7F2');m.removeAttribute('media')})}
document.querySelectorAll('.theme-toggle').forEach(function(b){b.addEventListener('click',function(){var n=eff()==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem(K,n)}catch(e){}sync()})});
if(window.matchMedia)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',sync);sync()})();</script>`;

export function injectTheme(html) {
  return html
    .replace('<!--theme-head-->', THEME_HEAD)
    .replace(/<!--theme-button-->/g, THEME_BUTTON)
    .replace('<!--theme-script-->', THEME_SCRIPT);
}

// Every `@media (prefers-color-scheme: dark) { ... }` block is emitted twice:
// once under the media query (unless the visitor forced light) and once for a
// forced dark choice, so dark colours are written in exactly one place.
export function expandDarkMode(css) {
  const open = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/g;
  let out = '', last = 0, m;
  while ((m = open.exec(css))) {
    let depth = 1, i = open.lastIndex;
    while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    const inner = css.slice(open.lastIndex, i - 1);
    out += css.slice(last, m.index) +
      '@media (prefers-color-scheme: dark) {' + scope(inner, ':root:not([data-theme="light"])') + '}\n' +
      scope(inner, ':root[data-theme="dark"]');
    last = open.lastIndex = i;
  }
  return out + css.slice(last);
}

function scope(rules, prefix) {
  return rules.replace(/([^{}]+)\{([^{}]*)\}/g, function (all, selectors, body) {
    const sel = selectors.split(',').map(function (s) {
      s = s.trim();
      if (!s) return s;
      return s.indexOf(':root') === 0 ? prefix + s.slice(5) : prefix + ' ' + s;
    }).join(', ');
    return '\n' + sel + ' {' + body + '}';
  });
}
