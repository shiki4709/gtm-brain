export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      sb_users: {
        Row: SbUser
        Insert: Omit<SbUser, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<SbUser, 'id'>>
      }
      sb_scrapes: {
        Row: SbScrape
        Insert: Omit<SbScrape, 'id' | 'scrape_date'> & { id?: string; scrape_date?: string }
        Update: Partial<Omit<SbScrape, 'id'>>
      }
      sb_leads: {
        Row: SbLead
        Insert: Omit<SbLead, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<SbLead, 'id'>>
      }
      sb_replies: {
        Row: SbReply
        Insert: Omit<SbReply, 'id' | 'detected_at'> & { id?: string; detected_at?: string }
        Update: Partial<Omit<SbReply, 'id'>>
      }
      sb_posts: {
        Row: SbPost
        Insert: Omit<SbPost, 'id'> & { id?: string }
        Update: Partial<Omit<SbPost, 'id'>>
      }
      sb_x_engage: {
        Row: SbXEngage
        Insert: Omit<SbXEngage, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<SbXEngage, 'id'>>
      }
      sb_insights: {
        Row: SbInsight
        Insert: Omit<SbInsight, 'id' | 'generated_at'> & { id?: string; generated_at?: string }
        Update: Partial<Omit<SbInsight, 'id'>>
      }
      user_goals: {
        Row: UserGoal
        Insert: Omit<UserGoal, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string }
        Update: Partial<Omit<UserGoal, 'id'>>
      }
      action_log: {
        Row: ActionLogEntry
        Insert: Omit<ActionLogEntry, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ActionLogEntry, 'id'>>
      }
      metrics_snapshots: {
        Row: MetricsSnapshot
        Insert: Omit<MetricsSnapshot, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<MetricsSnapshot, 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Row types
export interface NotificationChannel {
  type: 'telegram' | 'slack'
  chat_id?: string
  webhook_url?: string
}

export type UserMode = 'personal_brand' | 'b2b_outbound' | 'both'

export interface SbUser {
  id: string
  email: string | null
  name: string | null
  icp_config: IcpConfig
  x_accounts: string[]
  x_topics: string[]
  telegram_connected: boolean
  notification_channels: NotificationChannel[]
  timezone: string
  mode: UserMode
  mode_set: boolean
  x_handle: string | null
  created_at: string
}

export interface IcpConfig {
  titles: string[]
  exclude: string[]
  track_keywords?: string[]
}

export interface SbScrape {
  id: string
  user_id: string | null
  post_url: string
  post_author: string | null
  post_topic: string | null
  platform: string
  total_engagers: number
  icp_matches: number
  scrape_date: string
}

export interface SbLead {
  id: string
  scrape_id: string | null
  user_id: string | null
  name: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  comment_text: string | null
  icp_match: boolean
  status: LeadStatus
  dm_draft: string | null
  dm_angle: DmAngle | null
  dm_sent_at: string | null
  replied_at: string | null
  source_type: SourceType
  viewed: boolean
  created_at: string
}

export type LeadStatus = 'scraped' | 'icp_filtered' | 'dm_drafted' | 'dm_sent' | 'replied' | 'converted'
export type DmAngle = 'comment_reference' | 'title_based' | 'generic'
export type SourceType = 'outbound' | 'inbound'

export interface SbReply {
  id: string
  lead_id: string | null
  user_id: string | null
  detected_via: string
  reply_snippet: string | null
  detected_at: string
}

export interface SbPost {
  id: string
  user_id: string | null
  platform: string
  content: string | null
  topic: string | null
  post_url: string | null
  published_at: string | null
  engagers_scraped: number
  icp_from_post: number
}

export interface SbXEngage {
  id: string
  user_id: string | null
  tweet_id: string | null
  tweet_url: string | null
  author_handle: string | null
  author_name: string | null
  tweet_text: string | null
  draft_reply: string | null
  status: XEngageStatus
  created_at: string
}

export type XEngageStatus = 'surfaced' | 'drafted' | 'posted' | 'skipped'

export interface SbInsight {
  id: string
  user_id: string | null
  insight_type: InsightType
  insight_data: Json
  confidence: number
  generated_at: string
}

export type InsightType =
  | 'topic_performance'
  | 'icp_pattern'
  | 'dm_effectiveness'
  | 'timing'
  | 'weekly_summary'
  | 'pipeline_run'
  | 'outcome'

// Feedback loop types
export type ActionType = 'reply' | 'reply_copy' | 'dm_draft' | 'dm_send' | 'scrape' | 'dm_reply_received' | 'x_thread' | 'x_quote' | 'x_post' | 'li_comment' | 'li_post' | 'li_carousel' | 'li_connection'
export type GoalMetric = 'reply' | 'dm_send' | 'scrape' | 'x_thread' | 'x_quote' | 'x_post' | 'li_comment' | 'li_post' | 'li_carousel' | 'li_connection'

export interface UserGoal {
  id: string
  user_id: string
  mode: 'personal_brand' | 'b2b_outbound'
  metric: GoalMetric
  target_value: number
  period: string
  created_at: string
  updated_at: string
}

export interface ActionLogEntry {
  id: string
  user_id: string
  action_type: ActionType
  post_id: string | null
  platform: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface MetricsSnapshot {
  id: string
  user_id: string
  metric: string
  value: number
  snapshot_date: string
  created_at: string
}

export interface WeeklyProgress {
  metric: GoalMetric
  target: number
  current: number
  mode: 'personal_brand' | 'b2b_outbound'
  period: 'daily' | 'weekly'
}

export interface FollowerDelta {
  current: number | null
  delta7d: number | null
}
