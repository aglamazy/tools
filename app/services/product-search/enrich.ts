import type { Product } from './types'
import { scrapeProductMeta } from '@/app/services/scrapeProductMeta'
import { parseQuantity, calcUnitPrice } from './unitPrice'

const hasRealPrice = (p: string | undefined) => p && /\d/.test(p)

/**
 * Enrich products in parallel: scrape missing metadata + calculate unit prices.
 */
export async function enrichProducts(products: Product[]): Promise<Product[]> {
  if (products.length === 0) return products

  return Promise.all(
    products.map(async (product) => {
      // Scrape missing metadata
      const meta = await scrapeProductMeta(product.url)
      if (meta.image && !product.image) product.image = meta.image
      if (meta.title && !product.name) product.name = meta.title
      if (meta.description && !product.description) product.description = meta.description
      if (meta.price && !hasRealPrice(product.price)) product.price = meta.price

      // Calculate unit price from product name + description
      const searchText = `${product.name} ${product.description || ''}`
      const quantity = parseQuantity(searchText)
      if (quantity && hasRealPrice(product.price)) {
        const unitPriceStr = calcUnitPrice(product.price, quantity)
        if (unitPriceStr) {
          product.unitPrice = unitPriceStr
          product.quantity = `${quantity.amount} ${quantity.displayUnit}`
        }
      }

      console.log(`[Enrich] "${product.name}": image=${!!meta.image}, price=${product.price || 'none'}, unitPrice=${product.unitPrice || 'none'}`)
      return product
    })
  )
}
