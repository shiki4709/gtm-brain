import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getProductContext, saveProductContext } from '@/lib/product-context'
import type { ProductContext } from '@/lib/types'

// GET — fetch existing product context
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const context = await getProductContext(auth.sb, auth.dbUser.id)
  return NextResponse.json({ success: true, context })
}

// POST — save product context
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { whatYouSell, whoItsFor, painPoints, differentiator, cta } = body as Partial<ProductContext>

  if (!whatYouSell?.trim()) {
    return NextResponse.json(
      { error: 'At minimum, describe what you sell' },
      { status: 400 }
    )
  }

  const context: ProductContext = {
    whatYouSell: whatYouSell.trim(),
    whoItsFor: whoItsFor?.trim() ?? '',
    painPoints: painPoints?.trim() ?? '',
    differentiator: differentiator?.trim() ?? '',
    cta: cta?.trim() ?? '',
  }

  try {
    await saveProductContext(auth.sb, auth.dbUser.id, context)
    return NextResponse.json({
      success: true,
      context,
      message: 'Product context saved. All content will be aligned with your product.',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save product context'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
