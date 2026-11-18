import type { Mutation } from '../../shared/engine';

export type VotableMutation = Exclude<Mutation, 'none'>;

/** What the subreddit can vote for. The effects are enforced by the shared engine. */
export const MUTATION_INFO: Record<VotableMutation, { name: string; text: string }> = {
  zoomier: { name: 'Zoomier', text: 'Spreads every round, but only hops 1 square.' },
  jumpier: { name: 'Jumpier', text: 'Hops one square further, and never wakes before round 3.' },
  grumpier: { name: 'Grumpier', text: 'The germs wake up a round earlier.' },
};

export function mutationName(m: Mutation): string {
  return m === 'none' ? '' : MUTATION_INFO[m].name;
}
