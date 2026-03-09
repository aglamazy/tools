'use client'

import dynamic from 'next/dynamic'
import React from 'react'

if (typeof window !== 'undefined') {
  require('tinymce/tinymce')
  require('tinymce/icons/default')
  require('tinymce/themes/silver')
  require('tinymce/models/dom')
  require('tinymce/plugins/link')
  require('tinymce/plugins/lists')
  require('tinymce/plugins/code')
  require('tinymce/plugins/directionality')
}

const TinyMCEEditor = dynamic(
  async () => (await import('@tinymce/tinymce-react')).Editor as any,
  { ssr: false },
) as unknown as React.ComponentType<any>

type RichEditorProps = {
  value: string
  onChange: (html: string) => void
  height?: number
}

export default function RichEditor({ value, onChange, height = 350 }: RichEditorProps) {
  return (
    <TinyMCEEditor
      value={value}
      onEditorChange={(content: string) => onChange(content)}
      init={{
        menubar: false,
        height,
        plugins: 'lists link code directionality',
        toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link | ltr rtl | code',
        toolbar_mode: 'wrap',
        block_formats: 'Paragraph=p; Heading 1=h1; Heading 2=h2; Heading 3=h3; Quote=blockquote',
        directionality: 'rtl' as const,
        skin: 'oxide',
        skin_url: '/tinymce/skins/ui/oxide',
        content_css: '/tinymce/skins/content/default/content.min.css',
        content_style: 'body { font-family: Arial,Helvetica,sans-serif; font-size:14px; direction: rtl; }',
        mobile: {
          menubar: false,
          plugins: 'lists link code directionality',
          toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link | ltr rtl | code',
          toolbar_mode: 'wrap',
        },
        license_key: 'gpl',
      }}
    />
  )
}
