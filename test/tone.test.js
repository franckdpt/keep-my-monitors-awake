import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function readWave(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");

  let format;
  let audio;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;

    if (id === "fmt ") {
      format = {
        encoding: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      audio = buffer.subarray(start, start + size);
    }

    offset = start + size + (size % 2);
  }

  assert.ok(format, "tone.wav must contain a format chunk");
  assert.ok(audio, "tone.wav must contain an audio chunk");
  return { audio, format };
}

test("the wake signal is short, balanced, smooth, and in the audible passband", async () => {
  const buffer = await readFile(new URL("../tone.wav", import.meta.url));
  const { audio, format } = readWave(buffer);

  assert.deepEqual(format, {
    encoding: 3,
    channels: 2,
    sampleRate: 48_000,
    blockAlign: 8,
    bitsPerSample: 32,
  });

  const frameCount = audio.length / format.blockAlign;
  assert.equal(frameCount / format.sampleRate, 2);

  const peaks = [0, 0];
  let maxChannelDifference = 0;
  let zeroCrossings = 0;
  let previousSample = null;
  const measurementStart = format.sampleRate / 2;
  const measurementEnd = measurementStart + format.sampleRate;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const left = audio.readFloatLE(frame * format.blockAlign);
    const right = audio.readFloatLE(frame * format.blockAlign + 4);
    peaks[0] = Math.max(peaks[0], Math.abs(left));
    peaks[1] = Math.max(peaks[1], Math.abs(right));
    maxChannelDifference = Math.max(
      maxChannelDifference,
      Math.abs(left - right),
    );

    if (frame >= measurementStart && frame < measurementEnd) {
      if (previousSample !== null && Math.sign(left) !== Math.sign(previousSample)) {
        zeroCrossings += 1;
      }
      previousSample = left;
    }
  }

  const estimatedFrequency = zeroCrossings / 2;
  assert.ok(peaks.every((peak) => peak >= 0.199 && peak <= 0.201));
  assert.ok(maxChannelDifference < 1e-7);
  assert.ok(Math.abs(estimatedFrequency - 45) < 0.5);
  assert.ok(Math.abs(audio.readFloatLE(0)) < 1e-7);
  assert.ok(Math.abs(audio.readFloatLE(audio.length - 8)) < 1e-4);
});
