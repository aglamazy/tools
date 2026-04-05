/**
 * Telegram Bot API types — subset used by the PA.
 * See https://core.telegram.org/bots/api
 */

// --- Incoming updates ---

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  entities?: TelegramMessageEntity[]
  reply_to_message?: TelegramMessage
}

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string       // group/supergroup/channel only
  username?: string    // private only
  first_name?: string  // private only
}

export interface TelegramMessageEntity {
  type: 'bot_command' | 'mention' | 'text_mention' | string
  offset: number
  length: number
}

export interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

// --- Outgoing messages ---

export interface SendMessageParams {
  chat_id: number | string
  text: string
  parse_mode?: 'MarkdownV2' | 'HTML'
  reply_markup?: InlineKeyboardMarkup | ReplyKeyboardRemove
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true
}

// --- Firestore schema ---

export interface TelegramLink {
  telegramUserId: number
  telegramChatId: number
  chatType: 'private' | 'group' | 'supergroup'
  uid: string                    // Aglamazo user uid
  linkedAt: string               // ISO date
  displayName?: string           // Telegram first_name
}

export interface TelegramFamilyConfig {
  telegramGroupId?: number       // linked group chat
  members: Record<string, {      // keyed by telegramUserId
    name: string
    uid?: string                 // Aglamazo uid if linked
  }>
}
