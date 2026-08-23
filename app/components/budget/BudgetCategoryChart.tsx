'use client'

import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

type CategorySlice = { name: string; value: number; color: string }

type BudgetCategoryChartProps = {
  categoryData: CategorySlice[]
  drillDownCategory: string | null
  onBackFromDrillDown: () => void
  selectedCategories: Set<string>
  isCollapsed: boolean
  onToggleCollapsed: () => void
  onPieClick: (categoryName: string, event: React.MouseEvent) => void
  onCategoryClick: (categoryName: string, event: React.MouseEvent) => void
}

export default function BudgetCategoryChart({
  categoryData, drillDownCategory, onBackFromDrillDown, selectedCategories,
  isCollapsed, onToggleCollapsed, onPieClick, onCategoryClick,
}: BudgetCategoryChartProps) {
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2
        onClick={onToggleCollapsed}
        style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          marginBottom: '1rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          userSelect: 'none',
        }}
      >
        <span style={{
          transition: 'transform 0.2s',
          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
        }}>
          ▼
        </span>
        פילוח הוצאות לפי נושא
      </h2>
      {!isCollapsed && categoryData.length === 0 && (
        <p style={{ color: '#64748b', fontSize: '0.9rem', padding: '1rem 0' }}>
          אין הוצאות להצגה בתקופה זו.
        </p>
      )}
      {!isCollapsed && categoryData.length > 0 && (
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ flex: '0 0 450px', height: '350px', position: 'relative' }}>
          {/* Category name badge and back button when in drill-down mode */}
          {drillDownCategory && (
            <div
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                left: '10px',
                zIndex: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <button
                onClick={onBackFromDrillDown}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                → חזרה
              </button>
              <div
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f0f9ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#1e40af',
                }}
              >
                {drillDownCategory}
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                outerRadius={120}
                fill="#8884d8"
                dataKey="value"
                onClick={(data, index, event) => onPieClick(data.name, event as any)}
                style={{ cursor: 'pointer' }}
                labelLine={true}
                label={(props: any) => {
                  const { cx, cy, midAngle, outerRadius, name, percent } = props
                  const RADIAN = Math.PI / 180
                  const radius = outerRadius + 25
                  const x = cx + radius * Math.cos(-midAngle * RADIAN)
                  const y = cy + radius * Math.sin(-midAngle * RADIAN)
                  const percentValue = (percent ?? 0) * 100
                  const percentString = percentValue.toFixed(0)

                  if (percentValue < 1) return null

                  const text = percentValue > 3 ? `${name} ${percentString}%` : `${percentString}%`

                  return (
                    <text
                      x={x}
                      y={y}
                      fill="#1f2937"
                      textAnchor={x > cx ? 'start' : 'end'}
                      dominantBaseline="central"
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        stroke: '#ffffff',
                        strokeWidth: 3,
                        paintOrder: 'stroke',
                      }}
                    >
                      {text}
                    </text>
                  )
                }}
                isAnimationActive={false}
              >
                {categoryData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    opacity={selectedCategories.size === 0 || selectedCategories.has(entry.name) ? 1 : 0.3}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) =>
                  new Intl.NumberFormat('he-IL', {
                    style: 'currency',
                    currency: 'ILS',
                  }).format(value)
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {categoryData.map((cat) => (
              <div
                key={cat.name}
                onClick={(e) => onCategoryClick(cat.name, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  background: selectedCategories.has(cat.name) ? '#e0f2fe' : '#f8fafc',
                  border: selectedCategories.has(cat.name) ? '2px solid #0284c7' : '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: selectedCategories.size === 0 || selectedCategories.has(cat.name) ? 1 : 0.5,
                }}
                onMouseEnter={(e) => {
                  if (!selectedCategories.has(cat.name)) {
                    e.currentTarget.style.background = '#f1f5f9'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selectedCategories.has(cat.name)) {
                    e.currentTarget.style.background = '#f8fafc'
                  }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: cat.color,
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>{cat.name}</span>
                  {selectedCategories.has(cat.name) && (
                    <span style={{ fontSize: '0.75rem', color: '#0284c7' }}>✓</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {((cat.value / categoryData.reduce((sum, c) => sum + c.value, 0)) * 100).toFixed(1)}%
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {new Intl.NumberFormat('he-IL', {
                      style: 'currency',
                      currency: 'ILS',
                    }).format(cat.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
    </section>
  )
}
