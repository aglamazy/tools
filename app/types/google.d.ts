// Google Identity Services (GIS) type definitions

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
  callback: (response: TokenResponse) => void
}

interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: { type: string; message: string }) => void
  prompt?: string
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: TokenClientConfig) => TokenClient
  revoke: (token: string, callback?: () => void) => void
}

interface GoogleAccounts {
  oauth2: GoogleAccountsOAuth2
}

interface Google {
  accounts: GoogleAccounts
}

declare global {
  interface Window {
    google?: Google
  }
}

export {}
