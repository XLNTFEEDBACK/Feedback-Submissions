import {
  getDropboxPlaybackUrl,
  getFileExtension,
  parseTrackLink,
  type TrackProvider,
} from "./track-links";

export class TrackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackValidationError";
  }
}

export interface ValidatedTrack {
  trackUrl: string;
  provider: TrackProvider;
  trackTitle: string | null;
}

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/x-aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/x-mpeg",
  "audio/ogg",
  "application/ogg",
  "audio/vnd.wave",
  "audio/wav",
  "audio/wave",
  "audio/x-flac",
  "audio/x-m4a",
  "audio/x-wav",
]);

const isAllowedDropboxResponseHost = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "dropbox.com" ||
    normalized.endsWith(".dropbox.com") ||
    normalized === "dropboxusercontent.com" ||
    normalized.endsWith(".dropboxusercontent.com")
  );
};

const validateDropboxAvailability = async (
  trackUrl: string,
  fetchImpl: typeof fetch,
) => {
  const playbackUrl = getDropboxPlaybackUrl(trackUrl);
  if (!playbackUrl) {
    throw new TrackValidationError("Invalid Dropbox shared link.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let currentUrl = playbackUrl;

  try {
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      const current = new URL(currentUrl);
      if (!isAllowedDropboxResponseHost(current.hostname)) {
        throw new TrackValidationError("Dropbox returned an unsafe redirect.");
      }

      const response = await fetchImpl(currentUrl, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) {
          throw new TrackValidationError("Dropbox returned an invalid redirect.");
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const contentType =
        response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ??
        "";
      await response.body?.cancel();

      if (!response.ok) {
        throw new TrackValidationError(
          "This Dropbox link is unavailable or requires permission.",
        );
      }

      if (contentType === "text/html" || contentType === "application/xhtml+xml") {
        throw new TrackValidationError(
          "This Dropbox link must be accessible to anyone with the link.",
        );
      }

      const extension = getFileExtension(new URL(trackUrl).pathname);
      const hasSupportedMime = SUPPORTED_AUDIO_MIME_TYPES.has(contentType);
      const hasAudioMime = contentType.startsWith("audio/");
      if (!hasSupportedMime && hasAudioMime) {
        throw new TrackValidationError(
          "This Dropbox audio format is not supported by the queue player.",
        );
      }

      if (!hasSupportedMime && contentType && contentType !== "application/octet-stream") {
        throw new TrackValidationError("The Dropbox link does not point to an audio file.");
      }

      if (!extension) {
        throw new TrackValidationError(
          "The Dropbox audio file needs a supported filename extension.",
        );
      }

      return;
    }

    throw new TrackValidationError("Dropbox redirected too many times.");
  } catch (error) {
    if (error instanceof TrackValidationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new TrackValidationError(
        "Dropbox took too long to respond. Check the link and try again.",
      );
    }
    throw new TrackValidationError(
      "The Dropbox link could not be reached. Check the link and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const validateTrackSubmission = async (
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ValidatedTrack> => {
  const parsed = parseTrackLink(input);
  if (!parsed.valid) {
    throw new TrackValidationError(parsed.message);
  }

  if (parsed.provider === "dropbox") {
    await validateDropboxAvailability(parsed.trackUrl, fetchImpl);
  }

  return {
    trackUrl: parsed.trackUrl,
    provider: parsed.provider,
    trackTitle: parsed.trackTitle,
  };
};
