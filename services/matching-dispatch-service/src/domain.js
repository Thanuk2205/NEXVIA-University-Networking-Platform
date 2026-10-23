import { withinScope } from "@nexvia/platform-utils";
export const ruleVersion = "2026-10-v1";
export function match(profile, opportunity) {
  const mandatoryCriteria = [];
  const add = (label, ok, unknown = false) =>
    mandatoryCriteria.push({
      label,
      state: unknown ? "unknown" : ok ? "satisfied" : "missing",
      reason: unknown
        ? "Required profile information is not available."
        : ok
          ? "Your profile satisfies this requirement."
          : "Your profile does not currently satisfy this requirement.",
    });
  add(
    "Open opportunity",
    opportunity.status === "published" &&
      (!opportunity.deadline || new Date(opportunity.deadline) > new Date()),
  );
  add(
    "Eligible role",
    (opportunity.eligibleRoles || ["student"]).includes(profile.role),
  );
  for (const [key, value] of Object.entries(opportunity.scope || {}))
    add(
      key,
      String(profile[key]) === String(value),
      profile[key] === undefined,
    );
  const skills = new Set(profile.skills || []);
  const required = opportunity.mandatorySkills || [];
  if (required.length)
    add(
      `Mandatory skills (${opportunity.skillMode || "all"})`,
      opportunity.skillMode === "any"
        ? required.some((s) => skills.has(s))
        : required.every((s) => skills.has(s)),
      !profile.skills,
    );
  const matchedPreferredCriteria = [],
    missingPreferredCriteria = [],
    components = [];
  const preferred = opportunity.preferredSkills || [];
  if (preferred.length) {
    const hits = preferred.filter((s) => skills.has(s));
    components.push({
      criterion: "preferredSkills",
      weight: 70,
      value: hits.length / preferred.length,
    });
    for (const s of preferred)
      (skills.has(s)
        ? matchedPreferredCriteria
        : missingPreferredCriteria
      ).push({
        label: s,
        reason: skills.has(s)
          ? "A preferred skill is listed in your profile."
          : "A preferred skill is not listed in the available profile.",
      });
  }
  if (opportunity.preferredDegrees?.length) {
    const ok = opportunity.preferredDegrees.includes(profile.degreeProgramId);
    components.push({
      criterion: "preferredDegree",
      weight: 20,
      value: ok ? 1 : 0,
    });
    (ok ? matchedPreferredCriteria : missingPreferredCriteria).push({
      label: "Preferred degree",
      reason: ok
        ? "Your degree is a preferred track."
        : "No preferred degree is listed in the available profile.",
    });
  }
  if (opportunity.preferredAchievementKinds?.length) {
    const ok = (profile.achievements || []).some((a) =>
      opportunity.preferredAchievementKinds.includes(a.kind),
    );
    components.push({
      criterion: "relevantAchievement",
      weight: 10,
      value: ok ? 1 : 0,
    });
    (ok ? matchedPreferredCriteria : missingPreferredCriteria).push({
      label: "Relevant declared achievement",
      reason: ok
        ? "A relevant declared achievement is listed."
        : "No relevant achievement is listed in the available profile.",
    });
  }
  const eligible = mandatoryCriteria.every((c) => c.state === "satisfied"),
    total = components.reduce((s, c) => s + c.weight, 0);
  return {
    eligibilityStatus: eligible
      ? "eligible"
      : mandatoryCriteria.some((c) => c.state === "unknown")
        ? "needs_profile_completion"
        : "ineligible",
    mandatoryCriteria,
    matchedPreferredCriteria,
    missingPreferredCriteria,
    score:
      eligible && total
        ? Math.round(
            (100 * components.reduce((s, c) => s + c.weight * c.value, 0)) /
              total,
          )
        : null,
    components: components.map((c) => ({
      ...c,
      normalizedWeight: total ? c.weight / total : 0,
    })),
    ruleVersion,
    profileVersion: profile.profileVersion,
    opportunityRevision: opportunity.revision,
    computedAt: new Date().toISOString(),
  };
}
