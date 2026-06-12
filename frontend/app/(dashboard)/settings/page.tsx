"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  PLATFORM_LABELS,
  PLATFORM_ABBREV,
  PLATFORM_LIGHT_CLASS,
  PLATFORM_DARK_CLASS,
  PLATFORM_REGISTRY,
  type AllPlatformId,
} from "@/lib/platforms"

const TONE_OPTIONS = ["professional", "casual", "conversational", "educational", "inspirational", "humorous"]
const STYLE_OPTIONS = ["concise", "detailed", "listicle", "storytelling"]

interface PlatformDefaults {
  tone: string
  hashtags: string
  cta: string
  style: string
  includeEmoji: boolean
  autoApprove: boolean
}

const DEFAULT_PLATFORM_SETTINGS: PlatformDefaults = {
  tone: "professional",
  hashtags: "",
  cta: "",
  style: "concise",
  includeEmoji: true,
  autoApprove: false,
}

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [platformSettings, setPlatformSettings] = useState<Record<string, PlatformDefaults>>(
    Object.fromEntries(
      PLATFORM_REGISTRY.map((p) => [
        p.id,
        { ...DEFAULT_PLATFORM_SETTINGS, tone: p.aiConfig.toneDefault, includeEmoji: p.aiConfig.emojiStyle !== 'none' },
      ])
    )
  )
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updatePlatformSetting(platformId: string, key: keyof PlatformDefaults, value: string | boolean) {
    setPlatformSettings((prev) => ({
      ...prev,
      [platformId]: { ...prev[platformId], [key]: value },
    }))
  }

  function platformClass(id: string) {
    const light = PLATFORM_LIGHT_CLASS[id as AllPlatformId] ?? "bg-muted text-muted-foreground"
    const dark  = PLATFORM_DARK_CLASS[id as AllPlatformId]  ?? ""
    return `${light} ${dark}`
  }

  return (
    <div className="flex flex-col flex-1">
      <Header title="Settings" />

      <main className="flex-1 p-4 lg:p-6">
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="w-full sm:w-auto flex-wrap h-auto gap-1">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="platforms">Platforms</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* Profile                                                           */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workspace Profile</CardTitle>
                <CardDescription>Update your organization details and preferences.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name">Organization name</Label>
                    <Input id="org-name" defaultValue="Example Corp" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-url">Website URL</Label>
                    <Input id="org-url" defaultValue="https://example.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" defaultValue="UTC-5 (Eastern Time)" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Contact email</Label>
                  <Input id="contact-email" type="email" defaultValue="admin@example.com" />
                </div>
                <Separator />
                <div className="flex justify-end">
                  <Button onClick={handleSave}>
                    {saved ? "Saved!" : "Save changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Platform Defaults                                                 */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="platforms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Platform Defaults</CardTitle>
                <CardDescription>
                  Configure default AI generation settings per platform. These are used when no
                  per-campaign overrides are specified.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {PLATFORM_REGISTRY.map((platform) => {
                    const settings = platformSettings[platform.id] ?? DEFAULT_PLATFORM_SETTINGS
                    const isExpanded = expandedPlatform === platform.id

                    return (
                      <div key={platform.id} className="px-4 lg:px-6">
                        {/* Platform row header */}
                        <button
                          type="button"
                          onClick={() => setExpandedPlatform(isExpanded ? null : platform.id)}
                          className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-transparent"
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${platformClass(platform.id)}`}>
                            {platform.ui.abbrev}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {PLATFORM_LABELS[platform.id as AllPlatformId]}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {platform.category} · {settings.tone} · {settings.style}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {settings.autoApprove && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Auto-approve</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </button>

                        {/* Expanded settings */}
                        {isExpanded && (
                          <div className="pb-4 space-y-4 border-t pt-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Default Tone</Label>
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={settings.tone}
                                  onChange={(e) => updatePlatformSetting(platform.id, "tone", e.target.value)}
                                >
                                  {TONE_OPTIONS.map((t) => (
                                    <option key={t} value={t} className="capitalize">{t}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Content Style</Label>
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={settings.style}
                                  onChange={(e) => updatePlatformSetting(platform.id, "style", e.target.value)}
                                >
                                  {STYLE_OPTIONS.map((s) => (
                                    <option key={s} value={s} className="capitalize">{s}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Default Hashtags / Tags</Label>
                              <Input
                                placeholder="#marketing #content (space-separated)"
                                value={settings.hashtags}
                                onChange={(e) => updatePlatformSetting(platform.id, "hashtags", e.target.value)}
                                className="text-sm"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                These tags will be added to every generated post for this platform.
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs">Default Call-to-Action</Label>
                              <Input
                                placeholder="e.g. Read the full article at the link below"
                                value={settings.cta}
                                onChange={(e) => updatePlatformSetting(platform.id, "cta", e.target.value)}
                                className="text-sm"
                              />
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-xs font-medium">Include Emoji</p>
                                <p className="text-[11px] text-muted-foreground">Add emoji to generated content for this platform</p>
                              </div>
                              <Switch
                                checked={settings.includeEmoji}
                                onCheckedChange={(v) => updatePlatformSetting(platform.id, "includeEmoji", v)}
                              />
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-xs font-medium">Auto-Approve Generated Content</p>
                                <p className="text-[11px] text-muted-foreground">Skip manual approval for this platform</p>
                              </div>
                              <Switch
                                checked={settings.autoApprove}
                                onCheckedChange={(v) => updatePlatformSetting(platform.id, "autoApprove", v)}
                              />
                            </div>

                            <div className="flex justify-end pt-1">
                              <Button size="sm" onClick={handleSave} variant="outline">
                                {saved ? "Saved!" : "Save platform defaults"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Notifications                                                     */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>Choose what you get notified about.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-0 divide-y">
                {[
                  { id: "post-fail", label: "Post failures", desc: "Get notified when a post fails to publish", default: true },
                  { id: "post-success", label: "Post published", desc: "Confirmation when posts go live", default: false },
                  { id: "campaign-end", label: "Campaign completed", desc: "Summary when a campaign finishes", default: true },
                  { id: "rate-limit", label: "Rate limit warnings", desc: "Alert when approaching platform limits", default: true },
                  { id: "auth-expire", label: "Auth token expiry", desc: "Reminder before platform tokens expire", default: true },
                  { id: "weekly-report", label: "Weekly digest", desc: "Weekly performance summary email", default: false },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-4 gap-4">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <Switch defaultChecked={item.default} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Team                                                              */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription className="mt-1">Manage who has access to this workspace.</CardDescription>
                </div>
                <Button size="sm">Invite</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {[
                    { name: "Alex Chen", email: "alex@example.com", role: "Admin", initials: "AC" },
                    { name: "Jamie Rivera", email: "jamie@example.com", role: "Editor", initials: "JR" },
                    { name: "Sam Patel", email: "sam@example.com", role: "Viewer", initials: "SP" },
                  ].map((member) => (
                    <div key={member.email} className="flex items-center gap-3 px-6 py-3.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
                        {member.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant={member.role === "Admin" ? "default" : "secondary"} className="text-xs">
                        {member.role}
                      </Badge>
                      {member.role !== "Admin" && (
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive text-xs">
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Billing                                                           */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>You are on the Free plan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
                  <div>
                    <p className="font-semibold">Free Plan</p>
                    <p className="text-sm text-muted-foreground mt-0.5">5 platform connections · 10 active campaigns</p>
                  </div>
                  <Badge variant="secondary">Current</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "Pro", price: "$29/mo", features: ["25 connections", "Unlimited campaigns", "Priority support"] },
                    { name: "Business", price: "$99/mo", features: ["Unlimited connections", "Team access", "Custom branding"] },
                  ].map((plan) => (
                    <div key={plan.name} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{plan.name}</p>
                        <p className="text-sm font-medium">{plan.price}</p>
                      </div>
                      <ul className="space-y-1">
                        {plan.features.map((f) => (
                          <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span className="text-emerald-500">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <Button size="sm" variant="outline" className="w-full">Upgrade to {plan.name}</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* Danger Zone                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="danger" className="space-y-4">
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div>
                    <p className="text-sm font-medium">Delete all campaign data</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Permanently removes all campaigns and logs</p>
                  </div>
                  <Button variant="destructive" size="sm">Delete data</Button>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <div>
                    <p className="text-sm font-medium">Delete workspace</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Permanently deletes your workspace and all data</p>
                  </div>
                  <Button variant="destructive" size="sm">Delete workspace</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
