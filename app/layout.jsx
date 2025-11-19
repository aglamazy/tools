import './globals.css'

export const metadata = {
  title: 'Future Payments Forecast',
  description: 'Upload your credit card statement to forecast upcoming installment charges.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="he">
      <body>{children}</body>
    </html>
  )
}
