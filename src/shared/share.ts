// The score comment a player can choose to post. Spoiler-safe: it never shows where the dots were planted.

/**
 * The score comment is posted by the app's own account (unapproved apps cannot post as the player), on an explicit tap,
 * replying to the pinned comment. The player's name goes in the text unless they chose "Hide my name".
 */
export const SHARE_ENABLED = true;

export type ShareInput = {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  kept: number;
  bestPossible: number;
  immunity: number;
  clean: boolean;
  /** "u/name" when the app posts for the player; null when they hide their name. Omitted = first person (own account). */
  who?: string | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyShortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** Plain Markdown, always the same shape. With `who` it speaks about the player (posted by the lab's account). */
export function shareText(s: ShareInput): string {
  const filled = Math.max(0, Math.min(10, Math.round(s.immunity / 10)));
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);
  const head = `**Epidemic Dots, ${prettyShortDay(s.day)}**`;
  if (s.who === undefined) {
    const extra = s.clean ? ' The germs never touched me.' : '';
    return [head, `${bar} ${s.immunity}% immune: I kept ${s.kept} of ${s.bestPossible} dots.${extra}`, 'Can you beat it?'].join('\n\n');
  }
  const who = s.who ?? 'A player who prefers to stay anonymous';
  const extra = s.clean ? ' The germs never touched them.' : '';
  return [
    head,
    `${bar} ${who} is ${s.immunity}% immune: kept ${s.kept} of ${s.bestPossible} dots.${extra}`,
    'Can you beat it?',
    '^(Posted by the lab, at their request.)',
  ].join('\n\n');
}
