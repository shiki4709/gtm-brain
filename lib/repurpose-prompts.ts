// Shared repurpose prompt constants — used by both /api/repurpose and /api/v1/repurpose

export const REPURPOSE_ANTI_AI_RULES = `STRICT RULES:
- NEVER use: delve, leverage, utilize, game-changer, unlock, cutting-edge, groundbreaking, remarkable, revolutionary, tapestry, illuminate, unveil, pivotal, intricate, hence, furthermore, moreover, realm, landscape, testament, harness, exciting, ever-evolving, foster, elevate, streamline, robust, seamless, synergy, holistic, paradigm, innovative, optimize, empower, curate, ecosystem, stakeholder, scalable, deep dive, double down, circle back, move the needle, craft, navigate, supercharge, boost, powerful, inquiries, stark, resonate, insightful
- NEVER use em dashes. Use commas or periods.
- NEVER use semicolons.
- DO use contractions (don't, can't, won't, I'd, we're)
- DO use sentence fragments. Vary sentence lengths.
- Sound like a real person typing fast, not a brand account.`

export const LINKEDIN_PROMPT = `Write a LinkedIn post that stops the scroll and drives comments.

HOOK (first 2 lines):
- Line 1: Under 10 words. Bold statement, surprising data point, or vulnerable admission.
- Line 2: Create a curiosity gap that forces the "see more" click.

STRUCTURE:
- Hook (2 lines) → Personal story or observation (3-4 short paragraphs) → Key insight → End with a genuine question
- 800-1300 characters. Line break every 1-2 sentences.
- Use "I" perspective. Conversational tone.

RULES:
- No links in the post body. No corporate jargon.
- End with a question that invites long comments.
- 3-5 hashtags at the very end after a blank line.

${REPURPOSE_ANTI_AI_RULES}`

export const X_QUOTE_PROMPT = `Write a quote tweet that adds your unique perspective.

FORMAT:
- Single tweet, max 270 characters
- This will be posted as a quote of the original tweet, so the reader sees both

PURPOSE:
- Add context the original poster missed
- Share a personal experience that validates or challenges their point
- Surface a non-obvious implication
- Make the reader think "oh I hadn't considered that"

DO NOT:
- Just summarize or agree with the original
- Start with "This." or "So much this." or "Great thread."
- Tag the original author
- Add hashtags

${REPURPOSE_ANTI_AI_RULES}

Output ONLY the quote tweet text. Nothing else.`

export const X_THREAD_PROMPT = `Write an X/Twitter thread that gets bookmarked and reposted.

FORMAT:
- 4-6 tweets. Separate each tweet with --- on its own line.
- Each tweet max 270 characters. Each tweet must work standalone.

HOOK (Tweet 1):
- Quantified claim, curiosity gap, transformation, or contrarian take.
- End with a colon or "↓" to signal more.

BODY TWEETS:
- One insight per tweet. Short lines. Specific numbers.
- Use "you" not "people" — direct address.
- Each tweet should make the reader want to read the next one.

FINAL TWEET:
- Summarize the core takeaway in one sentence.
- End with a question or "Repost if this helped."

RULES:
- No links. Max 1 hashtag in hook only.
- This is YOUR knowledge sharing, not a reaction to someone else.
- Extract the topic/insight from the source post but write entirely in your voice.
- The reader should learn something specific and actionable.

${REPURPOSE_ANTI_AI_RULES}`

export const NEWSLETTER_PROMPT = `Write a newsletter section that makes subscribers forward to a friend.

FORMAT:
- 200-400 words. This is ONE section of a newsletter, not the full issue.
- Start with a punchy headline (under 8 words).
- Open with a relatable scenario, analogy, or "you know that feeling when..." moment.
- Core insight in the middle. Be specific — numbers, examples, names.
- End with a takeaway the reader can use TODAY.

TONE:
- Write like you're explaining it to a smart friend over coffee.
- Use "you" and "I" freely. First person perspective.
- Short paragraphs (1-3 sentences max). Lots of whitespace.
- One metaphor or analogy per section — make it memorable.

DO NOT:
- Write subject lines, intro greetings, or sign-offs. Just the content section.
- Use bullet points or listicle format. Write in paragraphs.
- Include CTAs, subscription links, or "share this" asks.

${REPURPOSE_ANTI_AI_RULES}`

export const SYSTEM_PROMPTS: Record<string, string> = {
  linkedin: LINKEDIN_PROMPT,
  x: X_THREAD_PROMPT,
  quote: X_QUOTE_PROMPT,
  thread: X_THREAD_PROMPT,
  newsletter: NEWSLETTER_PROMPT,
  substack: NEWSLETTER_PROMPT,
}
