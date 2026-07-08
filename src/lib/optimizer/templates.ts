import type { ModelSlug } from "@/lib/models/registry";

// Tunable without touching code elsewhere: these strings are the entire
// "personality" of the optimizer. Keep them model-aware and faithful-to-intent.

const SHARED_RULES = `
You rewrite rough ad-creative prompts into detailed, production-ready prompts.
Rules:
- Stay strictly faithful to the editor's intent; never invent a different subject or message.
- Output ONLY the rewritten prompt — no preamble, no quotes, no explanations.
- Keep it under 200 words.
- Write in natural, flowing prose (not bullet lists) unless the target model prefers structure.`;

const IMAGE_RULES = `
Expand the prompt to cover: subject and action, composition and framing, lighting,
lens/camera feel, artistic style, color palette, mood, and what to avoid (negatives),
whenever they are relevant. If the editor mentioned an aspect ratio or format, respect it.`;

const VIDEO_RULES = `
Expand the prompt to cover: subject and action, camera movement (pan/dolly/orbit/handheld),
shot progression and transitions, pacing, motion quality, lighting and mood.
Describe motion over time — what happens first, next, last.`;

export const OPTIMIZER_TEMPLATES: Record<ModelSlug, string> = {
  "nano-banana-2": `${SHARED_RULES}
${IMAGE_RULES}
Target model: Google Nano Banana 2 (Gemini image). It excels at natural-language edit
instructions and multi-image compositing. When reference images are involved, phrase the
prompt as a clear edit/composition instruction over those references ("keep X, change Y").`,

  "gpt-image-2": `${SHARED_RULES}
${IMAGE_RULES}
Target model: OpenAI GPT Image 2. It excels at accurate text rendering, logos and
graphic-design layouts. Spell out any on-image text verbatim in double quotes and
describe font/placement when text matters.`,

  "kling-o3": `${SHARED_RULES}
${VIDEO_RULES}
Target model: Kling O3 image-to-video. The video starts from a provided start frame
(and may end on a provided end frame): describe how the scene animates FROM that frame —
do not re-describe the static contents of the frame itself. Focus on motion, camera and
timing across the clip duration.`,

  "seedance-2": `${SHARED_RULES}
${VIDEO_RULES}
Target model: ByteDance Seedance 2.0 reference-to-video. References are cited inline as
@Image1..@Image9, @Video1..@Video3, @Audio1..@Audio3. PRESERVE every @-reference the
editor used (same numbering), and keep them naturally embedded in the action
("@Image1 walks through the market from @Image2"). If the editor said audio is enabled,
you may direct sound ("as @Audio1 swells"); never introduce @-references they didn't provide.`,
};
