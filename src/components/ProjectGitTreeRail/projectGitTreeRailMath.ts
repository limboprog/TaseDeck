export type ProjectGitBranchTarget = {
  offsetY: number;
  targetX: number;
};

/** Git └ corner — large visible quarter-turn. */
export function buildArcBranchPath(
  trunkX: number,
  targetX: number,
  targetY: number,
): string {
  const dx = Math.max(targetX - trunkX, 12);
  const r = Math.min(34, Math.max(26, dx * 0.92));
  if (dx <= 10) {
    return `M ${trunkX} ${targetY} H ${targetX}`;
  }
  return [
    `M ${trunkX} ${targetY - r}`,
    `C ${trunkX} ${targetY} ${trunkX} ${targetY} ${trunkX + r} ${targetY}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
}

export function resolveProjectGitTreeHeight(
  branchTargets: ProjectGitBranchTarget[],
  trunkStartY: number,
): number {
  if (branchTargets.length === 0) {
    return trunkStartY + 20;
  }
  const ys = [trunkStartY, ...branchTargets.map((node) => node.offsetY)];
  return Math.max(...ys, 0) + 20;
}
