// Raw voice audio (16-bit little-endian PCM, the Gemini voice models' sound)
// to a WAV file a browser plays, and a WAV file back to its PCM. No server
// code and no network, so the tests check the header byte by byte.

export type Pcm = { pcm: Uint8Array; sampleRate: number; channels: number };

/** A 44-byte RIFF/WAVE header followed by the samples. */
export function wavFromPcm(pcm: Uint8Array, sampleRate = 24_000, channels = 1, bitsPerSample = 16): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  const blockAlign = (channels * bitsPerSample) / 8;
  ascii(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true); // size of the fmt chunk
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true); // bytes a second
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

const tag = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** Whether these bytes are a WAV file. */
export const isWav = (b: Uint8Array) => b.byteLength >= 12 && tag(b, 0) === "RIFF" && tag(b, 8) === "WAVE";

/** The PCM inside a 16-bit WAV file, or null when it is not one. */
export function pcmOfWav(b: Uint8Array): Pcm | null {
  if (!isWav(b)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 12, sampleRate = 24_000, channels = 1, bits = 16;
  while (at + 8 <= b.byteLength) {
    const id = tag(b, at), size = v.getUint32(at + 4, true);
    if (id === "fmt " && at + 24 <= b.byteLength) {
      channels = v.getUint16(at + 10, true);
      sampleRate = v.getUint32(at + 12, true);
      bits = v.getUint16(at + 22, true);
    } else if (id === "data") {
      if (bits !== 16) return null;
      // A streamed file may say 0 or too much: take what is there.
      const end = size > 0 && at + 8 + size <= b.byteLength ? at + 8 + size : b.byteLength;
      return { pcm: b.slice(at + 8, end), sampleRate, channels };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

/** Seconds of sound in 16-bit PCM. */
export const pcmSeconds = (p: Pcm) => p.pcm.byteLength / (2 * Math.max(1, p.channels) * Math.max(1, p.sampleRate));
