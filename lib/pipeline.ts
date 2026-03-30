// Generic pipeline runner — chains steps where each step's output feeds the next
// Used by: content generation, DM drafting, X replies, lead scoring, post finding
//
// Pattern: brain_context → options → pick → do → improve → feed_back
// Each API route defines its own steps, the runner handles chaining + timing + logging

import { BrainContext } from './brain-context'

// A single step in the pipeline
export interface PipelineStep {
  readonly name: string
  readonly run: (
    input: StepInput,
    context: BrainContext
  ) => Promise<unknown>
}

// Input to each step — accumulates all previous outputs
export interface StepInput {
  readonly original: unknown // The raw user input
  readonly previous: Record<string, unknown> // All previous step outputs keyed by step name
}

// Result of a single step execution
export interface StepResult {
  readonly stepName: string
  readonly output: unknown
  readonly durationMs: number
}

// Full pipeline execution result
export interface PipelineResult {
  readonly taskType: string
  readonly steps: ReadonlyArray<StepResult>
  readonly finalOutput: unknown
  readonly totalDurationMs: number
  readonly brainContextUsed: boolean
}

// Run a pipeline: executes steps sequentially, each getting all previous outputs
export async function runPipeline(
  taskType: string,
  steps: ReadonlyArray<PipelineStep>,
  originalInput: unknown,
  brainContext: BrainContext
): Promise<PipelineResult> {
  const startTime = Date.now()
  const stepResults: StepResult[] = []
  const accumulated: Record<string, unknown> = {}

  for (const step of steps) {
    const stepStart = Date.now()

    const input: StepInput = {
      original: originalInput,
      previous: { ...accumulated }, // Immutable copy
    }

    const output = await step.run(input, brainContext)
    const durationMs = Date.now() - stepStart

    const result: StepResult = {
      stepName: step.name,
      output,
      durationMs,
    }

    stepResults.push(result)
    accumulated[step.name] = output
  }

  const lastStep = stepResults[stepResults.length - 1]

  return {
    taskType,
    steps: stepResults,
    finalOutput: lastStep?.output ?? null,
    totalDurationMs: Date.now() - startTime,
    brainContextUsed: brainContext.topTopics.length > 0 ||
      brainContext.dmEffectiveness.length > 0 ||
      brainContext.icpPattern.length > 0,
  }
}

// Helper: create a step from a simple async function
export function step(
  name: string,
  run: (input: StepInput, context: BrainContext) => Promise<unknown>
): PipelineStep {
  return { name, run }
}
