/**
 * Helpers for browser microphone/camera permissions.
 *
 * Browsers never let a web page silently grant these permissions: the user must
 * approve a prompt. These helpers request that prompt, report the current
 * permission state, and turn the common errors into useful instructions.
 */

export type MediaKind = 'microphone' | 'camera';
export type MediaAccessKind = MediaKind | 'both';
export type MediaPermissionView =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unknown'
  | 'insecure'
  | 'unsupported';

export interface MediaAccessResult {
  ok: boolean;
  message: string;
  stream?: MediaStream;
  error?: unknown;
}

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

const labelFor = (kind: MediaAccessKind) => {
  if (kind === 'microphone') return 'Microphone';
  if (kind === 'camera') return 'Camera';
  return 'Microphone and camera';
};

const queryPermission = async (kind: MediaKind): Promise<PermissionStatus | null> => {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
  try {
    return await navigator.permissions.query({ name: kind as PermissionName });
  } catch {
    return null;
  }
};

export const mediaApiAvailable = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

export const mediaSecureContext = () =>
  typeof window === 'undefined' || window.isSecureContext !== false;

export const getMediaEnvironmentNote = () => {
  if (!mediaSecureContext()) {
    return 'Media access needs a secure connection. Use HTTPS or localhost.';
  }
  if (!mediaApiAvailable()) {
    return 'This browser does not expose microphone or camera access.';
  }
  return '';
};

export const getMediaPermissionState = async (kind: MediaKind): Promise<MediaPermissionView> => {
  if (!mediaSecureContext()) return 'insecure';
  if (!mediaApiAvailable()) return 'unsupported';
  const status = await queryPermission(kind);
  return status ? (status.state as MediaPermissionView) : 'unknown';
};

/** Watch for changes made from the browser's site-permission controls. */
export const watchMediaPermission = (kind: MediaKind, callback: () => void) => {
  let disposed = false;
  let status: PermissionStatus | null = null;
  const onChange = () => {
    if (!disposed) callback();
  };

  void queryPermission(kind).then((next) => {
    if (disposed || !next) return;
    status = next;
    if (typeof next.addEventListener === 'function') {
      next.addEventListener('change', onChange);
    } else {
      next.onchange = onChange;
    }
  });

  return () => {
    disposed = true;
    if (!status) return;
    if (typeof status.removeEventListener === 'function') {
      status.removeEventListener('change', onChange);
    } else {
      status.onchange = null;
    }
  };
};

export const describeMediaError = (error: unknown, kind: MediaAccessKind) => {
  const name = (error as DOMException | undefined)?.name || '';
  const subject = labelFor(kind).toLowerCase();

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return `${labelFor(kind)} access is blocked. Click the site icon in your browser’s address bar, allow ${subject}, then try again.`;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return kind === 'camera'
        ? 'No camera was found. Connect one and try again.'
        : kind === 'microphone'
          ? 'No microphone was found. Connect one and try again.'
          : 'No microphone or camera was found. Connect a device and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return `${labelFor(kind)} is busy. Close other apps that are using it, then try again.`;
    case 'OverconstrainedError':
      return `${labelFor(kind)} cannot meet the requested settings. Try again with another device.`;
    case 'AbortError':
      return 'The permission request was cancelled. Try again.';
    default: {
      const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
      return `Could not access ${subject}.${detail} Try again or check your browser settings.`;
    }
  }
};

/** Request the browser prompt and return the stream so callers can stop tracks. */
export const requestMediaAccess = async (kind: MediaAccessKind): Promise<MediaAccessResult> => {
  if (!mediaSecureContext()) {
    return { ok: false, message: getMediaEnvironmentNote() };
  }
  if (!mediaApiAvailable()) {
    return { ok: false, message: getMediaEnvironmentNote() };
  }

  const constraints: MediaStreamConstraints = kind === 'camera'
    ? { audio: false, video: VIDEO_CONSTRAINTS }
    : kind === 'microphone'
      ? { audio: true, video: false }
      : { audio: true, video: VIDEO_CONSTRAINTS };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return {
      ok: true,
      stream,
      message: kind === 'both'
        ? 'Microphone and camera are ready for calls.'
        : `${labelFor(kind)} is ready for calls.`,
    };
  } catch (error) {
    return { ok: false, error, message: describeMediaError(error, kind) };
  }
};

export const stopMediaTracks = (stream?: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop());
};
