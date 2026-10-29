import "server-only";

/**
 * Provider error messages sometimes come back in Vietnamese. toEnglish()
 * leaves English untouched and translates Vietnamese via Google Translate's
 * public endpoint (no key). Only the short error string is sent. If the
 * translation can't be fetched, known phrases are swapped locally and the
 * original text is kept rather than losing the error.
 */

// Letters only Vietnamese uses (ă đ ơ ư and tone-marked vowels).
const VIETNAMESE =
  /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export function isVietnamese(text: string): boolean {
  return VIETNAMESE.test(text);
}

// ponytail: tiny offline fallback for the most likely outage/policy phrases.
const PHRASES: [RegExp, string][] = [
  [/hệ thống đang quá tải/gi, "the system is overloaded"],
  [/vui lòng thử lại sau/gi, "please try again later"],
  [/vui lòng thử lại/gi, "please try again"],
  [/vi phạm chính sách/gi, "violates the content policy"],
  [/không đủ số dư|số dư không đủ/gi, "insufficient balance"],
  [/lỗi máy chủ/gi, "server error"],
  [/hết thời gian chờ/gi, "timed out"],
  [/thất bại/gi, "failed"],
];

const cache = new Map<string, string>();

export async function toEnglish(text: string): Promise<string> {
  if (!text || !isVietnamese(text)) return text;
  const hit = cache.get(text);
  if (hit) return hit;
  let out: string | null = null;
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t&q=" +
      encodeURIComponent(text.slice(0, 1000));
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as [[string, string][]];
      const joined = data[0]?.map((part) => part[0]).join("").trim();
      if (joined) out = joined;
    }
  } catch {
    // offline / blocked — fall through to the phrase list
  }
  if (!out) {
    out = PHRASES.reduce((s, [re, en]) => s.replace(re, en), text);
  }
  if (cache.size > 200) cache.clear();
  cache.set(text, out);
  return out;
}
