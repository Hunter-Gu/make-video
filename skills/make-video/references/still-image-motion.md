# Motion design for still-image videos

Use this reference when most shots are still images. Plan motion before writing
`REMOTION_TIMELINE.json`; a transition name by itself is not a motion plan.

## Design motion around attention

Give each shot one visual job and one primary movement. Motion should reveal a
detail, connect two ideas, change scale, or create a deliberate pause. Leave a
shot still when movement has no narrative purpose. A sequence of identical
slow zooms is visually flat even when every frame is technically animated.

Use three levels of motion:

1. **Composition:** choose the focal point and crop that support the narration.
2. **Shot motion:** hold, push in, pull out, pan, or use real layered parallax.
3. **Boundary:** cut or transition according to the relationship between shots.

One narration block may use multiple crops or images. Prefer a meaningful cut
to a second detail over stretching one image through a long sentence.

## Camera movement

- Start and end with short holds. At 30 fps, 8–15 frames is usually enough.
- Use eased movement, not constant linear movement. Ease both position and
  scale with the same curve so the image feels like one camera.
- Keep ordinary push-ins small: roughly 2–6 percent over a 4–8 second shot.
  Larger moves need a clear reveal and enough source resolution.
- Move toward the subject. Set explicit start/end position instead of relying
  on a centered crop when the focal point is off-center.
- Do not move every shot. Alternate motion, stillness, graphic animation, and
  cuts to create rhythm.
- Do not fake parallax by sliding one flat image. Use separated foreground,
  subject, and background layers with clean masks, or stay with a 2D move.

For `REMOTION_TIMELINE.json`, camera effects may use:

```json
{
  "parameters": {
    "zoomFrom": 1.01,
    "zoomTo": 1.05,
    "xFrom": -8,
    "xTo": 12,
    "yFrom": 0,
    "yTo": -6,
    "holdInFrames": 10,
    "holdOutFrames": 14
  }
}
```

## Transitions

Treat every transition as a boundary shot, not an effect pasted between two
finished shots. Decide it while storyboarding so image prompts, crops, camera
movement, captions, and timing can support the same boundary.

### Classify the boundary first

Before choosing a transition, answer these questions:

1. **Narrative relationship:** continuation, contrast, cause/result, elapsed
   time, spatial travel, emotional association, or chapter break?
2. **Focal relationship:** do both images place attention in approximately the
   same area, or must the viewer search for a new subject?
3. **Scale relationship:** detail to detail, wide to wide, wide to detail, or
   detail to wide?
4. **Visual compatibility:** are subject identity, pose, lighting, palette, and
   geometry consistent enough to overlap without creating a false morph?
5. **Caption relationship:** does one sentence continue across the boundary,
   or does a new clause or idea begin there?

Use the answer, not a desire for visual variety, to choose the boundary:

| Relationship | Preferred treatment | Why |
| --- | --- | --- |
| Same subject, continuous thought, compatible composition | focal-match dissolve | Preserves attention without making the subject jump |
| New fact, contrast, reaction, or causal beat | settled hard cut | Gives the idea a clear edge |
| Detail to wider context, or wider context to detail | scale-matched cut or short dissolve | Turns a scale change into explanation |
| Movement through geography or a directional process | directional wipe or slide | Makes direction carry meaning |
| Memory, reflection, uncertainty, or elapsed time | slow dissolve or focus bridge | Softens chronology without claiming exact continuity |
| Major chapter, location, or emotional reset | dip to a deliberate color/title card | Creates a real pause rather than decorating a cut |
| Inconsistent generated depictions of the same person/object | cut, occlusion, or chapter bridge | Avoids a visible morph between incompatible images |

### Supported boundary treatments

Choose each boundary from meaning, not variety for its own sake:

- `cut`: default for a new fact, reaction, contrast, or rhythmic beat.
- `dissolve`: continuity, memory, reflection, or elapsed time.
- `wipe-left` / `wipe-right`: spatial travel or a clearly directional idea.
- `slide-left`: a chapter or panel change, used sparingly.

At 30 fps, use 6–10 frames for a micro-dissolve that only softens a cut, 10–15
frames for a crisp visible transition, and 18–24 frames for a reflective
dissolve. A transition should rarely exceed 15 percent of the shorter shot.
Do not apply one transition to every scene.

The outgoing camera should normally reach zero velocity before the boundary.
The incoming camera should remain still until the transition lands. Set the
outgoing `holdOutFrames` and incoming `holdInFrames` to at least the transition
duration when a dissolve, wipe, or slide must feel calm. Continue motion across
a cut only when both images share a compatible direction and focal path.

Keep captions outside the transitioning media layers. When one caption spans
multiple images, leave it visually stable while the imagery changes beneath
it. When the caption also changes, place the image boundary on a spoken pause
or clause boundary; do not start a new caption, camera move, and transition on
the same frame unless the deliberate effect is a sharp chapter break.

Declare the incoming scene's boundary treatment in its effect parameters:

```json
{
  "parameters": {
    "transition": "dissolve",
    "transitionFrames": 18
  }
}
```

### Reusable transition patterns

Use these as decision patterns, not presets to cycle through.

#### Settled cut

Stop the outgoing camera for 6–12 frames, cut on the narration beat, hold the
incoming image briefly, then begin its movement. This is the strongest default
for explanations because it separates ideas without drawing attention to the
edit.

#### Focal-match dissolve

Align the important subject in both crops before overlapping them. Let the
outgoing camera settle, blend the images for 12–20 frames, then begin the
incoming move. Use it for the same person, place, object, or emotional thread.
Reject it when generated faces, limbs, architecture, or horizons do not align;
the overlap will look like an unintended morph.

#### Scale bridge

End one image on a meaningful detail and begin the next image with that detail
in a similar screen position before revealing wider context, or do the reverse.
Use a cut when the scale change is explanatory and a short dissolve when it is
reflective. Do not simulate a large continuous zoom across unrelated images.

#### Directional continuation

Use a pan, wipe, or slide only when the story has direction: a journey across a
map, movement from one location to another, a process flowing left to right, or
a chronological advance. Settle the outgoing image into the direction, carry
that direction through the boundary, and let the incoming composition absorb
it. Reversing direction without narrative reason feels like a camera mistake.

#### Light or color bridge

Match a bright region, night sky, paper tone, or dominant color across images.
A short dissolve can make the shared light act as the bridge. Use a deliberate
dip to dark only for a larger reset. Avoid flashing exposure or adding light
leaks that are absent from the visual language.

#### Occlusion bridge

When two generated images are semantically continuous but geometrically
incompatible, briefly let a meaningful graphic layer, map, document, foreground
shape, or chapter title cover the boundary. The occluder must belong to the
story; do not invent a random swoosh merely to hide the cut.

#### Chapter reset

Let the previous shot settle, dip to the palette's background color, introduce
the next chapter title or location, then reveal the next image. Reserve this
for genuine structural changes. Repeating it between ordinary scenes makes the
video feel slow and fragmented.

### Transition planning record

For every non-trivial boundary, record the decision in `STORYBOARD.md` or the
motion plan before implementation:

- Incoming scene ID and narrative relationship.
- Outgoing and incoming focal positions.
- Whether identity/geometry is safe to overlap.
- Outgoing hold, transition duration, and incoming hold.
- Caption behavior across the boundary.
- Chosen treatment and one-sentence reason.

If the reason is only "to make it less boring," use a settled cut and improve
the shot choice or scene rhythm instead.

### Generated-image constraints

Plan important adjacent images as a pair when they are expected to dissolve or
match-cut. Reuse character descriptions, camera angle, focal placement, time of
day, palette, and horizon height in their generation prompts. Ask for extra
space in the intended movement direction and keep important anatomy away from
the crop edge.

Do not assume stylistic consistency means geometric continuity. Inspect the
actual images before committing to an overlap. Generated portraits with small
changes in eyes, hands, clothing, or silhouette usually look better with a cut
or an intervening evidence shot than with a dissolve.

### Transition anti-patterns

- Applying the same wipe, dissolve, or zoom transition to every image.
- Moving both images aggressively while also animating the boundary.
- Dissolving between incompatible faces or object shapes.
- Using a fade to black for routine sentence-level changes.
- Using spins, cube rotations, page curls, bounce, glitch, or lens effects
  without a visual-system or narrative reason.
- Hiding a weak storyboard behind increasingly elaborate transitions.
- Letting captions fade, slide, or blur merely because the image changes.
- Starting the incoming camera move before the viewer can locate its subject.
- Cutting from one high-velocity virtual camera move to an unrelated direction.
- Using transition duration to compensate for images held on screen too long.

## Avoid jitter and shimmer

- Generate or upscale images above the final crop size. Allow at least 8–12
  percent overscan for camera movement; do not animate a source already smaller
  than the delivery frame.
- Use Remotion's frame-based transforms with subpixel `translate3d()` and one
  eased transform. Avoid repeatedly cropping and resizing the same image.
- Treat FFmpeg `zoompan` as a compatibility preview, not the final renderer.
  Its integer crop positions can produce visible stepping and edge shimmer.
- Keep transforms on the media layer; do not animate layout dimensions.
- Inspect motion at 100 percent scale. Check the subject's eyes, high-contrast
  edges, thin lines, and textured backgrounds across consecutive frames.
- If movement still shimmers, reduce the travel or zoom, start from a larger
  source, or render oversized and downsample once at the end.

## Review the silent edit

Watch the whole preview without audio, then inspect every boundary. Reject the
edit when movement attracts attention without explaining anything, when two
adjacent shots repeat the same move, or when captions compete with the focal
point. The motion plan is ready only when its rhythm remains understandable in
silence.

Review boundaries frame by frame as well as at normal speed. Check the last
12–24 frames of the outgoing shot and the first 12–24 frames of the incoming
shot. Confirm that the outgoing image settles, the transition preserves or
deliberately redirects attention, the incoming subject is immediately
findable, and no crop, subtitle, or generated detail visibly jumps.
