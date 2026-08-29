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

Choose each boundary from meaning, not variety for its own sake:

- `cut`: default for a new fact, reaction, contrast, or rhythmic beat.
- `dissolve`: continuity, memory, reflection, or elapsed time.
- `wipe-left` / `wipe-right`: spatial travel or a clearly directional idea.
- `slide-left`: a chapter or panel change, used sparingly.

At 30 fps, use about 8–15 frames for a crisp transition and 18–24 frames for a
reflective dissolve. Do not apply one transition to every scene. Match the
incoming movement to the outgoing composition when possible, and reserve fades
to black for chapter boundaries, major emotional pauses, and endings.

Declare the incoming scene's boundary treatment in its effect parameters:

```json
{
  "parameters": {
    "transition": "dissolve",
    "transitionFrames": 18
  }
}
```

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
