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
      // Remove the input itself from clone to get label text only
      const inputs = clone.querySelectorAll('input, textarea, select')
      inputs.forEach(i => i.remove())
      const text = clone.textContent.trim()
      if (text) return text
    }
    // 3. Previous sibling or aria-label
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')
    if (el.getAttribute('aria-labelledby')) {
      const labelEl = document.getElementById(el.getAttribute('aria-labelledby'))
      if (labelEl) return labelEl.textContent.trim()
    }
    // 4. Placeholder as fallback
    return el.placeholder || el.name || ''
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

      const fieldId = el.id || el.name || `aglamaz-field-${++fieldCounter}`
      if (!el.id && !el.getAttribute('data-aglamaz-id')) {
        el.setAttribute('data-aglamaz-id', fieldId)
      }

      const fieldData = {
        id: fieldId,
        type: el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : type,
        label: getLabel(el),
        name: el.name || '',
        placeholder: el.placeholder || '',
        value: el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text || '' : el.value || '',
        required: el.required,
        selector: getSelector(el),
      }

      // For select elements, include options
      if (el.tagName === 'SELECT') {
        fieldData.options = Array.from(el.options).map(o => ({ value: o.value, text: o.text }))
      }

      fields.push(fieldData)
    }

    return { fields }
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
