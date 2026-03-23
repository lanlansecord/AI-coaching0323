"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RecordedAudio {
  blob: Blob;
  file: File;
  durationMs: number;
  mimeType: string;
}

function pickMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);

  const cleanupStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;

    if (!stream) return;

    for (const track of stream.getTracks()) {
      track.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupStream();
      mediaRecorderRef.current = null;
    };
  }, [cleanupStream]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError("当前浏览器不支持语音录制");
      return false;
    }

    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("语音录制失败，请再试一次");
      };

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);
      return true;
    } catch {
      cleanupStream();
      setError("没有拿到麦克风权限");
      return false;
    }
  }, [cleanupStream, isRecording]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      cleanupStream();
      return null;
    }

    return await new Promise<RecordedAudio | null>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: mimeType })
          : null;
        const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;

        mediaRecorderRef.current = null;
        startedAtRef.current = null;
        chunksRef.current = [];
        setIsRecording(false);
        cleanupStream();

        if (!blob || blob.size === 0) {
          resolve(null);
          return;
        }

        const extension = extensionForMimeType(mimeType);
        const file = new File([blob], `voice-message.${extension}`, {
          type: mimeType,
          lastModified: Date.now(),
        });

        resolve({
          blob,
          file,
          durationMs,
          mimeType,
        });
      };

      try {
        recorder.requestData();
      } catch {
        // Ignore unsupported requestData calls.
      }

      recorder.stop();
    });
  }, [cleanupStream]);

  return {
    isRecording,
    error,
    setError,
    startRecording,
    stopRecording,
  };
}
