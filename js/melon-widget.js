/*!
 * Melon Product Display widget loader
 * Embed: <div class="melon-product-display" data-widget="UID"></div>
 *        <script src="https://cdn.jsdelivr.net/gh/meloncommerce/cdn/js/melon-widget.min.js"></script>
 *
 * This file rarely changes. It reads each widget's config from the app, which includes the URL of
 * the current core script (js/melon-widget-core.js at a fixed release tag), loads that once and
 * renders. Updating the core never depends on this file's cache.
 */
(function () {
  'use strict';

  if (window.MelonProductDisplayLoader) {
    window.MelonProductDisplayLoader.scan();
    return;
  }

  var currentScript = document.currentScript;
  var API = (currentScript && currentScript.getAttribute('data-api')) ||
    'https://apps.huraapps.com/product-display/widgets/config/';
  var corePromise = null;

  function loadCore(src) {
    if (window.MelonProductDisplay) return Promise.resolve(window.MelonProductDisplay);
    if (!corePromise) {
      corePromise = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = function () {
          if (window.MelonProductDisplay) resolve(window.MelonProductDisplay);
          else reject(new Error('Core script did not initialise: ' + src));
        };
        script.onerror = function () {
          corePromise = null;
          reject(new Error('Could not load ' + src));
        };
        document.head.appendChild(script);
      });
    }
    return corePromise;
  }

  function scan() {
    var nodes = document.querySelectorAll('.melon-product-display[data-widget]:not([data-mpd-loaded])');
    Array.prototype.forEach.call(nodes, function (el) {
      el.setAttribute('data-mpd-loaded', '');
      fetch(API + encodeURIComponent(el.getAttribute('data-widget')))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (config) {
          if (!config || !config.script) return null;
          return loadCore(config.script).then(function (core) { return core.render(el, config); });
        })
        .catch(function (err) { console.warn('[Melon Product Display]', err); });
    });
  }

  window.MelonProductDisplayLoader = { scan: scan, version: '1' };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
