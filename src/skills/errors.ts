/**
 * Thrown when `getSkillBody()` is called on a skill that has neither a
 * pre-loaded `body` nor a `bodyLoader` closure. This indicates a coding
 * error — the skill was constructed without one of the two loading paths.
 */
export class SkillBodyMissingError extends Error {
  constructor(public readonly skillName: string) {
    super(
      `skill "${skillName}" has no body and no bodyLoader — was it constructed outside of loadSkillsEager / loadSkillsLazy?`,
    )
    this.name = 'SkillBodyMissingError'
  }
}

/**
 * Thrown by the sub-skills graph resolver when a cycle is detected in the
 * `sub_skills` dependency graph. Cycles cause infinite runtime recursion and
 * must be rejected at load time, never silently degraded.
 *
 * The message includes the full cycle path, e.g.:
 *   "sub_skills cycle detected: a → b → c → a"
 *
 * (Plan 33 A2)
 */
export class SkillCycleError extends Error {
  /** The full cycle path as a string, e.g. "a → b → c → a". */
  public readonly cyclePath: string

  constructor(path: string[]) {
    // path is the DFS stack at the point of detection, e.g. ['a', 'b', 'c']
    // We append the first element again to show the closing edge.
    const cycle = [...path, path[0]].join(' → ')
    super(`sub_skills cycle detected: ${cycle}`)
    this.name = 'SkillCycleError'
    this.cyclePath = cycle
  }
}
