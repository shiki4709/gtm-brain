// Feedback loop — writes pipeline outcomes back to sb_insights
// Closes the learn step: every action feeds data back into the brain
//
// Two modes:
// 1. logPipelineRun — immediate: logs that a pipeline ran + what the brain suggested
// 2. recordOutcome — deferred: user reports what actually happened (reply, engagement, etc.)

import { SupabaseClient } from '@supabase/supabase-js'
import type { TaskType } from './brain-context'
import type { PipelineResult } from './pipeline'

export type OutcomeType =
  | 'dm_replied'
  | 'dm_ignored'
  | 'content_engaged'
  | 'content_no_engagement'
  | 'reply_liked'
  | 'reply_ignored'
  | 'lead_converted'
  | 'lead_lost'

interface PipelineLogData {
  readonly taskType: TaskType
  readonly brainContextUsed: boolean
  readonly stepCount: number
  readonly totalDurationMs: number
  readonly stepsCompleted: ReadonlyArray<string>
}

interface OutcomeData {
  readonly taskType: TaskType
  readonly referenceId: string // The ID of the thing that had an outcome (lead, post, x_engage)
  readonly outcome: OutcomeType
  readonly metadata?: Record<string, unknown>
}

// Log that a pipeline ran — fire-and-forget after each pipeline execution
export async function logPipelineRun(
  sb: SupabaseClient,
  userId: string,
  pipelineResult: PipelineResult
): Promise<void> {
  const logData: PipelineLogData = {
    taskType: pipelineResult.taskType as TaskType,
    brainContextUsed: pipelineResult.brainContextUsed,
    stepCount: pipelineResult.steps.length,
    totalDurationMs: pipelineResult.totalDurationMs,
    stepsCompleted: pipelineResult.steps.map((s) => s.stepName),
  }

  await sb.from('sb_insights').insert({
    user_id: userId,
    insight_type: 'pipeline_run',
    insight_data: logData as unknown as Record<string, unknown>,
    confidence: 0.5, // Pipeline run logs are factual, medium confidence
  })
}

// Record an outcome — called when user reports what happened
// This is the LEARNING step: brain correlates actions → outcomes
export async function recordOutcome(
  sb: SupabaseClient,
  userId: string,
  outcome: OutcomeData
): Promise<void> {
  await sb.from('sb_insights').insert({
    user_id: userId,
    insight_type: 'outcome',
    insight_data: outcome as unknown as Record<string, unknown>,
    confidence: 0.9, // User-reported outcomes are high confidence
  })
}

// Convenience: log pipeline + record to brain log in one call
export async function logAndTrack(
  sb: SupabaseClient,
  userId: string,
  pipelineResult: PipelineResult,
  trackingData?: {
    readonly sourceUrl?: string
    readonly platform?: string
    readonly recommendedAction?: string
    readonly reason?: string
  }
): Promise<void> {
  const promises: Promise<unknown>[] = [
    logPipelineRun(sb, userId, pipelineResult),
  ]

  if (trackingData) {
    promises.push(
      Promise.resolve(
        sb.from('sb_brain_log').insert({
          user_id: userId,
          platform: trackingData.platform ?? 'system',
          source_url: trackingData.sourceUrl,
          recommended_action: trackingData.recommendedAction,
          reason: trackingData.reason,
          priority: 'medium',
        })
      ).then(() => {})
    )
  }

  await Promise.all(promises)
}
