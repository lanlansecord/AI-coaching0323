"use client";

import { useCallback, useRef, useState } from "react";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface WavRecordingResult {
  blob: Blob | null;
  audioUrl: string | null;
  durationMs: number;
}

const OUTPUT_SAMPLE_RATE = 16000;

function mergeBuffers(buffers: Float32Array[]) {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const buffer of buffers) {
    merged.set(buffer, offset);
    offset += buffer.length;
  }

  return merged;
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number) {
  if (inputSampleRate === OUTPUT_SAMPLE_RATE) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / OUTPUT_SAMPLE_RATE;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

export function useWavRecorder() {
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const buffersRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef(0);
  const inputSampleRateRef = useRef(OUTPUT_SAMPLE_RATE);
  const isRecordingRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    (!!window.AudioContext || !!window.webkitAudioContext);

  const cleanup = useCallback(() => {
    isRecordingRef.current = false;

    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    gainNodeRef.current?.disconnect();

    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    gainNodeRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!isSupported || isRecordingRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: true,
      },
    });

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const gain = audioContext.createGain();
    gain.gain.value = 0;

    buffersRef.current = [];
    setAudioLevel(0);
    startedAtRef.current = Date.now();
    inputSampleRateRef.current = audioContext.sampleRate;
    isRecordingRef.current = true;

    processor.onaudioprocess = (event) => {
      if (!isRecordingRef.current) return;
      const input = event.inputBuffer.getChannelData(0);
      buffersRef.current.push(new Float32Array(input));

      let sumSquares = 0;
      for (let i = 0; i < input.length; i += 1) {
        sumSquares += input[i] * input[i];
      }
      const rms = Math.sqrt(sumSquares / input.length);
      const level = Math.min(1, rms * 4);
      setAudioLevel((previous) => previous * 0.45 + level * 0.55);
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    sourceNodeRef.current = source;
    processorNodeRef.current = processor;
    gainNodeRef.current = gain;
  }, [isSupported]);

  const stop = useCallback(async (): Promise<WavRecordingResult> => {
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;

    if (!isRecordingRef.current) {
      setAudioLevel(0);
      cleanup();
      return {
        blob: null,
        audioUrl: null,
        durationMs,
      };
    }

    isRecordingRef.current = false;
    const merged = mergeBuffers(buffersRef.current);
    const downsampled = downsampleBuffer(merged, inputSampleRateRef.current);
    const wavBuffer = encodeWav(downsampled, OUTPUT_SAMPLE_RATE);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);

    buffersRef.current = [];
    cleanup();
    setAudioLevel(0);

    return {
      blob,
      audioUrl,
      durationMs,
    };
  }, [cleanup]);

  return {
    isSupported,
    audioLevel,
    start,
    stop,
    cleanup,
  };
}
