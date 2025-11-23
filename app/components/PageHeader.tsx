import Link from 'next/link'

export default function PageHeader() {
  return (
    <header className="page-header">
      <div className="page-header-inner">      <div aria-hidden="true" style={{ minWidth: '72px' }} />
        <div className="page-header-title">
          <h1>ארגז כלים פיננסיים</h1>
        </div>
        <Link href="/" className="home-link">
          <span role="img" aria-label="home">🏠</span>
        </Link>
      </div>
    </header>
  )
}
