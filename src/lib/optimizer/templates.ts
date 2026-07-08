import type { ModelSlug } from "@/lib/models/registry";

// Tunable without touching code elsewhere: these strings are the entire
// "personality" of the optimizer. Add new use-case presets to PRESET_TEMPLATES.
//
// Prompt-craft rules below are distilled from current Kling / Seedance / Nano
// Banana / UGC-ad prompting guidance (2026): structured order, one endpointed
// camera move, lighting as the top quality lever, authenticity over polish for
// UGC, and "brief a photographer, not search tags" for stills.

const SHARED_RULES = `
You rewrite rough ad-creative prompts into detailed, production-ready prompts for a marketing team.
Rules:
- Stay strictly faithful to the editor's intent; never invent a different subject, product or message.
- Output ONLY the rewritten prompt — no preamble, no headings, no explanations.
- Write in natural, flowing prose (one paragraph) unless the target model prefers structure.`;

const IMAGE_RULES = `
Brief it like a photographer, not a pile of search tags. Cover, in order: subject, composition
and framing, setting, style, and lighting/lens — be explicit about composition, not just the idea.
- Keep it focused: at most ~5 strong adjectives; more dilutes the result.
- A tight, specific ~30–60 word prompt beats an unfocused long one.`;

const VIDEO_RULES = `
Structure the prompt as: Subject → Action/Movement → Scene → Camera → Lighting → Style/Mood.
Craft rules for these video models:
- Specify ONE primary camera move and give it an endpoint (e.g. "slow dolly-in that settles on
  the face"). Open-ended, unresolved motion causes hangs and artifacts.
- Prefer pacing words (slow, smooth, gentle) and stability (tripod, handheld, gimbal) over
  technical camera parameters.
- Always include a lighting/atmosphere cue — lighting has the single biggest impact on quality.
- Do not stack "fast" cues; at most one element may be fast or the motion jitters.
- Aim for ~60–100 words; a tight prompt outperforms a maxed-out one.`;

// Short model-specific reminders appended to every optimization so presets stay
// model-aware without each restating the model quirks.
const MODEL_NOTES: Record<ModelSlug, string> = {
  "nano-banana-2":
    "Model: Nano Banana 2 (Gemini image). When reference images are present, phrase it as a clear edit/composition instruction over them (\"keep X, change Y\").",
  "gpt-image-2":
    "Model: GPT Image 2. Strong at on-image text — spell out any text verbatim in double quotes with its placement.",
  "kling-o3":
    "Model: Kling O3 image-to-video. The clip starts from the uploaded frame; describe motion and camera FROM that frame — do not re-describe the frame's static contents.",
  "seedance-2":
    "Model: Seedance 2.0 reference-to-video. Preserve any @Image/@Video/@Audio references the editor used (same numbering), embedded naturally in the action; never invent new ones.",
};

export const OPTIMIZER_TEMPLATES: Record<ModelSlug, string> = {
  "nano-banana-2": `${SHARED_RULES}\n${IMAGE_RULES}\n${MODEL_NOTES["nano-banana-2"]}`,
  "gpt-image-2": `${SHARED_RULES}\n${IMAGE_RULES}\n${MODEL_NOTES["gpt-image-2"]}`,
  "kling-o3": `${SHARED_RULES}\n${VIDEO_RULES}\n${MODEL_NOTES["kling-o3"]}`,
  "seedance-2": `${SHARED_RULES}\n${VIDEO_RULES}\n${MODEL_NOTES["seedance-2"]}`,
};

// ─── Optimizer styles (ad-creative presets) ──────────────────────────────────

export type OptimizerPreset =
  | "default"
  | "static-video"
  | "talking-head"
  | "ugc-testimonial"
  | "product-demo"
  | "cinematic-broll"
  | "product-hero"
  | "ugc-photo"
  | "lifestyle";

export const OPTIMIZER_PRESETS = [
  "default",
  "static-video",
  "talking-head",
  "ugc-testimonial",
  "product-demo",
  "cinematic-broll",
  "product-hero",
  "ugc-photo",
  "lifestyle",
] as const;

export type PresetApplicability = "both" | "video" | "image";

export const PRESET_META: Record<
  OptimizerPreset,
  { label: string; description: string; appliesTo: PresetApplicability; scriptInput?: boolean }
> = {
  default: { label: "Default", description: "Model-aware enhancement", appliesTo: "both" },
  "static-video": {
    label: "Static video",
    description: "Static camera, influencer talking straight to camera",
    appliesTo: "video",
    scriptInput: true,
  },
  "talking-head": {
    label: "Talking head",
    description: "Person delivers your script with direct, clear energy",
    appliesTo: "video",
    scriptInput: true,
  },
  "ugc-testimonial": {
    label: "UGC testimonial",
    description: "Authentic handheld selfie review — real, not polished",
    appliesTo: "video",
    scriptInput: true,
  },
  "product-demo": {
    label: "Product demo",
    description: "Hands showing the product, clean close-up motion",
    appliesTo: "video",
  },
  "cinematic-broll": {
    label: "Cinematic B-roll",
    description: "Premium lifestyle/product footage, no dialogue",
    appliesTo: "video",
  },
  "product-hero": {
    label: "Product hero",
    description: "Premium studio hero shot of the product",
    appliesTo: "image",
  },
  "ugc-photo": {
    label: "UGC photo",
    description: "Authentic phone-shot product photo",
    appliesTo: "image",
  },
  lifestyle: {
    label: "Lifestyle",
    description: "Product in an aspirational real-world scene",
    appliesTo: "image",
  },
};

// Spoken-delivery presets: input is the SCRIPT, preserved word-for-word.
const SCRIPT_RULES = `
Treat the editor's input as the SCRIPT the on-camera person speaks, plus any notes about who they
are (gender, persona, look).
Hard rules:
- Preserve the SCRIPT WORD-FOR-WORD inside the double quotes. Never paraphrase, translate, shorten,
  reorder or "improve" the spoken words.
- This is ONE continuous static talking-head shot: do NOT add camera movement, cuts, transitions,
  scene changes or B-roll.
- Output ONLY the single final prompt line — no preamble.`;

const PRESET_TEMPLATES: Record<Exclude<OptimizerPreset, "default">, string> = {
  "static-video": `${SCRIPT_RULES}
Format the prompt in this exact "static video" shape:
(static camera, no movement) <subject> is looking directly at the camera, realistic arm movements,
clear influencer tone: "<script>"
- <subject> is "he", "she", or a short persona description if the editor specified one; otherwise
  "the subject".
- Keep every cue: static camera / no movement / looking directly at the camera / realistic arm
  movements / clear influencer tone.`,

  "talking-head": `${SCRIPT_RULES}
Format the prompt in this exact "talking head" shape:
realistic arm movements, the <woman/man/person> says exactly with direct clear energy: "<script>"
- Use "woman" or "man" if the editor specified the speaker; otherwise "person".
- Keep every cue: realistic arm movements / says exactly / direct clear energy.`,

  "ugc-testimonial": `${SHARED_RULES}
Write a UGC-style testimonial video prompt. Authenticity beats polish — actively fight the model's
tendency to produce "perfect" professional footage.
- Handheld phone footage, slight natural camera shake, natural daylight, an ordinary everyday
  setting (bedroom, kitchen, car, bathroom), candid first-person selfie energy, small imperfections.
  Explicitly say "UGC style, casual smartphone video, not professional footage".
- Realistic arm movements and genuine, expressive facial reactions.
- If the editor's input is a line the person says, keep it WORD-FOR-WORD in double quotes as their
  spoken words with warm, conversational energy. If it's a scene/product description, depict that.
- If a product is mentioned, make it clearly visible early and in focus.
- One continuous selfie shot — no cuts or fancy camera moves.
Output ONLY the prompt.
${MODEL_NOTES["kling-o3"]}`,

  "product-demo": `${SHARED_RULES}
Write a clean product-demo video prompt: a person's hands (or the person) using/showing the product.
- The product is the hero: clearly visible, sharp, materials and detail readable.
- ONE smooth camera move with an endpoint — a slow push-in or gentle gimbal move that settles on the
  product. No fast motion.
- Soft, controlled lighting that flatters the product's surface (lighting is the top quality lever).
- Realistic, deliberate hand movements; tidy, uncluttered framing.
- ~60–100 words, structured Subject → Action → Scene → Camera → Lighting.
The editor's input is the product/concept to feature. Output ONLY the prompt.`,

  "cinematic-broll": `${SHARED_RULES}
Write a premium cinematic B-roll prompt (lifestyle or product beauty footage, no dialogue).
- ONE elegant camera move with a clear endpoint — slow dolly-in, gentle orbit, or crane — smooth on
  a gimbal or tripod. Avoid "fast".
- Rich, intentional lighting and atmosphere; shallow depth of field; filmic, aspirational mood.
- Structured Subject → Action → Scene → Camera → Lighting → Mood; ~60–100 words.
The editor's input is the concept to shoot. Output ONLY the prompt.`,

  "product-hero": `${SHARED_RULES}
${IMAGE_RULES}
Write a premium product hero shot. Photorealistic, commercial/editorial look: soft controlled studio
lighting with subtle highlights, realistic reflections and materials, shallow depth of field, clean
uncluttered background, the product as the unmistakable focus with explicit composition and framing.
The editor's input is the product to feature. Output ONLY the prompt.
${MODEL_NOTES["nano-banana-2"]}`,

  "ugc-photo": `${SHARED_RULES}
Write an authentic UGC-style product photo prompt. Fight the model's "perfect studio" tendency.
- Phone-shot look, natural daylight, a real everyday setting, casual framing, slight imperfection —
  candid and relatable, not a polished studio shot.
- Product held or in-use, clearly visible and in focus.
The editor's input is the product/scene. Output ONLY the prompt.`,

  lifestyle: `${SHARED_RULES}
${IMAGE_RULES}
Write a lifestyle product image prompt: the product used or enjoyed by a person in an aspirational but
believable real-world setting. Soft natural lighting, authentic environment, editorial lifestyle look,
shallow depth of field, explicit composition. The editor's input is the product/scene.
Output ONLY the prompt.`,
};

/** Builds the optimizer system prompt for a model + chosen style. */
export function buildOptimizerSystemPrompt(model: ModelSlug, preset: OptimizerPreset): string {
  if (preset === "default") return OPTIMIZER_TEMPLATES[model];
  // Seedance carries @-references; make sure presets that don't already mention
  // the model still preserve them.
  const base = PRESET_TEMPLATES[preset];
  if (model === "seedance-2" && !base.includes("Seedance")) {
    return `${base}\n${MODEL_NOTES["seedance-2"]}`;
  }
  return base;
}
