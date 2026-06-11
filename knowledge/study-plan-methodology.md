# Study Plan Methodology — Herald Knowledge Base
*Foundry IQ Knowledge Source · Work IQ Integration Guide · Synthetic data only*

## Work IQ Signal Integration
Herald uses Work IQ-style signals from engineer profiles to generate capacity-aware study plans.

### Capacity calculation
```
available_focus_hours = focus_hours_per_week - 4  (reserve 4h for urgent tasks)
weekly_study_capacity = min(available_focus_hours, 8)  (cap at 8h/week)
if meeting_hours_per_week > 20: weekly_study_capacity = min(weekly_study_capacity, 4)
estimated_weeks = ceil(cert_recommended_hours / weekly_study_capacity)
```

### Study window selection
Engineers are assigned study windows based on their `preferred_learning_slot`:
- **Morning** (9–11 AM): Best for engineers with afternoon-heavy meeting schedules
- **Afternoon** (2–4 PM): Best for engineers with morning standups and syncs
- **Evening** (6–8 PM): For engineers with fully packed daytime schedules

### Priority tiers
- **High priority**: Critical certification (AZ-500, SC-300, AZ-400) + change type is breaking or high-risk
- **Medium priority**: Non-critical cert missing + change type is feature/bugfix
- **Low priority**: Recommended (not required) cert

## Recommended study sequence
For engineers missing multiple certifications, recommend in this order:
1. Foundational (AZ-900, DP-900) if not held
2. Role-specific mandatory cert (AZ-500, AZ-204, etc.)
3. Secondary mandatory cert
4. Recommended certs

## Manager insights
For high-risk breaking changes with team readiness < 70%:
- Flag in Teams announcement
- Generate per-engineer study plans
- Suggest a team study sprint (2-week focused block) before rollout
- Re-run readiness assessment after sprint completion
