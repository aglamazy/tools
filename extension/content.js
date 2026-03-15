// Aglamaz Form Assistant — Content Script
// Extracts form fields from the active page and fills them on command

(function () {
  'use strict'

  let fieldCounter = 0

  // Generate a unique CSS selector for an element
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id)
    if (el.name) {
      const byName = document.querySelectorAll(`[name="${CSS.escape(el.name)}"]`)
      if (byName.length === 1) return `[name="${CSS.escape(el.name)}"]`
    }
    // Fallback: build path
    const parts = []
    let current = el
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase()
      if (current.id) {
        selector = '#' + CSS.escape(current.id)
        parts.unshift(selector)
        break
      }
      const parent = current.parentElement
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName)
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1
          selector += `:nth-of-type(${index})`
        }
      }
      parts.unshift(selector)
      current = parent
    }
    return parts.join(' > ')
  }

  // Find the nearest section heading for context (e.g. "Personal data", "Contact information")
  function getSection(el) {
    let node = el
    while (node && node !== document.body) {
      // Look for a preceding heading within the same fieldset/section/form group
      const parent = node.parentElement
      if (parent) {
        const siblings = Array.from(parent.children)
        const idx = siblings.indexOf(node)
        for (let i = idx - 1; i >= 0; i--) {
          const sib = siblings[i]
          const heading = sib.matches?.('h1,h2,h3,h4,h5,h6,legend')
            ? sib
            : sib.querySelector?.('h1,h2,h3,h4,h5,h6,legend')
          if (heading) return heading.textContent.trim()
        }
      }
      node = parent
    }
    return ''
  }

  // Find the label text associated with a form element
  function getLabel(el) {
    // 1. Explicit <label for="...">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (label) return label.textContent.trim()
    }
    // 2. Wrapping <label>
    const parentLabel = el.closest('label')
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true)
      const inputs = clone.querySelectorAll('input, textarea, select')
      inputs.forEach(i => i.remove())
      const text = clone.textContent.trim()
      if (text) return text
    }
    // 3. aria-label / aria-labelledby
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')
    if (el.getAttribute('aria-labelledby')) {
      const labelEl = document.getElementById(el.getAttribute('aria-labelledby'))
      if (labelEl) return labelEl.textContent.trim()
    }
    // 4. title attribute
    if (el.title) return el.title
    // 5. Table layout: previous <td> or <th> in the same <tr>
    const parentTd = el.closest('td')
    if (parentTd) {
      const prevTd = parentTd.previousElementSibling
      if (prevTd && (prevTd.tagName === 'TD' || prevTd.tagName === 'TH')) {
        const text = prevTd.textContent.trim()
        if (text) return text
      }
      // Also check <th> in the same row
      const tr = parentTd.closest('tr')
      if (tr) {
        const th = tr.querySelector('th')
        if (th) {
          const text = th.textContent.trim()
          if (text) return text
        }
      }
    }
    // 6. Previous sibling element with text
    let prev = el.previousElementSibling
    if (!prev && el.parentElement) prev = el.parentElement.previousElementSibling
    if (prev && prev.textContent.trim() && !prev.querySelector('input, textarea, select')) {
      return prev.textContent.trim()
    }
    // 7. Placeholder as fallback
    return el.placeholder || el.name || ''
  }

  // Solve simple math captchas (e.g. "Please add up 1 and 39", "Bitte zählen Sie 3 und 7 zusammen")
  function solveCaptcha(inputEl) {
    // Walk up to find a container that has the question text (skip the input itself)
    let container = inputEl.parentElement
    let text = ''
    while (container && container !== document.body) {
      text = container.textContent || ''
      if (/\d+\s*(?:and|und|plus|\+)\s*\d+/.test(text)) break
      container = container.parentElement
    }
    if (!text) return null
    // Match patterns like "add up X and Y", "X und Y zusammen", "X + Y", "sum of X and Y"
    const patterns = [
      /(?:add|sum|plus|zählen|zusammen)[^\d]*(\d+)\s*(?:and|und|plus|\+)\s*(\d+)/i,
      /(\d+)\s*(?:and|und|plus|\+)\s*(\d+)\s*(?:add|sum|together|zusammen)/i,
      /(\d+)\s*\+\s*(\d+)/,
      /(\d+)\s*(?:\*|times|mal|×)\s*(\d+)/,
      /(\d+)\s*(?:-|minus)\s*(\d+)/,
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const a = parseInt(match[1], 10)
        const b = parseInt(match[2], 10)
        if (/\*|times|mal|×/.test(match[0])) return a * b
        if (/-|minus/.test(match[0])) return a - b
        return a + b
      }
    }
    return null
  }

  // Extract all form fields from the page
  function extractFields() {
    const fields = []
    const elements = document.querySelectorAll('input, textarea, select')

    for (const el of elements) {
      // Skip hidden, submit, button, and already-processed hidden types
      const type = (el.type || 'text').toLowerCase()
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue
      // Skip elements not visible
      if (el.offsetParent === null && el.type !== 'file') continue
      // Skip fields outside the main content (login forms, language selectors, nav/footer chrome)
      if (el.closest('header, nav, footer, [role="banner"], [role="contentinfo"]')) continue

      const fieldId = el.id || el.name || `aglamaz-field-${++fieldCounter}`
      if (!el.id && !el.getAttribute('data-aglamaz-id')) {
        el.setAttribute('data-aglamaz-id', fieldId)
      }

      const fieldData = {
        id: fieldId,
        type: el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : type,
        label: getLabel(el),
        section: getSection(el),
        name: el.name || '',
        placeholder: el.placeholder || '',
        value: el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text || '' : el.value || '',
        required: el.required || /^\*/.test(getLabel(el).trim()),
        selector: getSelector(el),
      }

      // For select elements, include options
      if (el.tagName === 'SELECT') {
        fieldData.options = Array.from(el.options).map(o => ({ value: o.value, text: o.text }))
      }

      // For file elements, include accepted types
      if (type === 'file' && el.accept) {
        fieldData.accept = el.accept
      }

      // Solve simple math captchas
      if (/captcha|sicherheitsabfrage|security.?question/i.test(fieldData.label || fieldData.name || fieldData.id)) {
        const answer = solveCaptcha(el)
        if (answer !== null) fieldData.captchaAnswer = String(answer)
      }

      fields.push(fieldData)
    }

    // Deduplicate: when multiple fields share the same label, keep the select over input
    const seen = new Map()
    for (const f of fields) {
      const key = f.label.trim().toLowerCase().replace(/[\s*]+/g, ' ').trim()
      if (!key) continue
      if (seen.has(key)) {
        const prev = seen.get(key)
        // Prefer select over text input (custom widgets often render both)
        if (f.type === 'select' && prev.type !== 'select') {
          seen.set(key, f)
        }
        // else keep the first one
      } else {
        seen.set(key, f)
      }
    }
    // Build deduped list: keep fields with no label as-is, dedup the rest
    const dedupedIds = new Set(Array.from(seen.values()).map(f => f.id))
    const deduped = fields.filter(f => {
      const key = f.label.trim().toLowerCase().replace(/[\s*]+/g, ' ').trim()
      return !key || dedupedIds.has(f.id)
    })

    return { fields: deduped, pageUrl: window.location.href, hostname: window.location.hostname }
  }

  // Fill a file input using DataTransfer API
  function fillFileField(selector, fileInfo) {
    const el = document.querySelector(selector)
    if (!el || el.type !== 'file') {
      console.warn('[Aglamaz] File field not found or not a file input:', selector)
      return false
    }

    try {
      // Convert data URL to a File object
      const byteString = atob(fileInfo.dataUrl.split(',')[1])
      const mimeType = fileInfo.type
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab], { type: mimeType })
      const file = new File([blob], fileInfo.name, { type: mimeType })

      // Use DataTransfer to set the file on the input
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      el.files = dataTransfer.files

      // Dispatch events so frameworks detect the change
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))

      console.log('[Aglamaz] File attached:', fileInfo.name)
      return true
    } catch (err) {
      console.error('[Aglamaz] Failed to attach file:', err)
      return false
    }
  }

  // Fill a single field with a value
  function fillField(selector, value) {
    const el = document.querySelector(selector)
    if (!el) {
      console.warn('[Aglamaz] Field not found:', selector)
      return false
    }

    if (el.tagName === 'SELECT') {
      // Find option by value or text
      const option = Array.from(el.options).find(o => o.value === value || o.text === value)
      if (option) {
        el.value = option.value
      }
    } else if (el.type === 'file') {
      // Cannot programmatically set file inputs
      console.log('[Aglamaz] Skipping file field:', selector)
      return false
    } else {
      // Set value using native setter to trigger React/framework bindings
      const nativeSetter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(el, value)
      } else {
        el.value = value
      }
    }

    // Dispatch events so JS frameworks pick up the change
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
    return true
  }

  // Send extracted fields to the extension
  function sendFieldsToExtension() {
    const data = extractFields()
    console.log('[Aglamaz] Extracted fields:', data.fields.length)
    chrome.runtime.sendMessage({ type: 'FORM_FIELDS_EXTRACTED', data })
  }

  // Listen for messages from the sidebar/background
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_FIELDS') {
      const data = extractFields()
      sendResponse(data)
      return true
    }

    if (message.type === 'FILL_FIELDS') {
      const results = []
      for (const { selector, value } of message.fields) {
        results.push({ selector, success: fillField(selector, value) })
      }
      sendResponse({ results })
      return true
    }

    if (message.type === 'FILL_FILE_FIELD') {
      const success = fillFileField(message.selector, message.file)
      sendResponse({ success })
      return true
    }

    if (message.type === 'FILL_SINGLE_FIELD') {
      const success = fillField(message.selector, message.value)
      sendResponse({ success })
      return true
    }
  })

  // Observe DOM changes for multi-step forms
  const observer = new MutationObserver((mutations) => {
    // Check if form-related elements were added or visibility changed
    const hasFormChanges = mutations.some(m =>
      m.type === 'childList' && (
        m.addedNodes.length > 0 || m.removedNodes.length > 0
      )
    )
    if (hasFormChanges) {
      // Debounce: wait a bit for the DOM to settle
      clearTimeout(observer._debounceTimer)
      observer._debounceTimer = setTimeout(() => {
        console.log('[Aglamaz] DOM changed, re-scanning fields')
        sendFieldsToExtension()
      }, 500)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // Initial scan after page load
  if (document.readyState === 'complete') {
    sendFieldsToExtension()
  } else {
    window.addEventListener('load', sendFieldsToExtension)
  }
})()
