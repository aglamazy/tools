// Tiny CDP driver — speaks Chrome DevTools Protocol over a tab's WebSocket.
// Usage:
//   import { connect } from './cdp.mjs'
//   const tab = await connect('4E66A467AB2DFFAB7AEA55A3B8E990B3')
//   const r = await tab.eval('document.title')
//   tab.close()
//
// Find tab IDs with `curl http://127.0.0.1:9222/json/list`.
// Requires Node 22+ (built-in WebSocket).

const HOST = '127.0.0.1:9222'

export async function listTabs() {
  const r = await fetch(`http://${HOST}/json/list`)
  return r.json()
}

export async function findTab(predicate) {
  const tabs = await listTabs()
  return tabs.find(predicate)
}

export async function openTab(url) {
  const r = await fetch(`http://${HOST}/json/new?${url}`, { method: 'PUT' })
  return r.json()
}

export async function closeTab(tabId) {
  await fetch(`http://${HOST}/json/close/${tabId}`)
}

export async function connect(tabIdOrUrl) {
  let ws
  if (tabIdOrUrl.startsWith('ws://')) ws = new WebSocket(tabIdOrUrl)
  else ws = new WebSocket(`ws://${HOST}/devtools/page/${tabIdOrUrl}`)

  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let nextId = 1
  const pending = new Map()

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id != null) {
      const p = pending.get(data.id)
      if (p) {
        pending.delete(data.id)
        if (data.error) p.reject(new Error(`${data.error.message} (code ${data.error.code})`))
        else p.resolve(data.result)
      }
    }
  }

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

  // Enable runtime for evaluate
  await send('Runtime.enable')
  await send('Page.enable')

  return {
    send,
    async eval(expression, opts = {}) {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
        ...opts,
      })
      if (r.exceptionDetails) {
        const msg = r.exceptionDetails.exception?.description || r.exceptionDetails.text
        throw new Error(`Eval failed: ${msg}`)
      }
      return r.result?.value
    },
    async waitFor(jsCondition, { timeoutMs = 10000, pollMs = 200 } = {}) {
      const t0 = Date.now()
      while (Date.now() - t0 < timeoutMs) {
        const ok = await this.eval(jsCondition)
        if (ok) return true
        await new Promise((r) => setTimeout(r, pollMs))
      }
      throw new Error(`waitFor timed out: ${jsCondition}`)
    },
    async navigate(url) {
      await send('Page.navigate', { url })
      await this.waitFor('document.readyState === "complete"', { timeoutMs: 15000 })
    },
    async screenshot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(path, Buffer.from(r.data, 'base64'))
      return path
    },
    close() {
      ws.close()
    },
  }
}
