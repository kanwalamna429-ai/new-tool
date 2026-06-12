// =============================================================================
// POST /api/generate — AI Content Generation
//
// For a given campaign URL:
//  1. Load extracted content from DB
//  2. Load user's platform settings from public.settings
//  3. AI-rewrite a catchy title (once, shared across all platforms)
//  4. AI-rewrite a catchy description (once, shared across all platforms)
//  5. For each platform: generate platform-specific post using tone/style/cta
//     from settings. Append custom hashtags from settings.
//  6. Save to generated_content + scheduled_posts
//  7. Return enriched payload: image, rewrittenTitle, rewrittenDescription,
//     sourceUrl + per-platform post with hashtags and char limit info.
//
// Body:
//   urlId:         string
//   campaignId:    string
//   platforms:     string[]
//   connectionIds: Record<string, string>
//   editedContent?: Record<string, string>   — skip AI for these platforms
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSocialPost } from '@/lib/services/ai/social-post'
import { generateDescription } from '@/lib/services/ai/description'
import { generate } from '@/lib/services/ai/client'
import { buildTitlePrompt } from '@/lib/services/ai/prompts'
import { PLATFORM_LIMITS } from '@/lib/services/ai/prompts'
import { getPlatformConfig } from '@/lib/platforms'
import { loadSettings } from '@/lib/services/settings'
import type {
  ContentContext,
  SocialPlatform,
  ContentTone,
} from '@/lib/services/ai/types'
import type { PlatformDefaults, PlatformDefaultSettings } from '@/lib/services/settings'

const DEFAULT_PLATFORM_SETTING: PlatformDefaultSettings = {
  tone:         'professional',
  style:        'concise',
  hashtags:     '',
  cta:          '',
  includeEmoji: true,
  autoApprove:  false,
}

interface GenerateBody {
  urlId:          string
  campaignId:     string
  platforms:      string[]
  connectionIds:  Record<string, string>
  editedContent?: Record<string, string>
}

// ---------------------------------------------------------------------------
// AI-rewrite title — returns best single social title
// ---------------------------------------------------------------------------

async function rewriteTitle(ctx: ContentContext): Promise<string | null> {
  if (!ctx.title && !ctx.sourceText) return null
  try {
    const prompt = buildTitlePrompt(ctx, { purpose: 'social', variants: 1, maxLength: 100 })
    const response = await generate(prompt, { temperature: 0.8, maxOutputTokens: 128 })
    const raw = response.text.trim()
    // Response is a JSON array like ["Title here"]
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed[0]
    }
    return raw.replace(/^["']|["']$/g, '')   // fallback: strip quotes
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// AI-rewrite description — returns short catchy description
// ---------------------------------------------------------------------------

async function rewriteDescription(ctx: ContentContext): Promise<string | null> {
  if (!ctx.sourceText && !ctx.description) return null
  try {
    const result = await generateDescription(ctx, { targetWords: 50, style: 'sentence' })
    if (result.success && result.descriptions.length > 0) return result.descriptions[0]
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: GenerateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { urlId, campaignId, platforms, connectionIds, editedContent = {} } = body

  if (!urlId || !campaignId || !platforms?.length) {
    return NextResponse.json(
      { error: 'urlId, campaignId, and platforms are required' },
      { status: 400 }
    )
  }

  // -------------------------------------------------------------------------
  // 1. Load extracted content
  // -------------------------------------------------------------------------
  const { data: extracted } = await supabase
    .from('extracted_content')
    .select('id, title, description, body, author, og_image_url, keywords, source_url, published_at')
    .eq('url_id', urlId)
    .maybeSingle()

  const { data: urlRow } = await supabase
    .from('campaign_urls')
    .select('original_url, title')
    .eq('id', urlId)
    .maybeSingle()

  const ogImage    = extracted?.og_image_url ?? null
  const sourceUrl  = extracted?.source_url ?? urlRow?.original_url ?? null

  const baseCtx: ContentContext = {
    sourceText:  extracted?.body ?? extracted?.description ?? extracted?.title ?? urlRow?.original_url ?? '',
    title:       extracted?.title ?? urlRow?.title ?? undefined,
    description: extracted?.description ?? undefined,
    author:      extracted?.author ?? undefined,
    sourceUrl:   sourceUrl ?? undefined,
    keywords:    extracted?.keywords ?? undefined,
    publishDate: extracted?.published_at ? new Date(extracted.published_at) : undefined,
    extractedContentId: extracted?.id,
    campaignId,
  }

  // -------------------------------------------------------------------------
  // 2. Load user platform settings
  // -------------------------------------------------------------------------
  const platformDefaults = await loadSettings<PlatformDefaults>(
    supabase,
    user.id,
    'platform_defaults',
    {}
  )

  // -------------------------------------------------------------------------
  // 3. AI-rewrite title + description (once, shared across platforms)
  // -------------------------------------------------------------------------
  let rewrittenTitle       = baseCtx.title       ?? null
  let rewrittenDescription = baseCtx.description ?? null

  // Only run AI rewrites if we have source content and GEMINI_API_KEY is set
  if (process.env.GEMINI_API_KEY) {
    const [aiTitle, aiDesc] = await Promise.allSettled([
      rewriteTitle(baseCtx),
      rewriteDescription(baseCtx),
    ])
    if (aiTitle.status === 'fulfilled' && aiTitle.value) {
      rewrittenTitle = aiTitle.value
    }
    if (aiDesc.status === 'fulfilled' && aiDesc.value) {
      rewrittenDescription = aiDesc.value
    }
  }

  // Enrich context with rewritten content for platform-specific generation
  const enrichedCtx: ContentContext = {
    ...baseCtx,
    title:       rewrittenTitle       ?? baseCtx.title,
    description: rewrittenDescription ?? baseCtx.description,
  }

  // -------------------------------------------------------------------------
  // 4. Generate per-platform posts
  // -------------------------------------------------------------------------
  const scheduledAt = new Date().toISOString()
  const results: Array<{
    platform:           string
    content:            string
    hashtags:           string[]
    charLimit:          number
    generatedContentId: string
    scheduledPostId:    string
    connectionId:       string | null
    error?:             string
  }> = []

  for (const platform of platforms) {
    const connectionId  = connectionIds[platform] ?? null
    const platformConfig = getPlatformConfig(platform)
    const promptCategory = platformConfig?.aiConfig.promptCategory ?? 'social_post'
    const limits = PLATFORM_LIMITS[platform as SocialPlatform]
    const charLimit = limits?.charLimit ?? 500

    // Per-platform settings from user's saved defaults
    const pSettings: PlatformDefaultSettings = {
      ...DEFAULT_PLATFORM_SETTING,
      tone:         platformConfig?.aiConfig.toneDefault ?? 'professional',
      includeEmoji: (platformConfig?.aiConfig.emojiStyle ?? 'moderate') !== 'none',
      ...(platformDefaults[platform] ?? {}),
    }

    let content  = ''
    let hashtags: string[] = []

    // Use user-edited content if provided — skip AI for this platform
    if (editedContent[platform]) {
      content = editedContent[platform]
    } else if (process.env.GEMINI_API_KEY) {
      try {
        if (promptCategory === 'bookmark_note') {
          const result = await generateDescription(enrichedCtx, {
            targetWords: Math.min(30, Math.floor(charLimit / 5)),
            style:       'sentence',
          })
          if (result.success && result.descriptions.length > 0) {
            content = result.descriptions[0]
          }
        } else {
          const result = await generateSocialPost(enrichedCtx, {
            platform:        platform as SocialPlatform,
            tone:            pSettings.tone as ContentTone,
            includeHashtags: true,
            includeEmoji:    pSettings.includeEmoji,
            cta:             pSettings.cta || undefined,
          })
          if (result.success && result.posts.length > 0) {
            content  = result.posts[0].content
            hashtags = result.posts[0].hashtags
          }
        }
      } catch (err) {
        console.error(`[generate] AI failed for ${platform}:`, err instanceof Error ? err.message : err)
        content = enrichedCtx.title ?? sourceUrl ?? `[Content for ${platform}]`
      }
    } else {
      // No API key — use title + source URL as fallback
      content = enrichedCtx.title ?? sourceUrl ?? `[Content for ${platform}]`
    }

    if (!content) content = enrichedCtx.title ?? sourceUrl ?? `[Content for ${platform}]`

    // Merge custom hashtags from settings
    if (pSettings.hashtags) {
      const custom = pSettings.hashtags
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`))
      hashtags = [...new Set([...hashtags, ...custom])]
    }

    // -----------------------------------------------------------------------
    // Save to generated_content
    // -----------------------------------------------------------------------
    const { data: genRow, error: genError } = await supabase
      .from('generated_content')
      .insert({
        user_id:              user.id,
        campaign_id:          campaignId,
        extracted_content_id: extracted?.id ?? null,
        platform,
        content,
        content_type:         'post',
        hashtags,
        is_approved:          pSettings.autoApprove,
        metadata: {
          url_id:               urlId,
          source_url:           sourceUrl,
          og_image:             ogImage,
          rewritten_title:      rewrittenTitle,
          rewritten_description: rewrittenDescription,
          char_limit:           charLimit,
          tone:                 pSettings.tone,
          style:                pSettings.style,
        },
      })
      .select('id')
      .single()

    if (genError || !genRow) {
      results.push({
        platform, content, hashtags, charLimit,
        generatedContentId: '', scheduledPostId: '',
        connectionId, error: genError?.message,
      })
      continue
    }

    // -----------------------------------------------------------------------
    // Create scheduled_post (scheduled_at = NOW() for immediate publishing)
    // -----------------------------------------------------------------------
    const { data: postRow, error: postError } = await supabase
      .from('scheduled_posts')
      .insert({
        user_id:               user.id,
        campaign_id:           campaignId,
        url_id:                urlId,
        connection_id:         connectionId,
        generated_content_id:  genRow.id,
        platform,
        content,
        scheduled_at:          scheduledAt,
        status:                'pending',
        metadata: {
          content_pending:       false,
          hashtags,
          source_url:            sourceUrl,
          og_image:              ogImage,
          title:                 rewrittenTitle,
          description:           rewrittenDescription,
          generated_at:          new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    if (postError || !postRow) {
      results.push({
        platform, content, hashtags, charLimit,
        generatedContentId: genRow.id, scheduledPostId: '',
        connectionId, error: postError?.message,
      })
      continue
    }

    results.push({
      platform, content, hashtags, charLimit,
      generatedContentId: genRow.id,
      scheduledPostId:    postRow.id,
      connectionId,
    })
  }

  return NextResponse.json({
    success:              true,
    rewrittenTitle,
    rewrittenDescription,
    ogImage,
    sourceUrl,
    posts:                results,
  })
}
