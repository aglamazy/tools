import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BudgetCategoryChart from './BudgetCategoryChart'

const categoryData = [
  { name: 'הלוואה/מימון', value: 10000, color: '#f00' },
  { name: 'מזון', value: 950, color: '#0f0' },
]
const props = (over: Partial<React.ComponentProps<typeof BudgetCategoryChart>> = {}) => ({
  categoryData,
  drillDownCategory: null,
  onBackFromDrillDown: () => {},
  selectedCategories: new Set<string>(),
  isCollapsed: false,
  onToggleCollapsed: () => {},
  onPieClick: () => {},
  onCategoryClick: vi.fn(),
  onSubjectGraphClick: vi.fn(),
  ...over,
})

// Walk the element tree the (hook-free) component returns, to reach the
// row and button onClick handlers without a DOM.
type El = React.ReactElement<{ children?: React.ReactNode; onClick?: (e: unknown) => void; 'data-subject-graph'?: string }>
function find(node: React.ReactNode, pred: (el: El) => boolean, out: El[] = []): El[] {
  if (Array.isArray(node)) { node.forEach((c) => find(c, pred, out)); return out }
  if (!React.isValidElement(node)) return out
  const el = node as El
  if (pred(el)) out.push(el)
  find(el.props.children, pred, out)
  return out
}

describe('subject row graph button (aglamazo#465)', () => {
  it('renders one graph button per subject row', () => {
    const html = renderToStaticMarkup(<BudgetCategoryChart {...props()} />)
    expect(html.match(/title="גרף שנתי"/g)).toHaveLength(categoryData.length)
    expect(html).toContain('data-subject-graph="מזון"')
  })

  it('click calls onSubjectGraphClick with the name and not onCategoryClick', () => {
    const p = props()
    const tree = BudgetCategoryChart(p)
    const buttons = find(tree, (el) => el.type === 'button' && !!el.props['data-subject-graph'])
    expect(buttons).toHaveLength(2)
    const stopPropagation = vi.fn()
    buttons[1].props.onClick!({ stopPropagation })
    expect(stopPropagation).toHaveBeenCalled()
    expect(p.onSubjectGraphClick).toHaveBeenCalledWith('מזון')
    expect(p.onCategoryClick).not.toHaveBeenCalled()
  })
})
