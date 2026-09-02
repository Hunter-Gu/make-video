import {log} from "@make-video/project";
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {assertOutputAvailable, loadAudioContext} from "./context";

const sampleRate = 48000;
const writeWave = (file: string, samples: number[]) => {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), index * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  writeFileSync(file, Buffer.concat([header, pcm]));
};
const render = (seconds: number, generator: (time: number, index: number, length: number) => number): number[] => {
  const length = Math.ceil(seconds * sampleRate);
  return Array.from({length}, (_, index) => generator(index / sampleRate, index, length));
};

export const generateSfx = (videoId: string, force: boolean) => {
  const context = loadAudioContext(videoId);
  const outputDir = context.audioDirs.sfx;
  const files = ["click.wav", "ding.wav", "whoosh.wav"].map((name) => resolve(outputDir, name));
  assertOutputAvailable(files, force, `Sound-effect generation for ${videoId}`);
  mkdirSync(outputDir, {recursive: true});
  writeWave(files[0], render(.12, (time, index, length) => (Math.sin(2 * Math.PI * 1250 * time) * .55 + (index % 7 === 0 ? .34 : -.12)) * Math.exp(-time * 38) * (1 - index / length)));
  writeWave(files[1], render(.72, (time) => (Math.sin(2 * Math.PI * 880 * time) * .45 + Math.sin(2 * Math.PI * 1320 * time) * .18) * Math.exp(-time * 4.8)));
  let seed = 48271;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  writeWave(files[2], render(.58, (time, index, length) => { const progress = index / length; return (random() * .24 + Math.sin(2 * Math.PI * (180 + progress * 520) * time) * .16) * Math.sin(Math.PI * progress) ** 1.8; }));
  log(`Generated UI sound effects for ${videoId} in ${outputDir}`);
};
