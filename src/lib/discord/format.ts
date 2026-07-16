/** Convert NewsDash WhatsApp-style *bold* to Discord **bold**. */
export function whatsappToDiscordMarkdown(text: string): string {
  let s = String(text || '');
  // WhatsApp single-asterisk bold → Discord double-asterisk
  s = s.replace(/\*([^*\n]+)\*/g, '**$1**');
  return s.trim();
}

/** Discord message content hard limit is 2000 characters. */
export function chunkDiscordContent(text: string, limit = 1900): string[] {
  const cleaned = String(text || '').trim();
  if (!cleaned) return ['_Empty reply_'];
  if (cleaned.length <= limit) return [cleaned];

  const chunks: string[] = [];
  let rest = cleaned;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.4) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.4) cut = limit;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export type SourceButton = { type?: string; text?: string; url?: string };

/** Discord link buttons (max 5 per row, max 5 rows). */
export function sourceButtonsToComponents(buttons: SourceButton[] | undefined) {
  if (!Array.isArray(buttons) || !buttons.length) return undefined;
  const links = buttons
    .filter((b) => b?.url && /^https?:\/\//i.test(b.url))
    .slice(0, 5)
    .map((b, i) => ({
      type: 2, // BUTTON
      style: 5, // LINK
      label: String(b.text || `Source ${i + 1}`).slice(0, 80),
      url: b.url!,
    }));
  if (!links.length) return undefined;
  return [{ type: 1, components: links }]; // ACTION_ROW
}
