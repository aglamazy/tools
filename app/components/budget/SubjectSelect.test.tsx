import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SubjectSelect from './SubjectSelect'
import type { Category } from '@/app/types/category'

const categories = [
  { id: 'car', name: 'רכב', type: 'expense' },
  { id: 'fuel', name: 'דלק', type: 'expense', parentId: 'car' },
] as Category[]

const render = (value: string) =>
  renderToStaticMarkup(<SubjectSelect value={value} amount={-10} categories={categories} onChange={() => {}} />)

describe('SubjectSelect closed control (aglamazo#469)', () => {
  it('a child value shows "Parent › Child", the parent looked up by name', () => {
    const html = render('דלק')
    expect(html).toContain('רכב › ')
    expect(html).toContain('דלק')
  })

  it('a parent value shows alone; an unknown legacy value still shows as is', () => {
    expect(render('רכב')).not.toContain('›')
    expect(render('ישן')).toContain('ישן')
  })

  it('no value shows the placeholder; the list is not rendered until opened', () => {
    const html = render('')
    expect(html).toContain('בחר נושא')
    expect(html).not.toContain('role="listbox"')
  })
})
