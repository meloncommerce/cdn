/*!
 * Melon Product Display widgets (core)
 * Loaded by js/melon-widget.js (the loader in embed codes) at a fixed release tag, e.g.
 *   https://cdn.jsdelivr.net/gh/meloncommerce/cdn@0.0.12/js/melon-widget-core.min.js
 * Renders with Shopify Storefront Web Components, so it works on any website.
 * Edit this file and push to main: a GitHub Action tags the release and the app picks it up.
 */
(function () {
  'use strict';

  if (window.MelonProductDisplay) {
    if (!window.MelonProductDisplayLoader) window.MelonProductDisplay.scan();
    return;
  }

  var SWC_SRC = 'https://cdn.shopify.com/storefront/web-components.js';
  var currentScript = document.currentScript;
  var API = (currentScript && currentScript.getAttribute('data-api')) ||
    'https://apps.huraapps.com/product-display/widgets/config/';

  var DEFAULTS = {
    heading: '', limit: 8, pagination: true, sort_key: 'COLLECTION_DEFAULT', columns: 4, columns_mobile: 2, autoplay: 0,
    item_width: 220, speed: 30, variants_limit: 10, image_ratio: '1/1', card_action: 'add_to_cart',
    show_vendor: false, show_compare_price: true, show_description: false, show_quantity: true,
    show_buy_now: true, button_text: 'Add to cart', button_color: '#111111',
    button_text_color: '#ffffff', text_color: '#1a1a1a', gap: 16, border_radius: 8,
    floating_cart: true, floating_cart_position: 'bottom-right', floating_cart_color: '#111111',
    floating_cart_icon_color: '#ffffff'
  };

  var swcPromise = null;

  // ---------- helpers ----------

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function numericId(gid) {
    return String(gid || '').split('/').pop();
  }

  function loadStorefrontComponents() {
    if (customElements.get('shopify-store')) return Promise.resolve();
    if (!swcPromise) {
      // The page may already include the script; then just wait for the elements to be defined.
      if (!document.querySelector('script[src="' + SWC_SRC + '"]')) {
        var script = document.createElement('script');
        script.src = SWC_SRC;
        document.head.appendChild(script);
      }
      swcPromise = customElements.whenDefined('shopify-store');
    }
    return swcPromise;
  }

  // On the shop's own storefront we use the theme cart; anywhere else the Storefront cart.
  function isOwnStorefront(shop) {
    return !!(window.Shopify && window.Shopify.shop === shop);
  }

  function slug(shop) {
    return shop.replace(/[^a-z0-9]/gi, '-');
  }

  // Each widget gets its own <shopify-store>: with one shared store, two widgets showing the same
  // collection can't paginate independently. token is the shop's public Storefront access token;
  // without it access is tokenless, which Shopify blocks while the storefront is password protected.
  function storeOpenTag(config) {
    var attrs = ' store-domain="https://' + esc(config.shop) + '"';
    if (config.token) attrs += ' public-access-token="' + esc(config.token) + '"';
    if (isOwnStorefront(config.shop) && window.Shopify.country) attrs += ' country="' + esc(window.Shopify.country) + '"';
    return '<shopify-store' + attrs + '>';
  }

  function ensureCart(shop) {
    var id = 'melon-cart-' + slug(shop);
    var cart = document.getElementById(id);
    if (!cart) {
      cart = document.createElement('shopify-cart');
      cart.id = id;
      document.body.appendChild(cart);
    }
    return cart;
  }

  // ---------- floating cart ----------

  var CART_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/>' +
    '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>';

  // One button per shop and container (the page, or the admin preview frame). It opens the
  // Storefront cart and shows the item count from the cart's (undocumented) shopify:cartData event.
  function syncFloatingCart(config, s) {
    var container = config.floatingCartContainer || document.body;
    var key = 'mpd-fab-' + slug(config.shop) + (config.floatingCartContainer ? '-preview' : '');
    var fab = container.querySelector('#' + key);
    if (!s.floating_cart || isOwnStorefront(config.shop)) {
      if (fab) fab.remove();
      return;
    }
    var cart = ensureCart(config.shop);
    if (!fab) {
      fab = document.createElement('button');
      fab.type = 'button';
      fab.id = key;
      fab.innerHTML = CART_ICON + '<span class="mpd-fab-count" hidden></span>';
      fab.addEventListener('click', function () { cart.showModal(); });
      cart.addEventListener('shopify:cartData', function (event) {
        var count = event.detail && event.detail.totalQuantity ? event.detail.totalQuantity : 0;
        var badge = fab.querySelector('.mpd-fab-count');
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = !count;
        fab.setAttribute('aria-label', 'Open cart, ' + count + (count === 1 ? ' item' : ' items'));
      });
      fab.setAttribute('aria-label', 'Open cart');
      container.appendChild(fab);
    }
    fab.className = 'mpd-fab' + (s.floating_cart_position === 'bottom-left' ? ' mpd-fab-left' : '') +
      (config.floatingCartContainer ? ' mpd-fab-contained' : '');
    fab.style.setProperty('--mpd-fab-bg', s.floating_cart_color);
    fab.style.setProperty('--mpd-fab-fg', s.floating_cart_icon_color);
  }

  // Match the cart's checkout button to the widget's button colors.
  function styleCart(s) {
    var style = document.getElementById('mpd-cart-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'mpd-cart-style';
      document.head.appendChild(style);
    }
    style.textContent = 'shopify-cart::part(primary-button){background:' + s.button_color + ';color:' + s.button_text_color + ';}';
  }

  // ---------- markup ----------

  function price(s, query) {
    var html = '<div class="mpd-price"><shopify-money query="' + query + '.price"></shopify-money>';
    if (s.show_compare_price) {
      html += ' <s class="mpd-compare"><shopify-money query="' + query + '.compareAtPrice"></shopify-money></s>';
    }
    return html + '</div>';
  }

  function vendor(s) {
    return s.show_vendor ? '<div class="mpd-vendor"><shopify-data query="product.vendor"></shopify-data></div>' : '';
  }

  function cardAction(s) {
    if (s.card_action === 'view_product') {
      return '<a class="mpd-btn" shopify-attr--href="product.onlineStoreUrl">' + esc(s.button_text) + '</a>';
    }
    if (s.card_action === 'add_to_cart') {
      return '<button type="button" class="mpd-btn" data-mpd-add ' +
        'shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale">' + esc(s.button_text) + '</button>';
    }
    return '';
  }

  // One product card, used by grid, list, carousel and marquee.
  function card(s, layout) {
    var desc = layout === 'list' && s.show_description
      ? '<div class="mpd-desc"><shopify-data query="product.description"></shopify-data></div>' : '';
    return '<div class="mpd-card" shopify-attr--data-variant="product.selectedOrFirstAvailableVariant.id">' +
      '<a class="mpd-media" shopify-attr--href="product.onlineStoreUrl">' +
        '<shopify-media query="product.featuredImage" width="600" height="600"></shopify-media></a>' +
      '<div class="mpd-info">' + vendor(s) +
        '<a class="mpd-title" shopify-attr--href="product.onlineStoreUrl"><shopify-data query="product.title"></shopify-data></a>' +
        price(s, 'product.selectedOrFirstAvailableVariant') + desc +
      '</div>' + cardAction(s) +
    '</div>';
  }

  function bulkProduct(s) {
    return '<div class="mpd-bulk-product">' +
      '<div class="mpd-bulk-head">' +
        '<a class="mpd-media" shopify-attr--href="product.onlineStoreUrl">' +
          '<shopify-media query="product.featuredImage" width="160" height="160"></shopify-media></a>' +
        '<div>' + vendor(s) +
          '<a class="mpd-title" shopify-attr--href="product.onlineStoreUrl"><shopify-data query="product.title"></shopify-data></a></div>' +
      '</div>' +
      '<shopify-list-context type="variant" query="product.variants" first="' + s.variants_limit + '"><template>' +
        '<div class="mpd-bulk-row" shopify-attr--data-variant="variant.id" shopify-attr--data-available="variant.availableForSale">' +
          '<span class="mpd-bulk-variant"><shopify-data query="variant.title"></shopify-data></span>' +
          price(s, 'variant') + qty(0) +
        '</div>' +
      '</template></shopify-list-context>' +
    '</div>';
  }

  function qty(value) {
    return '<div class="mpd-qty">' +
      '<button type="button" data-mpd-step="-1" aria-label="Decrease quantity">&minus;</button>' +
      '<input type="number" class="mpd-qty-input" min="0" value="' + value + '" aria-label="Quantity">' +
      '<button type="button" data-mpd-step="1" aria-label="Increase quantity">+</button>' +
    '</div>';
  }

  function orderForm(s) {
    var desc = s.show_description
      ? '<div class="mpd-desc mpd-rich"><shopify-data query="product.descriptionHtml"></shopify-data></div>' : '';
    return '<div class="mpd-order" shopify-attr--data-variant="product.selectedOrFirstAvailableVariant.id">' +
      '<div class="mpd-order-media">' +
        '<shopify-media class="mpd-variant-image" query="product.selectedOrFirstAvailableVariant.image" width="900" height="900"></shopify-media>' +
        '<shopify-media class="mpd-featured-image" query="product.featuredImage" width="900" height="900"></shopify-media>' +
      '</div>' +
      '<div class="mpd-order-info">' + vendor(s) +
        '<h3 class="mpd-title"><shopify-data query="product.title"></shopify-data></h3>' +
        price(s, 'product.selectedOrFirstAvailableVariant') +
        '<shopify-variant-selector></shopify-variant-selector>' +
        '<div class="mpd-order-actions">' + (s.show_quantity ? qty(1) : '') +
          '<button type="button" class="mpd-btn" data-mpd-add ' +
            'shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale">' + esc(s.button_text) + '</button>' +
        '</div>' +
        (s.show_buy_now ? '<button type="button" class="mpd-btn mpd-btn-secondary" data-mpd-buy ' +
          'shopify-attr--disabled="!product.selectedOrFirstAvailableVariant.availableForSale">Buy it now</button>' : '') +
        desc +
      '</div>' +
    '</div>';
  }

  // Previous/Next for collection widgets; shown once the list reports more than one page.
  function pager(config, s) {
    if (config.source !== 'collection' || !s.pagination) return '';
    return '<nav class="mpd-pager" aria-label="Pagination" hidden>' +
      '<button type="button" class="mpd-page-btn" data-mpd-page="-1" disabled>&#8249; Previous</button>' +
      '<span class="mpd-page-num">Page 1</span>' +
      '<button type="button" class="mpd-page-btn" data-mpd-page="1" disabled>Next &#8250;</button>' +
    '</nav>';
  }

  // Wraps an item template in the contexts that load the widget's products.
  function contexts(config, s, itemHtml) {
    if (config.source === 'collection') {
      return '<shopify-context type="collection" gid="' + esc(config.resources[0]) + '"><template>' +
        '<shopify-list-context type="product" query="collection.products" first="' + s.limit + '"' +
          (s.sort_key && s.sort_key !== 'COLLECTION_DEFAULT' ? ' sort-key="' + esc(s.sort_key) + '"' : '') + '>' +
          '<template>' + itemHtml + '</template></shopify-list-context>' +
      '</template></shopify-context>';
    }
    return config.resources.map(function (gid) {
      return '<shopify-context type="product" gid="' + esc(gid) + '"><template>' + itemHtml + '</template></shopify-context>';
    }).join('');
  }

  function markup(config, s) {
    var layout = config.layout;
    var heading = s.heading ? '<h2 class="mpd-heading">' + esc(s.heading) + '</h2>' : '';
    var body;
    switch (layout) {
      case 'order-form':
        body = contexts(config, s, orderForm(s));
        break;
      case 'bulk-order-form':
        body = '<div class="mpd-bulk">' + contexts(config, s, bulkProduct(s)) + '</div>' +
          '<div class="mpd-bulk-footer"><button type="button" class="mpd-btn" data-mpd-bulk-add>' + esc(s.button_text) + '</button></div>';
        break;
      case 'carousel':
        body = '<div class="mpd-carousel">' +
          '<button type="button" class="mpd-nav mpd-prev" data-mpd-scroll="-1" aria-label="Previous">&#8249;</button>' +
          '<div class="mpd-track">' + contexts(config, s, card(s, layout)) + '</div>' +
          '<button type="button" class="mpd-nav mpd-next" data-mpd-scroll="1" aria-label="Next">&#8250;</button>' +
        '</div>';
        break;
      case 'marquee':
        var items = contexts(config, s, card(s, layout));
        body = '<div class="mpd-marquee"><div class="mpd-marquee-track">' +
          '<div class="mpd-marquee-set">' + items + '</div>' +
          '<div class="mpd-marquee-set" aria-hidden="true">' + items + '</div>' +
        '</div></div>';
        break;
      default: // grid, list
        body = '<div class="mpd-' + layout + '">' + contexts(config, s, card(s, layout)) + '</div>';
    }
    return heading + body + pager(config, s) + '<div class="mpd-msg" role="status" hidden></div>';
  }

  // ---------- cart ----------

  function showMessage(el, text) {
    var msg = el.querySelector('.mpd-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = !text;
  }

  function addToCart(el, config, lines, openCheckout) {
    lines = lines.filter(function (l) { return l.variantId && l.quantity > 0; });
    if (!lines.length) {
      showMessage(el, 'Please choose at least one product.');
      return;
    }
    showMessage(el, '');

    if (isOwnStorefront(config.shop)) {
      var root = (window.Shopify.routes && window.Shopify.routes.root) || '/';
      if (openCheckout && lines.length === 1) {
        window.location.href = root + 'cart/' + numericId(lines[0].variantId) + ':' + lines[0].quantity;
        return;
      }
      fetch(root + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: lines.map(function (l) { return { id: Number(numericId(l.variantId)), quantity: l.quantity }; }) })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.description || data.message || 'Could not add to cart.');
          return data;
        });
      }).then(function (data) {
        document.dispatchEvent(new CustomEvent('melon:cart:added', { detail: data }));
        window.location.href = root + (openCheckout ? 'checkout' : 'cart');
      }).catch(function (err) {
        showMessage(el, err.message);
      });
      return;
    }

    var cart = ensureCart(config.shop);
    lines.forEach(function (line) { cart.addLine(line); });
    cart.showModal();
  }

  function quantityIn(scope) {
    var input = scope && scope.querySelector('.mpd-qty-input');
    return input ? Math.max(0, parseInt(input.value, 10) || 0) : 1;
  }

  function bindEvents(el, config) {
    el.addEventListener('click', function (event) {
      var target = event.target.closest('button');
      if (!target || !el.contains(target)) return;

      if (target.hasAttribute('data-mpd-step')) {
        var input = target.parentNode.querySelector('.mpd-qty-input');
        input.value = Math.max(0, (parseInt(input.value, 10) || 0) + Number(target.getAttribute('data-mpd-step')));
        return;
      }
      if (target.hasAttribute('data-mpd-page')) {
        changePage(el, Number(target.getAttribute('data-mpd-page')));
        return;
      }
      if (target.hasAttribute('data-mpd-scroll')) {
        var track = el.querySelector('.mpd-track');
        track.scrollBy({ left: Number(target.getAttribute('data-mpd-scroll')) * track.clientWidth, behavior: 'smooth' });
        return;
      }
      if (target.hasAttribute('data-mpd-add') || target.hasAttribute('data-mpd-buy')) {
        var item = target.closest('[data-variant]');
        var buy = target.hasAttribute('data-mpd-buy');
        var quantity = config.layout === 'order-form' ? (quantityIn(item) || 1) : 1;
        if (buy && !isOwnStorefront(config.shop) && quantity === 1) {
          el.querySelector('shopify-store').buyNow(event);
          return;
        }
        addToCart(el, config, [{ variantId: item.getAttribute('data-variant'), quantity: quantity }], buy);
        return;
      }
      if (target.hasAttribute('data-mpd-bulk-add')) {
        var lines = Array.prototype.map.call(el.querySelectorAll('.mpd-bulk-row'), function (row) {
          return { variantId: row.getAttribute('data-variant'), quantity: quantityIn(row) };
        });
        addToCart(el, config, lines, false);
      }
    });
  }

  // ---------- pagination ----------

  function productList(el) {
    return el.querySelector('shopify-list-context[type="product"]');
  }

  function changePage(el, step) {
    var list = productList(el);
    if (!list) return;
    var pagerEl = el.querySelector('.mpd-pager');
    pagerEl.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    el._mpdPage = Math.max(1, (el._mpdPage || 1) + step);
    if (step > 0) list.nextPage(); else list.previousPage();
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Storefront Web Components fire this (undocumented) event with page info after every list load.
  // It is broadcast to every list on the page, so only react to this widget's product list.
  function bindPager(el) {
    el.addEventListener('shopify-list-context-update', function (event) {
      var pagerEl = el.querySelector('.mpd-pager');
      if (!pagerEl || event.target !== productList(el) || !event.detail) return;
      var hasPrev = !!event.detail.hasPreviousPage;
      var hasNext = !!event.detail.hasNextPage;
      if (!hasPrev) el._mpdPage = 1;
      pagerEl.hidden = !hasPrev && !hasNext;
      pagerEl.querySelector('[data-mpd-page="-1"]').disabled = !hasPrev;
      pagerEl.querySelector('[data-mpd-page="1"]').disabled = !hasNext;
      pagerEl.querySelector('.mpd-page-num').textContent = 'Page ' + (el._mpdPage || 1);
    });
  }

  // Fixes the components can't express: variant image fallback, single-variant rows, sold-out rows.
  function polish(el) {
    Array.prototype.forEach.call(el.querySelectorAll('.mpd-order-media'), function (media) {
      var variantImage = media.querySelector('.mpd-variant-image');
      var hasVariantImage = !!(variantImage && (variantImage.querySelector('img') ||
        (variantImage.shadowRoot && variantImage.shadowRoot.querySelector('img[src]'))));
      media.classList.toggle('mpd-has-variant-image', hasVariantImage);
    });
    Array.prototype.forEach.call(el.querySelectorAll('.mpd-bulk-row'), function (row) {
      var title = row.querySelector('.mpd-bulk-variant');
      if (title && title.textContent.trim() === 'Default Title') title.textContent = '';
      var soldOut = !row.hasAttribute('data-available');
      row.classList.toggle('mpd-sold-out', soldOut);
      Array.prototype.forEach.call(row.querySelectorAll('input, button'), function (c) { c.disabled = soldOut; });
    });
  }

  function startAutoplay(el, s) {
    if (!s.autoplay) return null;
    return setInterval(function () {
      var track = el.querySelector('.mpd-track');
      if (!track || el.matches(':hover')) return;
      var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + track.clientWidth, behavior: 'smooth' });
    }, s.autoplay * 1000);
  }

  // ---------- styles ----------

  var CSS = [
    '.mpd{container-type:inline-size;color:var(--mpd-text);font:inherit;--mpd-gap:16px;--mpd-radius:8px;--mpd-cols:4;--mpd-cols-m:2}',
    '.mpd *{box-sizing:border-box}',
    '.mpd shopify-store{display:block}',
    '.mpd a{color:inherit;text-decoration:none}',
    '.mpd-heading{margin:0 0 var(--mpd-gap);font-size:1.5em;line-height:1.2}',
    '.mpd shopify-media,.mpd shopify-media img{display:block;width:100%}',
    '.mpd-media{display:block;aspect-ratio:var(--mpd-ratio);overflow:hidden;border-radius:var(--mpd-radius);background:#f4f4f4}',
    '.mpd-media img,.mpd-order-media img{width:100%;height:100%;object-fit:cover}',
    '.mpd-card{display:flex;flex-direction:column;gap:8px;min-width:0}',
    '.mpd-info{display:flex;flex-direction:column;gap:4px;flex:1}',
    '.mpd-vendor{font-size:.8em;opacity:.7;text-transform:uppercase;letter-spacing:.04em}',
    '.mpd-title{font-weight:600;line-height:1.3}',
    '.mpd-price{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}',
    '.mpd-compare{opacity:.6}',
    '.mpd-desc{font-size:.9em;opacity:.8;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.mpd-rich{display:block;-webkit-line-clamp:unset}',
    '.mpd-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 18px;border:1px solid var(--mpd-btn);border-radius:var(--mpd-radius);background:var(--mpd-btn);color:var(--mpd-btn-text) !important;font:inherit;font-weight:600;cursor:pointer;text-align:center}',
    '.mpd-btn:disabled{opacity:.45;cursor:not-allowed}',
    '.mpd-btn-secondary{background:transparent;color:var(--mpd-btn) !important;width:100%}',
    '.mpd-msg{margin-top:12px;font-size:.9em;color:#b42318}',
    // floating cart (appended to body, so not scoped under .mpd)
    '.mpd-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--mpd-fab-bg,#111);color:var(--mpd-fab-fg,#fff);box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;padding:0}',
    '.mpd-fab-left{right:auto;left:20px}',
    '.mpd-fab-contained{position:absolute;right:16px;bottom:16px}.mpd-fab-contained.mpd-fab-left{left:16px}',
    '.mpd-fab-count{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#e22120;color:#fff;font:600 12px/22px system-ui,sans-serif;text-align:center}',
    '.mpd-fab-count[hidden]{display:none}',
    '.mpd-pager{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:var(--mpd-gap)}',
    '.mpd-pager[hidden]{display:none}',
    '.mpd-page-btn{min-height:38px;padding:0 14px;border:1px solid rgba(0,0,0,.2);border-radius:var(--mpd-radius);background:transparent;color:inherit;font:inherit;cursor:pointer}',
    '.mpd-page-btn:disabled{opacity:.4;cursor:not-allowed}',
    '.mpd-page-num{font-size:.9em;opacity:.75}',
    // grid
    '.mpd-grid{display:grid;gap:var(--mpd-gap);grid-template-columns:repeat(var(--mpd-cols-m),minmax(0,1fr))}',
    '@container (min-width:700px){.mpd-grid{grid-template-columns:repeat(var(--mpd-cols),minmax(0,1fr))}}',
    // list
    '.mpd-list{display:flex;flex-direction:column;gap:var(--mpd-gap)}',
    '.mpd-list .mpd-card{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:12px var(--mpd-gap)}',
    '.mpd-list .mpd-card>.mpd-btn{grid-column:2;justify-self:start}',
    '@container (min-width:560px){.mpd-list .mpd-card{grid-template-columns:140px minmax(0,1fr) auto}.mpd-list .mpd-card>.mpd-btn{grid-column:3}}',
    // carousel
    '.mpd-carousel{position:relative}',
    '.mpd-track{display:grid;grid-auto-flow:column;gap:var(--mpd-gap);grid-auto-columns:calc((100% - (var(--mpd-cols-m) - 1) * var(--mpd-gap)) / var(--mpd-cols-m));overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}',
    '.mpd-track::-webkit-scrollbar{display:none}',
    '.mpd-track .mpd-card{scroll-snap-align:start}',
    '@container (min-width:700px){.mpd-track{grid-auto-columns:calc((100% - (var(--mpd-cols) - 1) * var(--mpd-gap)) / var(--mpd-cols))}}',
    '.mpd-nav{position:absolute;top:35%;z-index:1;width:36px;height:36px;border-radius:50%;border:1px solid rgba(0,0,0,.1);background:#fff;color:#111;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.15)}',
    '.mpd-prev{left:-8px}.mpd-next{right:-8px}',
    // marquee
    '.mpd-marquee{overflow:hidden}',
    '.mpd-marquee-track{display:flex;width:max-content;animation:mpd-marquee var(--mpd-speed) linear infinite}',
    '.mpd-marquee:hover .mpd-marquee-track{animation-play-state:paused}',
    '.mpd-marquee-set{display:flex;gap:var(--mpd-gap);padding-right:var(--mpd-gap)}',
    '.mpd-marquee .mpd-card{width:var(--mpd-item)}',
    '@keyframes mpd-marquee{to{transform:translateX(-50%)}}',
    '@media (prefers-reduced-motion:reduce){.mpd-marquee-track{animation:none}.mpd-marquee{overflow-x:auto}}',
    // bulk order form
    '.mpd-bulk{display:flex;flex-direction:column;gap:var(--mpd-gap)}',
    '.mpd-bulk-product{border:1px solid rgba(0,0,0,.1);border-radius:var(--mpd-radius);padding:var(--mpd-gap)}',
    '.mpd-bulk-head{display:flex;gap:12px;align-items:center;margin-bottom:8px}',
    '.mpd-bulk-head .mpd-media{width:64px;flex:none}',
    '.mpd-bulk-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:8px 0;border-top:1px solid rgba(0,0,0,.06)}',
    '.mpd-sold-out{opacity:.5}',
    '.mpd-bulk-footer{margin-top:var(--mpd-gap);display:flex;justify-content:flex-end}',
    '.mpd-qty{display:inline-flex;align-items:center;border:1px solid rgba(0,0,0,.2);border-radius:var(--mpd-radius);overflow:hidden;height:42px}',
    '.mpd-qty button{width:36px;height:100%;border:0;background:transparent;font-size:18px;cursor:pointer;color:inherit}',
    '.mpd-qty input{width:48px;height:100%;border:0;text-align:center;font:inherit;color:inherit;background:transparent;-moz-appearance:textfield}',
    '.mpd-qty input::-webkit-inner-spin-button{-webkit-appearance:none}',
    // order form
    '.mpd-order{display:grid;gap:calc(var(--mpd-gap) * 1.5)}',
    '@container (min-width:640px){.mpd-order{grid-template-columns:1fr 1fr}}',
    '.mpd-order-media{aspect-ratio:var(--mpd-ratio);border-radius:var(--mpd-radius);overflow:hidden;background:#f4f4f4}',
    '.mpd-order-media .mpd-variant-image,.mpd-has-variant-image .mpd-featured-image{display:none}',
    '.mpd-has-variant-image .mpd-variant-image{display:block}',
    '.mpd-order-info{display:flex;flex-direction:column;gap:12px}',
    '.mpd-order-info .mpd-title{margin:0;font-size:1.6em}',
    '.mpd-order-info .mpd-price{font-size:1.2em}',
    '.mpd-order-actions{display:flex;gap:8px}',
    '.mpd-order-actions .mpd-btn{flex:1}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('mpd-style')) return;
    var style = document.createElement('style');
    style.id = 'mpd-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ---------- public API ----------

  function render(el, config) {
    var s = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      s[key] = config.settings && config.settings[key] !== undefined ? config.settings[key] : DEFAULTS[key];
    });

    if (el._mpdCleanup) el._mpdCleanup();
    injectStyles();
    el.classList.add('mpd', 'mpd-layout-' + config.layout);
    var vars = {
      '--mpd-text': s.text_color, '--mpd-btn': s.button_color, '--mpd-btn-text': s.button_text_color,
      '--mpd-gap': s.gap + 'px', '--mpd-radius': s.border_radius + 'px', '--mpd-cols': s.columns,
      '--mpd-cols-m': s.columns_mobile, '--mpd-ratio': s.image_ratio, '--mpd-item': s.item_width + 'px',
      '--mpd-speed': s.speed + 's'
    };
    Object.keys(vars).forEach(function (key) { el.style.setProperty(key, vars[key]); });

    if (!config.resources || !config.resources.length) {
      el.innerHTML = '';
      return Promise.resolve();
    }

    return loadStorefrontComponents().then(function () {
      el._mpdPage = 1;
      el.innerHTML = storeOpenTag(config) + markup(config, s) + '</shopify-store>';
      if (!isOwnStorefront(config.shop)) styleCart(s);
      syncFloatingCart(config, s);

      var observer = new MutationObserver(function () { polish(el); });
      observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-variant', 'data-available'] });
      var timer = startAutoplay(el, s);
      if (!el._mpdBound) {
        bindEvents(el, { get shop() { return el._mpdConfig.shop; }, get layout() { return el._mpdConfig.layout; } });
        bindPager(el);
        el._mpdBound = true;
      }
      el._mpdConfig = config;
      el._mpdCleanup = function () {
        observer.disconnect();
        if (timer) clearInterval(timer);
      };
    });
  }

  function scan() {
    var nodes = document.querySelectorAll('.melon-product-display[data-widget]:not([data-mpd-loaded])');
    Array.prototype.forEach.call(nodes, function (el) {
      el.setAttribute('data-mpd-loaded', '');
      fetch(API + encodeURIComponent(el.getAttribute('data-widget')))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (config) { if (config) return render(el, config); })
        .catch(function (err) { console.warn('[Melon Product Display]', err); });
    });
  }

  window.MelonProductDisplay = { render: render, scan: scan, version: '1.0.0' };

  // The loader fetches configs and calls render() itself; standalone use scans the page.
  if (window.MelonProductDisplayLoader) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
})();
