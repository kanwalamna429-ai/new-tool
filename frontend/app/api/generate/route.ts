// =============================================================================
// POST /api/generate — AI Content Generation
//
// Generates platform-specific posts from extracted URL content using Gemini,
// saves results to generated_content, and creates scheduled_posts rows
// with scheduled_at = NOW() so they can be immediately published.
//
// Body:
//   urlId:         string          — source campaign_url ID
//   campaignId:    string          — parent campaign ID
//   platforms:     string[]        — platform IDs to generate for
//   connectionIds: Record<string, string>  — platform → connection ID map
//   editedContent?: Record<string, string> — user-edited content overrides
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSocialPost } from '@/lib/services/ai/social-post'
import { generateDescription } from '@/lib/services/ai/description'
import { getPlatformConfig } from '@/lib/platforms'
import type { ContentContext, SocialPlatform } from '@/lib/services/ai/types'

interface GenerateBody {
  urlId:          string
  campaignId:     string
  platforms:      string[]
  connectionIds:  Record<string, string>
  editedContent?: Record<string, string>
}

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

  // ---------------------------------------------------------------------------
  // Load extracted_content for this URL
  // ---------------------------------------------------------------------------
  const { data: extracted } = await supabase
    .from('extracted_content')
    .select('id, title, description, body, author, og_image_url, keywords, source_url, published_at, metadata')
    .eq('url_id', urlId)
    .maybeSingle()

  // Load the campaign_url for fallback title/URL
  const { data: urlRow } = await supabase
    .from('campaign_urls')
    .select('original_url, title')
    .eq('id', urlId)
    .maybeSingle()

  const ctx: ContentContext = {
    sourceText:   extracted?.body ?? extracted?.description ?? extracted?.title ?? urlRow?.original_url ?? '',
    title:        extracted?.title ?? urlRow?.title ?? undefined,
    description:  extracted?.description ?? undefined,
    author:       extracted?.author ?? undefined,
    sourceUrl:    extracted?.source_url ?? urlRow?.original_url ?? undefined,
    keywords:     extracted?.keywords ?? undefined,
    publishDate:  extracted?.published_at ? new Date(extracted.published_at) : undefined,
    extractedContentId: extracted?.id,
    campaignId,
  }

  // ---------------------------------------------------------------------------
  // Generate content per platform
  // ---------------------------------------------------------------------------
  const scheduledAt = new Date().toISOString()
  const results: Array<{
    platform:         string
    content:          string
    hashtags:         string[]
    generatedContentId: string
    scheduledPostId:  string
    connectionId:     string | null
    error?:           string
  }> = []

  for (const platform of platforms) {
    const connectionId = connectionIds[platform] ?? null
    const platformConfig = getPlatformConfig(platform)
    const promptCategory = platformConfig?.aiConfig.promptCategory ?? 'social_post'

    let content = ''
    let hashtags: string[] = []

    // Use user-edited content if provided
    if (editedContent[platform]) {
      content = editedContent[platform]
    } else {
      try {
        if (promptCategory === 'bookmark_note') {
          const result = await generateDescription(ctx, { targetWords: 30, style: 'sentence' })
          if (result.success && result.descriptions.length > 0) {
            content = result.descriptions[0]
          }
        } else {
          const result = await generateSocialPost(ctx, {
            platform:        platform as SocialPlatform,
            includeHashtags: true,
            includeEmoji:    platformConfig?.aiConfig.emojiStyle !== 'none',
          })
          if (result.success && result.posts.length > 0) {
            content   = result.posts[0].content
            hashtags  = result.posts[0].hashtags
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[generate] AI failed for ${platform}:`, message)
        // Fall back to title or source URL
        content = ctx.title ?? ctx.sourceUrl ?? platform
      }
    }

    if (!content) {
      content = ctx.title ?? ctx.sourceUrl ?? `[Content for ${platform}]`
    }

    // Save to generated_content
    const { data: genRow, error: genError } = await supabase
      .from('generated_content')
      .insert({
        user_id:             user.id,
        campaign_id:         campaignId,
        extracted_content_id: extracted?.id ?? null,
        platform,
        content,
        content_type:        'post',
        hashtags,
        is_approved:         false,
        metadata: {
          url_id:     urlId,
          source_url: ctx.sourceUrl ?? null,
        },
      })
      .select('id')
      .single()

    if (genError || !genRow) {
      results.push({ platform, content, hashtags, generatedContentId: '', scheduledPostId: '', connectionId, error: genError?.message })
      continue
    }

    // Create scheduled_post with scheduled_at = NOW() for immediate publishing
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
          content_pending: false,
          hashtags,
          source_url:  ctx.sourceUrl ?? null,
          title:       ctx.title ?? null,
          generated_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single()

    if (postError || !postRow) {
      results.push({ platform, content, hashtags, generatedContentId: genRow.id, scheduledPostId: '', connectionId, error: postError?.message })
      continue
    }

    results.push({
      platform,
      content,
      hashtags,
      generatedContentId: genRow.id,
      scheduledPostId:    postRow.id,
      connectionId,
    })
  }

  return NextResponse.json({ success: true, posts: results })
}
