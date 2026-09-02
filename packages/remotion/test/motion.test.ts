import assert from "node:assert/strict";
import {test} from "node:test";

import {
  activeTimelineEffects,
  mediaSrc,
  timelineEffectProgress,
  timelineImageTransform,
  timelineMotionEffectForScene,
  timelineTransitionEffectForScene,
  type TimelineEffect,
} from "../src/index";

const effect = (values: Partial<TimelineEffect> & {id: string}): TimelineEffect => ({
  sceneId: "opening",
  type: "ken-burns",
  label: "Slow push",
  startFrame: 0,
  endFrame: 100,
  ...values,
});

/** timelineImageTransform returns a CSS transform; read the numbers back out of it. */
const transform = (value: string) => {
  const match = value.match(/^translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) scale\((-?[\d.]+)\)$/);
  assert.ok(match, `unexpected transform: ${value}`);
  return {x: Number(match[1]), y: Number(match[2]), scale: Number(match[3])};
};

const close = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} is not ${expected}`);

test("an effect is active from its start frame up to, but not including, its end", () => {
  const effects = [effect({id: "push", startFrame: 10, endFrame: 20})];
  assert.deepEqual(activeTimelineEffects(effects, "opening", 9), []);
  assert.deepEqual(activeTimelineEffects(effects, "opening", 10).map((item) => item.id), ["push"]);
  assert.deepEqual(activeTimelineEffects(effects, "opening", 19).map((item) => item.id), ["push"]);
  assert.deepEqual(activeTimelineEffects(effects, "opening", 20), [], "frame ranges are end-exclusive everywhere in a project");
  assert.deepEqual(activeTimelineEffects(effects, "closing", 15), [], "an effect belongs to one scene");
});

test("effect progress is clamped outside its own window", () => {
  const push = effect({id: "push", startFrame: 20, endFrame: 40});
  assert.equal(timelineEffectProgress(0, push), 0);
  assert.equal(timelineEffectProgress(30, push), 0.5);
  assert.equal(timelineEffectProgress(90, push), 1);
  assert.equal(timelineEffectProgress(30, null), 0);
});

test("the scene's motion comes from the effect that declares motion", () => {
  const effects = [
    effect({id: "overlay", type: "progressive-reveal"}),
    effect({id: "push", parameters: {zoomFrom: 1, zoomTo: 1.2}}),
  ];
  assert.equal(timelineMotionEffectForScene(effects, "opening")?.id, "push");
  // With nothing declaring motion, any effect on the scene still frames the shot.
  assert.equal(timelineMotionEffectForScene([effects[0]], "opening")?.id, "overlay");
  assert.equal(timelineMotionEffectForScene(effects, "closing"), null);
});

test("a transition is only read from an effect that names one", () => {
  const effects = [effect({id: "push", parameters: {zoomTo: 1.2}}), effect({id: "dissolve", parameters: {transition: "dissolve"}})];
  assert.equal(timelineTransitionEffectForScene(effects, "opening")?.id, "dissolve");
  assert.equal(timelineTransitionEffectForScene([effects[0]], "opening"), null, "a scene without a declared transition cuts");
});

test("without an effect the shot uses the caller's progress and a gentle default push", () => {
  close(transform(timelineImageTransform(0, null, 0)).scale, 1.01, "start");
  close(transform(timelineImageTransform(0, null, 1)).scale, 1.05, "end");
  assert.deepEqual(transform(timelineImageTransform(0, null, 0.5)), {x: 0, y: 0, scale: 1.03});
});

test("a declared push and pan run between their own endpoints", () => {
  const push = effect({id: "push", startFrame: 0, endFrame: 100, parameters: {zoomFrom: 1, zoomTo: 1.4, xFrom: -40, xTo: 40, yFrom: 10, yTo: -10}});
  assert.deepEqual(transform(timelineImageTransform(0, push, 0)), {x: -40, y: 10, scale: 1});
  assert.deepEqual(transform(timelineImageTransform(100, push, 0)), {x: 40, y: -10, scale: 1.4});
  const middle = transform(timelineImageTransform(50, push, 0));
  close(middle.scale, 1.2, "eased midpoint");
  close(middle.x, 0, "pan midpoint");
});

test("holds keep the frame still at the head and tail of a shot", () => {
  const held = effect({id: "held", startFrame: 0, endFrame: 100, parameters: {zoomFrom: 1, zoomTo: 1.4, holdInFrames: 25, holdOutFrames: 25}});
  close(transform(timelineImageTransform(0, held, 0)).scale, 1, "before the hold ends");
  close(transform(timelineImageTransform(25, held, 0)).scale, 1, "movement starts after the hold");
  close(transform(timelineImageTransform(75, held, 0)).scale, 1.4, "movement finishes before the tail hold");
  close(transform(timelineImageTransform(100, held, 0)).scale, 1.4, "still through the tail hold");
});

test("holds longer than the shot still produce a usable move", () => {
  // Interpolating needs a strictly increasing input range; oversized holds are
  // clamped so a mistyped hold cannot crash a render midway through.
  const swallowed = effect({id: "swallowed", startFrame: 0, endFrame: 100, parameters: {zoomFrom: 1, zoomTo: 1.4, holdInFrames: 900, holdOutFrames: 900}});
  const start = transform(timelineImageTransform(0, swallowed, 0));
  const end = transform(timelineImageTransform(100, swallowed, 0));
  close(start.scale, 1, "start");
  close(end.scale, 1.4, "end");
  close(transform(timelineImageTransform(50, swallowed, 0)).scale, 1.2, "the move survives in the middle");

  const negative = effect({id: "negative", parameters: {zoomFrom: 1, zoomTo: 1.4, holdInFrames: -50}});
  close(transform(timelineImageTransform(0, negative, 0)).scale, 1, "a negative hold is treated as none");
});

test("a zero-length effect reports no progress instead of crashing", () => {
  const instant = effect({id: "instant", startFrame: 40, endFrame: 40, parameters: {zoomFrom: 1, zoomTo: 2, holdInFrames: 10}});
  assert.equal(timelineEffectProgress(40, instant), 0);
  close(transform(timelineImageTransform(40, instant, 0)).scale, 1, "an effect with no length holds its opening frame");
});

test("only public-relative media is resolved through Remotion's static base", () => {
  assert.equal(mediaSrc("https://example.test/a.png"), "https://example.test/a.png");
  assert.equal(mediaSrc("/media?path=a.png"), "/media?path=a.png");
  assert.equal(mediaSrc("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(mediaSrc("blob:abc"), "blob:abc");
  assert.match(mediaSrc("library-of-alexandria/images/a.png"), /library-of-alexandria\/images\/a\.png$/);
});
