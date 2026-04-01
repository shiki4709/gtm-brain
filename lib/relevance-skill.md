# Post Relevance Scoring Skill

Used by the feed scoring engine to determine if a post is actually relevant to the user's niche, not just keyword-matching.

## The Problem

Keyword matching produces false positives:
- "gemini" matches Google Gemini AI AND Gemini the zodiac sign AND GeminiFourth (Thai celebrity)
- "claude" matches Claude AI AND Claude the person's name
- "agents" matches AI agents AND real estate agents AND talent agents
- "model" matches AI models AND fashion models AND business models

## Scoring Rules

### Tier 1: Obviously Relevant (no AI needed)
Post contains 2+ tracked keywords from DIFFERENT categories:
- "claude" + "api" → definitely AI
- "openai" + "gpt" → definitely AI
- "ai" + "startup" → definitely tech
Score: HIGH relevance

### Tier 2: Obviously Irrelevant (no AI needed)
Post contains spam signals:
- Fan content: fancam, fanmeet, photocard, lightstick, stan, bias, ship name
- Entertainment: idol, k-pop, comeback, drama, episode
- Astrology: horoscope, zodiac, birth chart, mercury retrograde, ♊♌♍ etc
- Non-tech contexts: recipe, workout, skincare, outfit
Score: ZERO relevance (filter out)

### Tier 3: Ambiguous (needs AI judgment)
Post matches exactly 1 keyword and could be either relevant or not:
- "gemini" alone → could be Google Gemini or zodiac
- "claude" alone → could be AI or a person
- "model" alone → could be AI or fashion
These need context analysis.

## Context Clues for Ambiguous Keywords

### "gemini" is AI when:
- Combined with: google, api, model, benchmark, context window, tokens, multimodal, flash, pro, 2.0, bard
- Author is a tech account (check other tweet keywords)
- Post mentions competitors: claude, gpt, openai, chatgpt

### "gemini" is NOT AI when:
- Combined with: zodiac, horoscope, birthday, constellation, compatibility, rising, moon sign
- Combined with: Fourth, fandom, fan, concert, meet, drama
- Post has non-English fan content patterns

### "claude" is AI when:
- Combined with: anthropic, api, sonnet, opus, haiku, model, tokens, context
- Post discusses AI/tech topics
- Author is in tech space

### "claude" is NOT AI when:
- It's clearly a person's first name with a last name following
- Post is about a TV show, movie, or non-tech person

### "model" is AI when:
- Combined with: language, foundation, fine-tune, training, inference, parameters, weights
- In context of LLM, ML, AI discussion

### "agents" is AI when:
- Combined with: AI, autonomous, agentic, tool use, function calling, orchestration
- NOT combined with: real estate, talent, insurance, travel, booking

## Batch Scoring Prompt (for Haiku)

When the feed has 5+ ambiguous posts, batch them in a single Claude Haiku call:

```
You are a relevance filter for a tech/AI-focused feed.
The user tracks these topics: [user's tracked keywords]

For each post below, respond with ONLY "Y" (relevant to tech/AI/startups) or "N" (not relevant).

1. "[post text]"
2. "[post text]"
3. "[post text]"

Respond as: 1:Y 2:N 3:Y (one line, space-separated)
```

Cost: ~$0.001 per batch of 10 posts with Haiku. Negligible.
