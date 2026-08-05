import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  assertOutputsAvailable,
  loadVideoContext,
  parseTargetArgs,
} from "./video-context.mjs";

const sampleRate = 48000;
const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const {audioDirs} = loadVideoContext(videoId);
const outputDir = audioDirs.sfx;
const outputFiles = ["click.wav", "ding.wav", "whoosh.wav"].map((fileName) =>
  resolve(outputDir, fileName),
);

assertOutputsAvailable(outputFiles, {
  force,
  action: `Sound-effect generation for ${videoId}`,
});

mkdirSync(outputDir, {recursive: true});

/**
 * @param {string} fileName
 * @param {number[]} samples
 * @returns {void}
 */
const writeWave = (fileName, samples) => {
  const pcm = Buffer.alloc(samples.length * 2);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    pcm.writeInt16LE(Math.round(sample * 32767), index * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  writeFileSync(resolve(outputDir, fileName), Buffer.concat([header, pcm]));
};

/** @typedef {(time: number, index: number, length: number) => number} WaveGenerator */

/**
 * @param {number} durationSeconds
 * @param {WaveGenerator} generator
 * @returns {number[]}
 */
const render = (durationSeconds, generator) => {
  const length = Math.ceil(durationSeconds * sampleRate);
  return Array.from({length}, (_, index) =>
    generator(index / sampleRate, index, length),
  );
};

writeWave(
  "click.wav",
  render(0.12, (time, index, length) => {
    const envelope = Math.exp(-time * 38) * (1 - index / length);
    const tone = Math.sin(2 * Math.PI * 1250 * time);
    const transient = index % 7 === 0 ? 0.34 : -0.12;
    return (tone * 0.55 + transient) * envelope;
  }),
);

writeWave(
  "ding.wav",
  render(0.72, (time) => {
    const envelope = Math.exp(-time * 4.8);
    return (
      Math.sin(2 * Math.PI * 880 * time) * 0.45 * envelope +
      Math.sin(2 * Math.PI * 1320 * time) * 0.18 * envelope
    );
  }),
);

let seed = 48271;
/** @returns {number} */
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

writeWave(
  "whoosh.wav",
  render(0.58, (time, index, length) => {
    const progress = index / length;
    const envelope = Math.sin(Math.PI * progress) ** 1.8;
    const noise = random() * 2 - 1;
    const tone = Math.sin(
      2 * Math.PI * (180 + progress * 520) * time,
    );
    return (noise * 0.24 + tone * 0.16) * envelope;
  }),
);

console.log(`Generated UI sound effects for ${videoId} in ${outputDir}`);
