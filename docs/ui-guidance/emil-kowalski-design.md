# Emil Kowalski design guidance

Source: [Agents with Taste](https://emilkowal.ski/ui/agents-with-taste) and [Apple Design skill](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md).

Use these principles when refining LoadPilot’s interface:

- Make interaction feedback immediate. Highlight controls on press and keep the input path free of unnecessary delays.
- Prefer motion that starts from the element’s current position. Avoid abrupt jumps when state changes.
- Use restrained, critically damped motion for ordinary UI. Reserve bounce for interactions that carry momentum.
- Keep enter and exit paths spatially consistent. A surface that enters from one direction should leave through the same relationship.
- Use short durations: roughly 100–150ms for micro-feedback and 150–250ms for ordinary UI transitions. Keep UI motion under 300ms unless it represents a larger physical movement.
- Keep body copy near 65ch, use readable line-height, and reserve underlines for actual links.
- Make hit targets comfortably tappable, including invisible padding where needed.
- Respect `prefers-reduced-motion` and never make essential information depend on animation.

For LoadPilot, favor responsive nav feedback, visual investigation stages, restrained color accents, and small state transitions over decorative motion.
