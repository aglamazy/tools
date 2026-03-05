import type { ReactNode } from 'react'
import Sidebar from '@/app/components/Sidebar'
import PageHeader from '@/app/components/PageHeader'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader />
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          {children}
        </div>
      </div>
    </>
  )
}
