/**
 * Telegram Bot API client — send messages, answer callbacks, set webhook.
 */

import type { SendMessageParams, InlineKeyboardMarkup } from './types'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

function apiUrl(method: string): string {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not configured')
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`
}

async function callApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const resp = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json()
  if (!data.ok) {
    console.error(`[Telegram] ${method} failed:`, data.description)
    throw new Error(`Telegram API error: ${data.description}`)
  }
  return data.result as T
}

/** Send a text message to a chat. */
export async function sendMessage(chatId: number | string, text: string, options?: {
  parseMode?: 'MarkdownV2' | 'HTML'
  replyMarkup?: SendMessageParams['reply_markup']
}) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
  }
  if (options?.parseMode) body.parse_mode = options.parseMode
  if (options?.replyMarkup) body.reply_markup = options.replyMarkup
  return callApi('sendMessage', body)
}

/** Send a message with inline keyboard buttons. */
export async function sendWithKeyboard(
  chatId: number | string,
  text: string,
  keyboard: InlineKeyboardMarkup,
  parseMode?: 'MarkdownV2' | 'HTML',
) {
  return sendMessage(chatId, text, { parseMode, replyMarkup: keyboard })
}

/** Answer a callback query (acknowledge button press). */
export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  })
}

/** Register the webhook URL with Telegram. Call once on deploy. */
export async function setWebhook(url: string, secretToken: string) {
  return callApi('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query'],
  })
}

/** Remove webhook. */
export async function deleteWebhook() {
  return callApi('deleteWebhook', {})
}

/** Get current webhook info (for debugging). */
export async function getWebhookInfo() {
  const resp = await fetch(apiUrl('getWebhookInfo'))
  const data = await resp.json()
  return data.result
}

/** Get bot info. */
export async function getMe() {
  const resp = await fetch(apiUrl('getMe'))
  const data = await resp.json()
  return data.result
}

/** Check if TELEGRAM_BOT_TOKEN is configured. */
export function isConfigured(): boolean {
  return !!BOT_TOKEN
}
