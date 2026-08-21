# Production planning

Use this reference before research, scripting, asset generation, or Remotion
implementation. The plan is a creative agreement with the user, not an internal
configuration file.

## Understand the request

Extract what the user already supplied. Resolve only the decisions that would
materially change the video:

- Subject and desired takeaway.
- Audience and assumed knowledge.
- Scope: overview, focused explanation, biography, documentary adaptation, or
  series.
- Target runtime, language, aspect ratio, and destination when relevant.
- Narrative tone and visual direction.
- Source policy: supplied sources, web research, model knowledge, or a mix.
- Visual policy: supplied assets, sourced images, generated images, maps,
  charts, documents, or later generated video.
- Voiceover, captions, music, sound effects, and delivery files.
- Factual, rights, budget, model, or publication constraints.

Do not turn this into a fixed questionnaire. Infer conventional defaults when
they are low risk and state them in the plan. Ask a concise question only when
different answers would substantially change the scope, cost, rights, or
creative result.

## Scope feasibility

Match the content to the runtime. Use the configured voice and language when
known; otherwise estimate narration conservatively and label the estimate.
Reduce scope or propose a series when the requested material cannot be
explained clearly in one video.

Call out material uncertainty before production. Examples include disputed
history, unknown appearance, missing sources, inaccessible illustrations,
copyright restrictions, or visuals that would be speculative reconstructions.

## Write the production plan

Present a concise, user-readable plan with the sections that matter for the
request. Usually include:

1. **Goal and format** — subject, audience, outcome, duration, language, and
   aspect ratio.
2. **Narrative structure** — ordered sections with purpose and approximate
   duration. The opening needs a clear hook and the ending needs a conclusion.
3. **Visual approach** — the visual language and the major visual treatment for
   each section, not a list of identical image zooms.
4. **Asset plan** — supplied, sourced, generated, and programmatic assets, with
   rough counts when useful.
5. **Audio plan** — voice direction, captions, music, and sound effects.
6. **Sources and accuracy** — research boundaries, citation expectations, and
   claims that need special care.
7. **Risks and assumptions** — only material limitations or decisions.
8. **Execution steps** — script, storyboard, asset generation,
   silent preview, audio, final render, and QA as applicable.

Keep the plan proportional. A 60-second explainer may need one screen of text;
a book-derived series needs episode boundaries, source ranges, consistency
rules, and a cost-aware generation strategy.

Save the plan as `src/<video-id>/PRODUCTION_PLAN.md` and keep later changes
visible there.

## Planning quality

Before presenting the plan, verify that:

- The content fits the proposed runtime.
- Every section advances the explanation.
- The visuals explain or add evidence instead of merely decorating narration.
- Expensive generation is bounded by the configured asset list.
- Important factual claims have a source strategy.
- Assumptions are visible and editable.
- The user can understand what will be made without reading implementation
  details.
