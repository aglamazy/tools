// Application configuration

export const config = {
  // Developer mode - enables additional validation and debugging
  developerMode: process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true',

  // Sync cadence (minutes). Update here to change auto-sync frequency across app.
  syncIntervalMinutes: 5,
}
