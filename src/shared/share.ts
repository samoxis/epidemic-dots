// The score comment a player can choose to post. Spoiler-safe: it never shows where the dots were planted.

/**
 * Switched off until the app is approved by Reddit. For unapproved apps `runAs: 'USER'` does not post as the player
 * (it fails or posts from the app account), so the button would make a promise we cannot keep. Flip to true after approval.
 */
export const SHARE_ENABLED = false;

export type ShareInput = {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  kept: number;
  bestPossible: number;
  immunity: number;
  clean: boolean;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyShortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** Plain Markdown, three lines, always the same shape. */
export function shareText(s: ShareInput): string {
  const filled = Math.max(0, Math.min(10, Math.round(s.immunity / 10)));
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);
  const extra = s.clean ? ' The germs never touched me.' : '';
  return [
    `**Epidemic Dots, ${prettyShortDay(s.day)}**`,
    `${bar} ${s.immunity}% immune: I kept ${s.kept} of ${s.bestPossible} dots.${extra}`,
    'Can you beat it?',
  ].join('\n\n');
}
