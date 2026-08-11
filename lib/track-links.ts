export type TrackProvider = "soundcloud" | "dropbox";

export type TrackLinkResult =
  | {
      valid: true;
      provider: TrackProvider;
      trackUrl: string;
      trackTitle: string | null;
    }
  | {
      valid: false;
      message: string;
    };

const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
  "on.soundcloud.com",
]);

const DROPBOX_SHARE_HOSTS = new Set(["dropbox.com", "www.dropbox.com"]);

export const SUPPORTED_DROPBOX_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "flac",
]);

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const formatName = (value: string) =>
  safeDecode(value)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const pathnameSegments = (url: URL) =>
  url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

export const getFileExtension = (pathname: string) => {
  const filename = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const decodedFilename = safeDecode(filename);
  const extension = decodedFilename.includes(".")
    ? decodedFilename.split(".").at(-1)?.toLowerCase() ?? ""
    : "";
  return extension;
};

const getDropboxTitle = (url: URL) => {
  const filename = pathnameSegments(url).at(-1);
  if (!filename) return null;

  const decodedFilename = safeDecode(filename);
  const extension = getFileExtension(url.pathname);
  const title = extension
    ? decodedFilename.slice(0, -(extension.length + 1))
    : decodedFilename;

  return title.trim() || null;
};

export const getTrackDisplay = (
  trackUrl: string,
  provider?: TrackProvider | null,
) => {
  const parsed = parseTrackLink(trackUrl);
  const resolvedProvider = provider ?? (parsed.valid ? parsed.provider : null);

  try {
    const url = new URL(trackUrl);

    if (resolvedProvider === "dropbox") {
      const title = getDropboxTitle(url);
      return {
        artist: null,
        track: title,
        display: title ?? trackUrl,
      };
    }

    const segments = pathnameSegments(url).filter(
      (segment) => !segment.startsWith("s-"),
    );

    if (segments.length >= 2) {
      const artist = formatName(segments.at(-2) ?? "");
      const track = formatName(segments.at(-1) ?? "");
      return { artist, track, display: `${artist} – ${track}` };
    }

    if (segments.length === 1) {
      const track = formatName(segments[0]);
      return { artist: null, track, display: track };
    }
  } catch {
    // Return the original URL below.
  }

  return { artist: null, track: null, display: trackUrl };
};

export const parseTrackLink = (input: string): TrackLinkResult => {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, message: "Enter a SoundCloud or Dropbox link." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { valid: false, message: "Enter a valid URL." };
  }

  if (url.protocol !== "https:") {
    return { valid: false, message: "Track links must use HTTPS." };
  }

  const hostname = url.hostname.toLowerCase();
  const segments = pathnameSegments(url);

  if (SOUNDCLOUD_HOSTS.has(hostname)) {
    if (segments.length === 0) {
      return { valid: false, message: "Enter a SoundCloud track link." };
    }

    const secretIndex = segments.findIndex((segment) => segment.startsWith("s-"));
    if (secretIndex !== -1 && (segments.length < 3 || secretIndex !== segments.length - 1)) {
      return {
        valid: false,
        message: "Use the complete private share link from SoundCloud.",
      };
    }

    url.hash = "";
    return {
      valid: true,
      provider: "soundcloud",
      trackUrl: url.toString(),
      trackTitle: getTrackDisplayWithoutParsing(url, "soundcloud"),
    };
  }

  if (DROPBOX_SHARE_HOSTS.has(hostname)) {
    const isModernFileLink =
      segments[0] === "scl" && segments[1] === "fi" && segments.length >= 4;
    const isLegacyFileLink = segments[0] === "s" && segments.length >= 3;

    if (segments[0] === "scl" && segments[1] === "fo") {
      return {
        valid: false,
        message: "Dropbox folders are not supported. Share one audio file instead.",
      };
    }

    if (!isModernFileLink && !isLegacyFileLink) {
      return {
        valid: false,
        message: "Use a Dropbox shared link for a single file.",
      };
    }

    const extension = getFileExtension(url.pathname);
    if (!SUPPORTED_DROPBOX_EXTENSIONS.has(extension)) {
      return {
        valid: false,
        message: "Dropbox files must be MP3, WAV, M4A, AAC, OGG, or FLAC audio.",
      };
    }

    url.hash = "";
    return {
      valid: true,
      provider: "dropbox",
      trackUrl: url.toString(),
      trackTitle: getDropboxTitle(url),
    };
  }

  return {
    valid: false,
    message: "Only SoundCloud and Dropbox shared links are supported.",
  };
};

const getTrackDisplayWithoutParsing = (
  url: URL,
  provider: TrackProvider,
) => {
  if (provider === "dropbox") return getDropboxTitle(url);

  const segments = pathnameSegments(url).filter(
    (segment) => !segment.startsWith("s-"),
  );
  if (segments.length >= 2) {
    const artist = formatName(segments.at(-2) ?? "");
    const track = formatName(segments.at(-1) ?? "");
    return `${artist} – ${track}`;
  }
  return segments.length === 1 ? formatName(segments[0]) : null;
};

export const getDropboxPlaybackUrl = (trackUrl: string) => {
  const parsed = parseTrackLink(trackUrl);
  if (!parsed.valid || parsed.provider !== "dropbox") return null;

  const url = new URL(parsed.trackUrl);
  url.searchParams.delete("dl");
  url.searchParams.set("raw", "1");
  return url.toString();
};

export const inferTrackProvider = (
  trackUrl: string,
  storedProvider?: unknown,
): TrackProvider => {
  if (storedProvider === "dropbox" || storedProvider === "soundcloud") {
    return storedProvider;
  }

  const parsed = parseTrackLink(trackUrl);
  return parsed.valid ? parsed.provider : "soundcloud";
};

export const isPrivateSoundCloudTrack = (trackUrl: string) => {
  try {
    return new URL(trackUrl).pathname.includes("/s-");
  } catch {
    return false;
  }
};

export const isShortenedSoundCloudLink = (trackUrl: string) => {
  try {
    return new URL(trackUrl).hostname.toLowerCase() === "on.soundcloud.com";
  } catch {
    return false;
  }
};
