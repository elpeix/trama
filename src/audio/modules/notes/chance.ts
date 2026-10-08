/** Whether a step with `chance`, in percent, sounds this time round; one with none always does, without a roll. */
export function soundsThisTime(chance: number | undefined, random: () => number): boolean {
  return chance === undefined || random() * 100 < chance;
}
