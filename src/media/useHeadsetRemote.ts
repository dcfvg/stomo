import { useCallback, useEffect, useRef, useState } from "react";

export type HeadsetRemoteStatus =
  | "unsupported"
  | "connecting"
  | "ready"
  | "blocked";

function createQuietAudioUrl() {
  const sampleRate = 8_000;
  const samples = sampleRate;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export function useHeadsetRemote(onTrigger: () => void, active: boolean) {
  const [status, setStatus] = useState<HeadsetRemoteStatus>(() =>
    "mediaSession" in navigator ? "connecting" : "unsupported",
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const triggerRef = useRef(onTrigger);
  const activeRef = useRef(active);
  const lastPressAt = useRef(0);

  useEffect(() => {
    triggerRef.current = onTrigger;
    activeRef.current = active;
  }, [active, onTrigger]);

  const connect = useCallback(async () => {
    if (!("mediaSession" in navigator)) {
      setStatus("unsupported");
      return false;
    }
    setStatus("connecting");
    if (!audioRef.current) {
      audioUrlRef.current = createQuietAudioUrl();
      const audio = new Audio(audioUrlRef.current);
      audio.loop = true;
      audio.volume = 0.01;
      audioRef.current = audio;
    }
    try {
      await audioRef.current.play();
      navigator.mediaSession.playbackState = "playing";
      setStatus("ready");
      return true;
    } catch {
      setStatus("blocked");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }
    const fire = () => {
      const now = Date.now();
      if (!activeRef.current || now - lastPressAt.current < 450) return;
      lastPressAt.current = now;
      triggerRef.current();
      void connect();
    };
    navigator.mediaSession.metadata =
      typeof MediaMetadata === "function"
        ? new MediaMetadata({
            title: "Prendre une photo",
            artist: "Télécommande Stomo",
            album: "Bouton du casque",
          })
        : null;
    navigator.mediaSession.setActionHandler("play", fire);
    navigator.mediaSession.setActionHandler("pause", fire);
    const connectionTimer = window.setTimeout(() => void connect(), 0);
    return () => {
      window.clearTimeout(connectionTimer);
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    };
  }, [connect]);

  return { status, reconnect: connect };
}
