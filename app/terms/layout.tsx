import type { Metadata } from 'next'
import { branding } from '@/app/config'

export const metadata: Metadata = {
  title: `תנאי שימוש | ${branding.name}`,
  description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: `תנאי שימוש | ${branding.name}`,
    description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
    url: '/terms',
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `תנאי שימוש | ${branding.name}`,
    description: `תנאי השימוש של ${branding.name}. קראו את התנאים וההגבלות לפני השימוש בשירות.`,
    url: 'https://aglamazo.com/terms',
    inLanguage: 'he',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: branding.name, item: 'https://aglamazo.com/' },
      { '@type': 'ListItem', position: 2, name: 'תנאי שימוש', item: 'https://aglamazo.com/terms' },
    ],
  },
]

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  )
}
