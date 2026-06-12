"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { SupabaseClient } from "@supabase/supabase-js"
import { PLATFORM_REGISTRY } from "@/lib/platforms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  RefreshCw,
  Sparkles,
  Send,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  FileText,
  Tag,
  User,
  Calendar,
  Image as ImageIcon,
  Link as LinkIcon,
  Hash,
  AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Supabase helper
// ---------------------------------------------------------------------------

function getSupabase(): SupabaseClient | null {
  try { return createClient() } catch { return null }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Campaign {
  id:        string
  name:      string
  status:    string
  platforms: string[]
}

interface CampaignUrl {
  id:           string
  original_url: string
  title:        string | null
  created_at:   string
}

interface ExtractedContent {
  id:           string
  title:        string | null
  description:  string | null
  author:       string | null
  og_image_url: string | null
  keywords:     string[]
  source_url:   string | null
  published_at: string | null
}

interface PlatformConnection {
  id:           string
  platform:     string
  display_name: string | null
  status:       string
}

interface GeneratedPost {
  platform:           string
  content:            string
  hashtags:           string[]
  charLimit:          number
  generatedContentId: string
  scheduledPostId:    string
  connectionId:       string | null
  error?:             string
}

interface GenerateResponse {
  success:              boolean
  rewrittenTitle:       string | null
  rewrittenDescription: string | null
  ogImage:              string | null
  sourceUrl:            string | null
  posts:                GeneratedPost[]
  error?:               string
}

type ExtractState  = "idle" | "extracting" | "done" | "error"
type GenerateState = "idle" | "generating" | "done" | "error"
type PublishState  = "idle" | "publishing" | "done" | "error"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") }
  catch { return url }
}

const PLATFORMS_WITH_ADAPTERS = new Set([
  "bluesky", "mastodon", "misskey", "pixelfed", "tumblr",
  "devto", "hashnode", "reddit", "diigo", "raindrop", "pocket", "instapaper",
])

// ---------------------------------------------------------------------------
// Post Preview Card — renders the full composed post (image + title + desc + body + url + tags)
// ---------------------------------------------------------------------------

interface PostPreviewProps {
  platform:           string
  content:            string
  editedContent:      string
  onEditContent:      (val: string) => void
  hashtags:           string[]
  charLimit:          number
  rewrittenTitle:     string | null
  rewrittenDesc:      string | null
  ogImage:            string | null
  sourceUrl:          string | null
  connectionId:       string | null
  publishState:       PublishState
  publishError:       string
  publishSuccess:     boolean
  onPublish:          () => void
  error?:             string
}

function PostPreview({
  platform, content, editedContent, onEditContent, hashtags, charLimit,
  rewrittenTitle, rewrittenDesc, ogImage, sourceUrl, connectionId,
  publishState, publishError, publishSuccess, onPublish, error,
}: PostPreviewProps) {
  const cfg        = PLATFORM_REGISTRY[platform as keyof typeof PLATFORM_REGISTRY]
  const hasConn    = !!connectionId
  const hasAdapter = PLATFORMS_WITH_ADAPTERS.has(platform)
  const canPublish = hasConn && hasAdapter
  const charCount  = editedContent.length
  const overLimit  = charLimit > 0 && charCount > charLimit

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Platform header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/30">
        <span className="text-sm font-semibold">{cfg?.name ?? platform}</span>
        <div className="flex items-center gap-2">
          {charLimit > 0 && (
            <span className={cn("text-xs tabular-nums", overLimit ? "text-destructive font-medium" : "text-muted-foreground")}>
              {charCount}/{charLimit}
            </span>
          )}
          {publishSuccess ? (
            <Badge className="text-xs gap-1 bg-green-500/10 text-green-600 border-green-200 hover:bg-green-500/10">
              <CheckCircle2 className="h-3 w-3" /> Published
            </Badge>
          ) : publishState === "error" ? (
            <Badge variant="destructive" className="text-xs">Failed</Badge>
          ) : !hasAdapter ? (
            <Badge variant="outline" className="text-xs text-muted-foreground">No adapter yet</Badge>
          ) : !hasConn ? (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">No connection</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">Ready</Badge>
          )}
        </div>
      </div>

      {/* Post composition preview */}
      <div className="p-4 space-y-3">
        {/* Featured image */}
        {ogImage && (
          <div className="rounded-lg overflow-hidden border bg-muted/30 aspect-video relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ogImage}
              alt="Featured"
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
            />
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="text-[10px] gap-1 opacity-80">
                <ImageIcon className="h-2.5 w-2.5" /> Featured image
              </Badge>
            </div>
          </div>
        )}

        {/* Rewritten title */}
        {rewrittenTitle && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <FileText className="h-3 w-3" /> AI Title
            </p>
            <p className="text-sm font-semibold leading-snug">{rewrittenTitle}</p>
          </div>
        )}

        {/* Rewritten description */}
        {rewrittenDesc && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <FileText className="h-3 w-3" /> AI Description
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{rewrittenDesc}</p>
          </div>
        )}

        <div className="border-t pt-3 space-y-2">
          {/* Post body — editable */}
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Post body</p>
          {error ? (
            <p className="text-xs text-destructive flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {error}
            </p>
          ) : (
            <Textarea
              value={editedContent}
              onChange={(e) => onEditContent(e.target.value)}
              className={cn("text-sm min-h-[90px] resize-none", overLimit && "border-destructive focus-visible:ring-destructive")}
              disabled={publishState === "publishing" || publishSuccess}
              placeholder="Post content will appear here…"
            />
          )}

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="flex items-start gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {hashtags.map((h) => (
                  <span key={h} className="text-xs text-primary font-medium">{h.startsWith("#") ? h : `#${h}`}</span>
                ))}
              </div>
            </div>
          )}

          {/* Source URL */}
          {sourceUrl && (
            <div className="flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline truncate"
              >
                {sourceUrl}
              </a>
            </div>
          )}
        </div>

        {/* Error / publish feedback */}
        {publishError && (
          <p className="text-xs text-destructive flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {publishError}
          </p>
        )}

        {/* Publish button */}
        {!publishSuccess && !error && (
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 w-full"
            onClick={onPublish}
            disabled={publishState === "publishing" || !canPublish || overLimit}
            title={
              !hasAdapter ? "No adapter for this platform yet"
              : !hasConn  ? "Connect this platform in Connections first"
              : overLimit ? "Content exceeds character limit"
              : undefined
            }
          >
            {publishState === "publishing"
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Send className="h-3 w-3" />}
            {publishState === "publishing"
              ? "Publishing…"
              : canPublish
              ? "Publish Now"
              : hasAdapter
              ? "Connect Platform First"
              : "Adapter Pending"}
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// URL Card
// ---------------------------------------------------------------------------

interface UrlCardProps {
  url:         CampaignUrl
  campaign:    Campaign
  connections: PlatformConnection[]
}

function UrlCard({ url, campaign, connections }: UrlCardProps) {
  const [extractState,  setExtractState]  = useState<ExtractState>("idle")
  const [extractError,  setExtractError]  = useState<string | null>(null)
  const [extracted,     setExtracted]     = useState<ExtractedContent | null>(null)
  const [showExtracted, setShowExtracted] = useState(false)

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [generateState,     setGenerateState]     = useState<GenerateState>("idle")
  const [generateError,     setGenerateError]     = useState<string | null>(null)

  // Generation result shared across all posts for this URL
  const [generatedPosts,        setGeneratedPosts]        = useState<GeneratedPost[]>([])
  const [rewrittenTitle,        setRewrittenTitle]        = useState<string | null>(null)
  const [rewrittenDesc,         setRewrittenDesc]         = useState<string | null>(null)
  const [generatedOgImage,      setGeneratedOgImage]      = useState<string | null>(null)
  const [generatedSourceUrl,    setGeneratedSourceUrl]    = useState<string | null>(null)

  const [editedContent,  setEditedContent]  = useState<Record<string, string>>({})
  const [publishStates,  setPublishStates]  = useState<Record<string, PublishState>>({})
  const [publishErrors,  setPublishErrors]  = useState<Record<string, string>>({})
  const [publishSuccess, setPublishSuccess] = useState<Record<string, boolean>>({})

  // Pre-select connected platforms
  useEffect(() => {
    const connected = new Set(connections.filter((c) => c.status === "connected").map((c) => c.platform))
    const initial   = campaign.platforms.filter((p) => connected.has(p))
    setSelectedPlatforms(initial.length > 0 ? initial : campaign.platforms.slice(0, 1))
  }, [campaign.platforms, connections])

  // Load existing extracted_content
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    supabase
      .from("extracted_content")
      .select("id, title, description, author, og_image_url, keywords, source_url, published_at")
      .eq("url_id", url.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setExtracted(data) })
  }, [url.id])

  // -------------------------------------------------------------------------
  // Extract
  // -------------------------------------------------------------------------
  async function handleExtract() {
    setExtractState("extracting")
    setExtractError(null)
    try {
      const res  = await fetch("/api/extract", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ urlId: url.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Extraction failed")
      setExtracted({
        id:           data.extractedContentId,
        title:        data.title,
        description:  data.description,
        author:       data.author,
        og_image_url: data.ogImage,
        keywords:     data.keywords ?? [],
        source_url:   data.sourceUrl,
        published_at: data.publishDate,
      })
      setExtractState("done")
      setShowExtracted(true)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Unknown error")
      setExtractState("error")
    }
  }

  // -------------------------------------------------------------------------
  // Generate
  // -------------------------------------------------------------------------
  function getConnectionId(platform: string): string | null {
    return connections.find((c) => c.platform === platform && c.status === "connected")?.id ?? null
  }

  async function handleGenerate() {
    setGenerateState("generating")
    setGenerateError(null)
    setGeneratedPosts([])

    const connectionIds: Record<string, string> = {}
    for (const p of selectedPlatforms) {
      const cid = getConnectionId(p)
      if (cid) connectionIds[p] = cid
    }

    try {
      const res  = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          urlId:        url.id,
          campaignId:   campaign.id,
          platforms:    selectedPlatforms,
          connectionIds,
        }),
      })
      const data: GenerateResponse = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? "Generation failed")

      setGeneratedPosts(data.posts)
      setRewrittenTitle(data.rewrittenTitle)
      setRewrittenDesc(data.rewrittenDescription)
      setGeneratedOgImage(data.ogImage)
      setGeneratedSourceUrl(data.sourceUrl)

      const initContent: Record<string, string> = {}
      for (const post of data.posts) initContent[post.platform] = post.content
      setEditedContent(initContent)
      setGenerateState("done")
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unknown error")
      setGenerateState("done")
    }
  }

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------
  async function handlePublish(post: GeneratedPost) {
    if (!post.scheduledPostId) return
    const { platform } = post

    setPublishStates((s) => ({ ...s, [platform]: "publishing" }))
    setPublishErrors((e) => ({ ...e, [platform]: "" }))

    try {
      let scheduledPostId = post.scheduledPostId
      const edited = editedContent[platform]

      // If content was edited, create a fresh scheduled_post with the edited content
      if (edited && edited !== post.content) {
        const cid = getConnectionId(platform)
        const regenRes = await fetch("/api/generate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            urlId:        url.id,
            campaignId:   campaign.id,
            platforms:    [platform],
            connectionIds: cid ? { [platform]: cid } : {},
            editedContent: { [platform]: edited },
          }),
        })
        const regenData: GenerateResponse = await regenRes.json()
        if (regenData.success && regenData.posts?.[0]?.scheduledPostId) {
          scheduledPostId = regenData.posts[0].scheduledPostId
        }
      }

      const res  = await fetch("/api/publish-now", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ scheduledPostIds: [scheduledPostId] }),
      })
      const data = await res.json()
      const result = data.results?.[0]

      if (!res.ok || !result?.success) {
        setPublishErrors((e) => ({ ...e, [platform]: result?.error ?? data.error ?? "Publish failed" }))
        setPublishStates((s) => ({ ...s, [platform]: "error" }))
      } else {
        setPublishStates((s)  => ({ ...s, [platform]: "done" }))
        setPublishSuccess((s) => ({ ...s, [platform]: true }))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setPublishErrors((e) => ({ ...e, [platform]: msg }))
      setPublishStates((s) => ({ ...s, [platform]: "error" }))
    }
  }

  const availablePlatforms = campaign.platforms.filter(
    (p) => PLATFORM_REGISTRY[p as keyof typeof PLATFORM_REGISTRY]
  )

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    )
  }

  return (
    <Card className="overflow-hidden">
      {/* URL header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium leading-tight truncate">
              {url.title ?? formatHost(url.original_url)}
            </CardTitle>
            <a
              href={url.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline truncate block mt-0.5"
            >
              {formatHost(url.original_url)}
            </a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {extracted && (
              <Badge variant="secondary" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> Extracted
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleExtract}
              disabled={extractState === "extracting"}
              className="h-7 text-xs gap-1.5"
            >
              {extractState === "extracting"
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <RefreshCw className="h-3 w-3" />}
              {extractState === "extracting" ? "Extracting…" : extracted ? "Re-extract" : "Extract"}
            </Button>
          </div>
        </div>
        {extractState === "error" && extractError && (
          <p className="text-xs text-destructive mt-1">{extractError}</p>
        )}
      </CardHeader>

      {/* Extracted content summary */}
      {extracted && (
        <div className="px-6 pb-3">
          <button
            onClick={() => setShowExtracted((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showExtracted ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showExtracted ? "Hide" : "Show"} extracted content
          </button>

          {showExtracted && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              {extracted.og_image_url && (
                <div className="rounded overflow-hidden border aspect-video bg-muted/30 mb-2 max-h-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={extracted.og_image_url}
                    alt="OG image"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none" }}
                  />
                </div>
              )}
              {extracted.title && (
                <div className="flex gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="font-medium text-sm">{extracted.title}</p>
                </div>
              )}
              {extracted.description && (
                <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2 pl-6">
                  {extracted.description}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6">
                {extracted.author && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3 w-3" /> {extracted.author}
                  </span>
                )}
                {extracted.published_at && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(extracted.published_at).toLocaleDateString()}
                  </span>
                )}
                {extracted.source_url && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" /> {formatHost(extracted.source_url)}
                  </span>
                )}
              </div>
              {extracted.keywords.length > 0 && (
                <div className="flex items-start gap-2 pl-6">
                  <Tag className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                  <div className="flex flex-wrap gap-1">
                    {extracted.keywords.slice(0, 8).map((k) => (
                      <Badge key={k} variant="outline" className="text-xs px-1.5 py-0">{k}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <CardContent className="pt-0">
        <div className="border-t pt-4 space-y-4">
          {/* Platform selection */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Generate posts for</p>
            <div className="flex flex-wrap gap-1.5">
              {availablePlatforms.map((p) => {
                const cfg      = PLATFORM_REGISTRY[p as keyof typeof PLATFORM_REGISTRY]
                const selected = selectedPlatforms.includes(p)
                const hasConn  = connections.some((c) => c.platform === p && c.status === "connected")
                return (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {cfg?.name ?? p}
                    {!hasConn && <span className="opacity-40 text-[9px]">●</span>}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Tone, style &amp; hashtags are loaded from your platform settings.
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateState === "generating" || selectedPlatforms.length === 0}
            className="h-8 text-xs gap-1.5"
            size="sm"
          >
            {generateState === "generating"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {generateState === "generating"
              ? `Generating for ${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? "s" : ""}…`
              : generatedPosts.length > 0
              ? "Re-generate All"
              : "Generate Posts"}
          </Button>

          {generateError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {generateError}
            </p>
          )}

          {/* Generated post cards */}
          {generatedPosts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Generated posts — review &amp; publish
                </p>
                {(rewrittenTitle || rewrittenDesc) && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Sparkles className="h-2.5 w-2.5" /> AI-enhanced
                  </Badge>
                )}
              </div>
              {generatedPosts.map((post) => (
                <PostPreview
                  key={post.platform}
                  platform={post.platform}
                  content={post.content}
                  editedContent={editedContent[post.platform] ?? post.content}
                  onEditContent={(val) => setEditedContent((prev) => ({ ...prev, [post.platform]: val }))}
                  hashtags={post.hashtags}
                  charLimit={post.charLimit}
                  rewrittenTitle={rewrittenTitle}
                  rewrittenDesc={rewrittenDesc}
                  ogImage={generatedOgImage}
                  sourceUrl={generatedSourceUrl}
                  connectionId={post.connectionId}
                  publishState={publishStates[post.platform] ?? "idle"}
                  publishError={publishErrors[post.platform] ?? ""}
                  publishSuccess={publishSuccess[post.platform] ?? false}
                  onPublish={() => handlePublish(post)}
                  error={post.error}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ContentPage() {
  const [campaigns,          setCampaigns]          = useState<Campaign[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("")
  const [campaignUrls,       setCampaignUrls]       = useState<CampaignUrl[]>([])
  const [connections,        setConnections]        = useState<PlatformConnection[]>([])
  const [loading,            setLoading]            = useState(true)
  const [urlsLoading,        setUrlsLoading]        = useState(false)

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      if (!supabase) { setLoading(false); return }

      setLoading(true)
      const [{ data: cData }, { data: conns }] = await Promise.all([
        supabase
          .from("campaigns")
          .select("id, name, status, platforms")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("platform_connections")
          .select("id, platform, display_name, status")
          .is("deleted_at", null),
      ])
      setCampaigns(cData ?? [])
      setConnections(conns ?? [])
      if (cData && cData.length > 0) setSelectedCampaignId(cData[0].id)
      setLoading(false)
    }
    load()
  }, [])

  const loadUrlsForCampaign = useCallback(async (campaignId: string) => {
    const supabase = getSupabase()
    if (!supabase) return
    setUrlsLoading(true)
    const { data } = await supabase
      .from("campaign_urls")
      .select("id, original_url, title, created_at")
      .eq("campaign_id", campaignId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
    setCampaignUrls(data ?? [])
    setUrlsLoading(false)
  }, [])

  useEffect(() => {
    if (selectedCampaignId) loadUrlsForCampaign(selectedCampaignId)
  }, [selectedCampaignId, loadUrlsForCampaign])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Extract URL content, AI-generate platform posts, and publish — all in one place.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Sparkles className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-1">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a campaign and add URLs to get started.
            </p>
            <Button size="sm" asChild>
              <a href="/campaigns">Go to Campaigns</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-muted-foreground shrink-0">Campaign</label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select a campaign…" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      {c.name}
                      <Badge
                        variant={c.status === "active" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {c.status}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-7 text-muted-foreground" asChild>
              <a href="/settings?tab=platforms">
                <Sparkles className="h-3 w-3" /> AI settings
              </a>
            </Button>
          </div>

          {selectedCampaign && selectedCampaign.platforms.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground">Targets:</span>
              {selectedCampaign.platforms.map((p) => {
                const cfg     = PLATFORM_REGISTRY[p as keyof typeof PLATFORM_REGISTRY]
                const hasConn = connections.some((c) => c.platform === p && c.status === "connected")
                return (
                  <Badge key={p} variant={hasConn ? "default" : "outline"} className="text-xs">
                    {cfg?.name ?? p}
                    {!hasConn && <span className="ml-1 opacity-60">disconnected</span>}
                  </Badge>
                )
              })}
            </div>
          )}

          {urlsLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : campaignUrls.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="h-8 w-8 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">No URLs in this campaign</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add URLs in the Campaigns page to start generating content.
                </p>
                <Button size="sm" variant="outline" asChild>
                  <a href="/campaigns">Open Campaigns</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {selectedCampaign && campaignUrls.map((u) => (
                <UrlCard
                  key={u.id}
                  url={u}
                  campaign={selectedCampaign}
                  connections={connections}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
