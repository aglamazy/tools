// Returns the JavaScript to inject into proxied pages
// finalUrl: the resolved URL of the page, finalBase: protocol+host
export function getInjectedScript(finalUrl: string, finalBase: string, hostname: string): string {
  return `
<script>
(function() {
  'use strict';

  var fieldCounter = 0;

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.name) {
      var byName = document.querySelectorAll('[name="' + CSS.escape(el.name) + '"]');
      if (byName.length === 1) return '[name="' + CSS.escape(el.name) + '"]';
    }
    var parts = [];
    var current = el;
    while (current && current !== document.body) {
      var sel = current.tagName.toLowerCase();
      if (current.id) { sel = '#' + CSS.escape(current.id); parts.unshift(sel); break; }
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children).filter(function(c) { return c.tagName === current.tagName; });
        if (siblings.length > 1) sel += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(sel);
      current = parent;
    }
    return parts.join(' > ');
  }

  function getSection(el) {
    var node = el;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.from(parent.children);
        var idx = siblings.indexOf(node);
        for (var i = idx - 1; i >= 0; i--) {
          var sib = siblings[i];
          var heading = sib.matches && sib.matches('h1,h2,h3,h4,h5,h6,legend')
            ? sib : sib.querySelector && sib.querySelector('h1,h2,h3,h4,h5,h6,legend');
          if (heading) return heading.textContent.trim();
        }
      }
      node = parent;
    }
    return '';
  }

  function getLabel(el) {
    if (el.id) { var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (lbl) return lbl.textContent.trim(); }
    var parentLabel = el.closest('label');
    if (parentLabel) { var clone = parentLabel.cloneNode(true); clone.querySelectorAll('input,textarea,select').forEach(function(i){i.remove();}); var t = clone.textContent.trim(); if (t) return t; }
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.getAttribute('aria-labelledby')) { var le = document.getElementById(el.getAttribute('aria-labelledby')); if (le) return le.textContent.trim(); }
    if (el.title) return el.title;
    var td = el.closest('td');
    if (td) { var prev = td.previousElementSibling; if (prev && (prev.tagName==='TD'||prev.tagName==='TH')) { var txt = prev.textContent.trim(); if (txt) return txt; } var tr = td.closest('tr'); if (tr) { var th = tr.querySelector('th'); if (th) { txt = th.textContent.trim(); if (txt) return txt; } } }
    var prev2 = el.previousElementSibling;
    if (!prev2 && el.parentElement) prev2 = el.parentElement.previousElementSibling;
    if (prev2 && prev2.textContent.trim() && !prev2.querySelector('input,textarea,select')) return prev2.textContent.trim();
    return el.placeholder || el.name || '';
  }

  function solveCaptcha(inputEl) {
    var container = inputEl.parentElement, text = '';
    while (container && container !== document.body) { text = container.textContent||''; if (/\\d+\\s*(?:and|und|plus|\\+)\\s*\\d+/.test(text)) break; container = container.parentElement; }
    if (!text) return null;
    var patterns = [/(?:add|sum|plus|zählen|zusammen)[^\\d]*(\\d+)\\s*(?:and|und|plus|\\+)\\s*(\\d+)/i, /(\\d+)\\s*(?:and|und|plus|\\+)\\s*(\\d+)\\s*(?:add|sum|together|zusammen)/i, /(\\d+)\\s*\\+\\s*(\\d+)/, /(\\d+)\\s*(?:\\*|times|mal|×)\\s*(\\d+)/, /(\\d+)\\s*(?:-|minus)\\s*(\\d+)/];
    for (var pi = 0; pi < patterns.length; pi++) { var m = text.match(patterns[pi]); if (m) { var a=parseInt(m[1],10),b=parseInt(m[2],10); if(/\\*|times|mal|×/.test(m[0]))return a*b; if(/-|minus/.test(m[0]))return a-b; return a+b; } }
    return null;
  }

  function extractFields() {
    var fields = [], elements = document.querySelectorAll('input, textarea, select');
    for (var ei = 0; ei < elements.length; ei++) {
      var el = elements[ei], type = (el.type||'text').toLowerCase();
      if (type==='hidden'||type==='submit'||type==='button'||type==='reset') continue;
      if (el.offsetParent===null && el.type!=='file') continue;
      if (el.closest('header,nav,footer,[role="banner"],[role="contentinfo"]')) continue;
      var fieldId = el.id || el.name || 'aglamaz-field-'+(++fieldCounter);
      if (!el.id && !el.getAttribute('data-aglamaz-id')) el.setAttribute('data-aglamaz-id', fieldId);
      var fd = { id:fieldId, type:el.tagName==='TEXTAREA'?'textarea':el.tagName==='SELECT'?'select':type, label:getLabel(el), section:getSection(el), name:el.name||'', placeholder:el.placeholder||'', value:el.tagName==='SELECT'?(el.options[el.selectedIndex]?el.options[el.selectedIndex].text:''):(el.value||''), required:el.required||/^\\*/.test(getLabel(el).trim()), selector:getSelector(el) };
      if (el.tagName==='SELECT') fd.options = Array.from(el.options).map(function(o){return{value:o.value,text:o.text};});
      if (type==='file'&&el.accept) fd.accept = el.accept;
      if (/captcha|sicherheitsabfrage|security.?question/i.test(fd.label||fd.name||fd.id)) { var ans = solveCaptcha(el); if (ans!==null) fd.captchaAnswer = String(ans); }
      fields.push(fd);
    }
    var seen = new Map();
    for (var fi=0;fi<fields.length;fi++) { var f=fields[fi], key=f.label.trim().toLowerCase().replace(/[\\s*]+/g,' ').trim(); if(!key)continue; if(seen.has(key)){var p=seen.get(key);if(f.type==='select'&&p.type!=='select')seen.set(key,f);}else seen.set(key,f); }
    var dedupedIds = new Set(Array.from(seen.values()).map(function(f){return f.id;}));
    return { fields: fields.filter(function(f){var key=f.label.trim().toLowerCase().replace(/[\\s*]+/g,' ').trim();return !key||dedupedIds.has(f.id);}), pageUrl: '${finalUrl}', hostname: '${hostname}' };
  }

  function fillField(selector, value) {
    var el = document.querySelector(selector);
    if (!el) return false;
    if (el.tagName==='SELECT') { var opt=Array.from(el.options).find(function(o){return o.value===value||o.text===value;}); if(opt) el.value=opt.value; }
    else if (el.type==='file') return false;
    else { var ns=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value'); if(ns&&ns.set) ns.set.call(el,value); else el.value=value; }
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    return true;
  }

  // Listen for messages from the parent window (sidebar)
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || !msg.type) return;
    if (msg.type === 'EXTRACT_FIELDS') {
      var data = extractFields();
      console.log('[Aglamaz Proxy] Extracted fields:', data.fields.length);
      window.parent.postMessage({ type: 'FIELDS_RESULT', fields: data.fields, pageUrl: data.pageUrl, hostname: data.hostname }, '*');
    }
    if (msg.type === 'FILL_FIELDS') {
      // Fill selects first (they may trigger AJAX partial updates), then text after a delay
      var selects = msg.fields.filter(function(f) { return f.type === 'select'; });
      var rest = msg.fields.filter(function(f) { return f.type !== 'select'; });
      var results = [];
      for (var i = 0; i < selects.length; i++) { var s = selects[i]; results.push({ selector: s.selector, success: fillField(s.selector, s.value) }); }
      // Wait for AJAX partial updates to settle before filling text fields
      setTimeout(function() {
        for (var j = 0; j < rest.length; j++) { var r = rest[j]; results.push({ selector: r.selector, success: fillField(r.selector, r.value) }); }
        window.parent.postMessage({ type: 'FILL_RESULT', results: results }, '*');
      }, selects.length > 0 ? 1500 : 0);
    }
  });

  // Intercept form submissions, link clicks, and AJAX to route through proxy
  var PROXY_PREFIX = window.location.origin + '/api/proxy?url=';
  var ORIGINAL_BASE = '${finalBase}';
  function proxyUrl(url) { return PROXY_PREFIX + encodeURIComponent(url); }
  function resolveUrl(url) { try { return new URL(url, '${finalUrl}').href; } catch(e) { return url; } }

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var action = form.getAttribute('action') || '';
    if (action.indexOf('/api/proxy') !== -1) return;
    form.setAttribute('action', proxyUrl(resolveUrl(action)));
  }, true);

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0)==='#' || href.indexOf('javascript:')===0 || href.indexOf('mailto:')===0) return;
    if (href.indexOf('/api/proxy') !== -1) return;
    var absHref = resolveUrl(href);
    if (absHref.indexOf(ORIGINAL_BASE) === 0) { e.preventDefault(); window.location.href = proxyUrl(absHref); }
  }, true);

  // Override form.submit() — JSF calls this directly, bypassing the submit event
  var origSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function() {
    var action = this.getAttribute('action') || '';
    if (action.indexOf('/api/proxy') === -1) {
      this.setAttribute('action', proxyUrl(resolveUrl(action)));
    }
    return origSubmit.call(this);
  };

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var resolved = resolveUrl(url);
    if (resolved.indexOf(ORIGINAL_BASE)===0 && url.indexOf('/api/proxy')===-1) arguments[1] = proxyUrl(resolved);
    return origOpen.apply(this, arguments);
  };

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input==='string') { var resolved=resolveUrl(input); if(resolved.indexOf(ORIGINAL_BASE)===0&&input.indexOf('/api/proxy')===-1) input=proxyUrl(resolved); }
    return origFetch.call(this, input, init);
  };

  console.log('[Aglamaz Proxy] Content script injected and ready');
})();
</script>`
}
