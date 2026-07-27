/**
 * Identity / persona / capability questions about the bot itself.
 * These must be answered directly and never reach news retrieval — no news
 * corpus can answer them, and vector search will return the closest garbage.
 * Patterns are anchored on second-person references so news asks like
 * "who is the new OpenAI CEO?" never match.
 */
export function isIdentityAsk(q: string): boolean {
  const s = String(q || '').toLowerCase().trim();
  if (!s || s.length > 120) return false;
  // English
  if (
    /\b(what(?:'?s| is)? your name|tell me your name|who are you|introduce yourself|about yourself|tell me about you(?:rself)?|are you (?:a |an )?(?:bot|robot|ai|human|real|person)|who (?:made|created|built|developed) you|what can you do|what do you do|how do you work|what are you)\b/.test(
      s,
    )
  ) {
    return true;
  }
  // Roman Urdu — "apna naam batao", "aapka naam", "tum kon ho", etc.
  if (
    /\bapna\s+(?:naam|nam)\b/.test(s) ||
    /\b(?:tum|tm|aa?p)(?:hara|hari|ka|ki|k)?\s*(?:naam|nam)\b/.test(s) ||
    /\b(?:tum|tm|aa?p)\s+k(?:au|o)n\s+h(?:o|ain|e)\b/.test(s) ||
    /\bapna\s+(?:taa?ru+f|introduction|intro)\b/.test(s) ||
    /\bkis\s*ne\s+banaya\b/.test(s) ||
    /\b(?:tum|aa?p)\s+kya\s+(?:ho|kar\s*sakte)\b/.test(s) ||
    /\bnaam\s+(?:bata(?:o|ein|iye)?|kya\s+hai)\b/.test(s)
  ) {
    return true;
  }
  // Urdu script
  return /تمہارا نام|تمھارا نام|آپ کا نام|اپنا نام|تم کون ہو|آپ کون ہیں|اپنا تعارف|تعارف کرا|کس نے بنایا|تم کیا ہو|نام بتاؤ|نام بتائیں/.test(
    q,
  );
}
