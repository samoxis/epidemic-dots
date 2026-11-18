// "Yesterday in the lab": a short recap the app adds to the top of each daily post's pinned comment, so every day
// starts with a bit of shared story (how the subreddit did, whether it earned a Vaccine day, who was Patient Zero).
// Plain text in, Reddit markdown out; Patient Zero sits behind a spoiler tag.

export type RecapInput = {
  /** Pretty date of the day being recapped, e.g. "Tue, Nov 18". */
  dateLabel: string;
  /** Real players who ran yesterday's board (bots never count). */
  players: number;
  /** Their average best immunity, 0-100. */
  avgImmunity: number;
  /** Yesterday's team goal, 0-100. */
  goal: number;
  /** Best immunity among real players yesterday, or null. */
  bestImmunity: number | null;
  /** Colour name of yesterday's Patient Zero, or null if unknown. */
  zeroName: string | null;
  /** True when today is a Vaccine day (yesterday's goal was reached). */
  vaccineToday: boolean;
  /** Today's mutation display name and who picked it; null when there is none. */
  twist: { name: string; by: 'players' | 'rats' } | null;
  /** A twist that was picked but cancelled because it made today's board unfair. */
  cancelledTwist: string | null;
};

export function recapText(r: RecapInput): string {
  const lines: string[] = [];
  if (r.players === 0) {
    lines.push(`**Yesterday in the lab (${r.dateLabel}):** only the lab rats showed up. Be the first real player today.`);
  } else {
    const who = r.players === 1 ? '1 real player' : `${r.players} real players`;
    let s = `**Yesterday in the lab (${r.dateLabel}):** ${who}, average immunity ${r.avgImmunity}% (goal ${r.goal}%).`;
    if (r.bestImmunity !== null) s += ` Best run: ${r.bestImmunity}%.`;
    lines.push(s);
    lines.push(
      r.vaccineToday
        ? 'Goal reached, so today is a **Vaccine day**: the germs sleep in. Well done, lab.'
        : 'Goal missed. The germs are insufferable about it. Today is a fresh chance.'
    );
  }
  if (r.zeroName) lines.push(`Yesterday's Patient Zero was >!the ${r.zeroName} colony!<. Always the quiet ones.`);
  if (r.twist) {
    lines.push(`Today's twist: **${r.twist.name}**, ${r.twist.by === 'players' ? 'picked by your votes' : 'picked by the lab rats (bots), since nobody voted'}.`);
  } else if (r.cancelledTwist) {
    lines.push(`Today's twist (**${r.cancelledTwist}**) was cancelled: it made the board unfair. Paperwork was filed.`);
  }
  return lines.join('\n\n');
}
