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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

// Row types
export interface SbUser {
  id: string
  email: string | null
  name: string | null
  icp_config: IcpConfig
  x_accounts: string[]
  x_topics: string[]
  telegram_connected: boolean
  created_at: string
}

export interface IcpConfig {
  titles: string[]
  exclude: string[]
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

export type InsightType = 'topic_performance' | 'icp_pattern' | 'dm_effectiveness' | 'timing' | 'weekly_summary'
