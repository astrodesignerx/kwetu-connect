// Checks an advert file against the KCA screen before it is saved with a booking.
// Runs in the browser only. The screen is 768 x 432 px (16:9) and plays without sound.

export const SCREEN = { width: 768, height: 432, maxBytes: 50 * 1024 * 1024, types: ["video/mp4", "image/png", "image/jpeg"] };

export type CheckId = "file" | "shape" | "length" | "light" | "sound";
export type CheckState = "pending" | "running" | "pass" | "warn" | "fail";
export type CheckResult = { id: CheckId; label: string; state: CheckState; detail: string };
export type Measured = { kind: "image" | "video"; width: number; height: number; duration: number | null; hasSound: boolean | null; brightness: number | null; contrast: number | null };

export const CHECK_LABELS: Record<CheckId, string> = {
  file: "File type and size",
  shape: "Shape and resolution",
  length: "Length matches your booking",
  light: "Brightness and contrast",
  sound: "Sound",
};
export const CHECK_ORDER: CheckId[] = ["file", "shape", "length", "light", "sound"];

const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

export function checkFile(file: { type: string; size: number }): Omit<CheckResult, "id" | "label"> {
  if (!SCREEN.types.includes(file.type)) return { state: "fail", detail: "Use an MP4 video, or a PNG or JPEG still." };
  if (file.size === 0) return { state: "fail", detail: "This file is empty." };
  if (file.size > SCREEN.maxBytes) return { state: "fail", detail: `${size(file.size)}. Adverts must be up to 50 MB.` };
  return { state: "pass", detail: `${file.type === "video/mp4" ? "MP4 video" : file.type === "image/png" ? "PNG still" : "JPEG still"}, ${size(file.size)}.` };
}

export function checkShape(width: number, height: number): Omit<CheckResult, "id" | "label"> {
  const ratio = width / height;
  const off = Math.abs(ratio / (16 / 9) - 1);
  const size = `${width} x ${height} px`;
  if (off > 0.06) return { state: "fail", detail: `${size} is not 16:9. Resize it to 1920 x 1080 or 768 x 432.` };
  if (width < SCREEN.width || height < SCREEN.height) return { state: "warn", detail: `${size} is smaller than the screen (768 x 432), so it may look soft.` };
  if (off > 0.02) return { state: "warn", detail: `${size} is close to 16:9; the edges will be trimmed slightly.` };
  if (width > 3840) return { state: "warn", detail: `${size} is far bigger than needed. 1920 x 1080 uploads faster.` };
  return { state: "pass", detail: `${size}, 16:9.` };
}

export function checkLength(kind: Measured["kind"], duration: number | null, bookedSeconds: number): Omit<CheckResult, "id" | "label"> {
  if (kind === "image" || duration === null) return { state: "pass", detail: `Still image, shown for ${bookedSeconds} seconds each play.` };
  const seconds = Math.round(duration * 10) / 10;
  if (Math.abs(duration - bookedSeconds) <= 0.5) return { state: "pass", detail: `${seconds} s, matches your ${bookedSeconds} s plays.` };
  return { state: "fail", detail: `${seconds} s long, but you booked ${bookedSeconds} s plays. Trim it or change the advert length.` };
}

export function checkLight(brightness: number | null, contrast: number | null): Omit<CheckResult, "id" | "label"> {
  if (brightness === null || contrast === null) return { state: "warn", detail: "We could not read the picture. KCA will check it by eye." };
  if (brightness < 0.12) return { state: "warn", detail: "Very dark. It may be hard to see in daylight." };
  if (brightness > 0.88) return { state: "warn", detail: "Very bright and pale. Colours may wash out on the LED screen." };
  if (contrast < 0.1) return { state: "warn", detail: "Low contrast. Text may be hard to read from the road." };
  return { state: "pass", detail: "Good brightness and contrast for the road." };
}

export function checkSound(kind: Measured["kind"], hasSound: boolean | null): Omit<CheckResult, "id" | "label"> {
  if (kind === "image" || hasSound === false) return { state: "pass", detail: "No sound needed. The screen plays silently." };
  if (hasSound === null) return { state: "pass", detail: "The screen plays silently, so make sure the message works without sound." };
  return { state: "warn", detail: "Has sound, but the screen plays silently. Make sure the message works without it." };
}

/** Runs one check by id against measured values. */
export function runCheck(id: CheckId, file: File, m: Measured | null, bookedSeconds: number): CheckResult {
  const label = CHECK_LABELS[id];
  if (id === "file") return { id, label, ...checkFile(file) };
  if (!m) return { id, label, state: "fail", detail: "We could not open this file." };
  if (id === "shape") return { id, label, ...checkShape(m.width, m.height) };
  if (id === "length") return { id, label, ...checkLength(m.kind, m.duration, bookedSeconds) };
  if (id === "light") return { id, label, ...checkLight(m.brightness, m.contrast) };
  return { id, label, ...checkSound(m.kind, m.hasSound) };
}

/** Mean light (0 to 1) and its spread, from small frames. */
export function lightOf(frames: ImageData[]): { brightness: number; contrast: number } | null {
  let sum = 0; let squares = 0; let count = 0;
  for (const frame of frames) {
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      sum += y; squares += y * y; count += 1;
    }
  }
  if (count === 0) return null;
  const brightness = sum / count;
  return { brightness, contrast: Math.sqrt(Math.max(0, squares / count - brightness * brightness)) };
}

/** True when an MP4 has a sound track: looks for an "hdlr" box whose handler is "soun". */
export function mp4HasSound(bytes: Uint8Array): boolean {
  for (let i = 4; i + 16 < bytes.length; i++) {
    if (bytes[i] === 0x68 && bytes[i + 1] === 0x64 && bytes[i + 2] === 0x6c && bytes[i + 3] === 0x72 &&
      bytes[i + 12] === 0x73 && bytes[i + 13] === 0x6f && bytes[i + 14] === 0x75 && bytes[i + 15] === 0x6e) return true;
  }
  return false;
}

function frameData(source: CanvasImageSource): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = 96; canvas.height = 54;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function once(target: EventTarget, ok: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("error")); };
    const cleanup = () => { window.clearTimeout(timer); target.removeEventListener(ok, done); target.removeEventListener("error", fail); };
    target.addEventListener(ok, done); target.addEventListener("error", fail);
  });
}

/** Opens the file and measures it. Returns null when the browser cannot read it. */
export async function measure(file: File, url: string): Promise<Measured | null> {
  try {
    if (file.type.startsWith("image/")) {
      const image = new Image();
      image.src = url;
      await image.decode();
      const light = lightOf([frameData(image)].filter((f): f is ImageData => f !== null));
      return { kind: "image", width: image.naturalWidth, height: image.naturalHeight, duration: null, hasSound: null, brightness: light?.brightness ?? null, contrast: light?.contrast ?? null };
    }
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.playsInline = true; video.src = url;
    await once(video, "loadeddata");
    const frames: ImageData[] = [];
    for (const at of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      video.currentTime = Math.min(video.duration * at, Math.max(0, video.duration - 0.05));
      try { await once(video, "seeked", 3000); } catch { continue; }
      const frame = frameData(video);
      if (frame) frames.push(frame);
    }
    const light = lightOf(frames);
    let hasSound: boolean | null = null;
    try { hasSound = mp4HasSound(new Uint8Array(await file.arrayBuffer())); } catch { hasSound = null; }
    const result: Measured = { kind: "video", width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : null, hasSound, brightness: light?.brightness ?? null, contrast: light?.contrast ?? null };
    video.removeAttribute("src"); video.load();
    return result.width > 0 ? result : null;
  } catch {
    return null;
  }
}
