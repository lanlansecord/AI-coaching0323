"use client";
import { useState, useRef, useCallback, useEffect } from "react";

/**
 * 实时音量检测 Hook
 * 使用 Web Audio API 的 AnalyserNode 获取麦克风音量
 *
 * 返回：
 * - audioLevel: 0~1 的实时音量值
 * - isSilent: 是否静音（连续低于阈值超过指定时间）
 * - start/stop: 开始/停止采集
 */
export function useAudioLevel(silenceThreshold = 0.03, silenceDurationMs = 800) {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSilent, setIsSilent] = useState(true);
  const [isActive, setIsActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return;

    analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

    // 计算 RMS 音量
    let sumSquares = 0;
    const data = dataArrayRef.current;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);

    // 归一化到 0~1，增强低音量灵敏度
    const level = Math.min(1, rms * 4);
    setAudioLevel(level);

    // VAD 静音检测
    const now = Date.now();
    if (level < silenceThreshold) {
      if (silenceStartRef.current === 0) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current >= silenceDurationMs) {
        setIsSilent(true);
      }
    } else {
      silenceStartRef.current = 0;
      setIsSilent(false);
    }

    rafRef.current = requestAnimationFrame(analyze);
  }, [silenceThreshold, silenceDurationMs]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      source.connect(analyser);
      // 不连接 destination — 不播放自己的声音

      silenceStartRef.current = 0;
      setIsSilent(true);
      setIsActive(true);

      rafRef.current = requestAnimationFrame(analyze);
    } catch (error) {
      console.warn("Failed to start audio level detection:", error);
    }
  }, [analyze]);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    dataArrayRef.current = null;
    setAudioLevel(0);
    setIsSilent(true);
    setIsActive(false);
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { audioLevel, isSilent, isActive, start, stop };
}
