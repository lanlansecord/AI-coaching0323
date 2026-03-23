import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket, { type RawData } from "ws";

const VOLC_ASR_URL = "wss://openspeech.bytedance.com/api/v2/asr";

const PROTOCOL_VERSION = 0x1;
const HEADER_SIZE = 0x1;
const MESSAGE_TYPE_FULL_CLIENT_REQUEST = 0x1;
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST = 0x2;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE = 0x9;
const MESSAGE_TYPE_SERVER_ERROR = 0xf;
const MESSAGE_FLAG_NONE = 0x0;
const MESSAGE_FLAG_LAST_AUDIO = 0x2;
const SERIALIZATION_NONE = 0x0;
const SERIALIZATION_JSON = 0x1;
const COMPRESSION_GZIP = 0x1;

const WAV_SAMPLE_RATE = 16000;
const WAV_CHANNELS = 1;
const WAV_BITS = 16;
const WAV_CHUNK_BYTES = 6400;

export interface VolcAsrResult {
  text: string;
  code: number;
  message: string;
  sequence: number;
  durationMs?: number;
  logId?: string;
}

interface TranscribeVolcAsrOptions {
  audioBuffer: Buffer;
  uid?: string;
}

interface VolcAsrResponsePayload {
  code?: number;
  message?: string;
  sequence?: number;
  result?: Array<{
    text?: string;
  }>;
  addition?: {
    duration?: string;
    logid?: string;
  };
}

function buildHeader(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number
) {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE,
    (messageType << 4) | messageFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

function buildFrame(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
  payload: Buffer
) {
  const header = buildHeader(messageType, messageFlags, serialization, compression);
  const payloadSize = Buffer.alloc(4);
  payloadSize.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payloadSize, payload]);
}

function parseResponseFrame(buffer: Buffer) {
  const headerBytes = (buffer[0] & 0x0f) * 4;
  const messageType = buffer[1] >> 4;
  const serialization = buffer[2] >> 4;
  const compression = buffer[2] & 0x0f;

  if (messageType === MESSAGE_TYPE_SERVER_ERROR) {
    const errorCode = buffer.readUInt32BE(headerBytes);
    const errorMessageSize = buffer.readUInt32BE(headerBytes + 4);
    let errorPayload = buffer.subarray(headerBytes + 8, headerBytes + 8 + errorMessageSize);

    if (compression === COMPRESSION_GZIP) {
      errorPayload = gunzipSync(errorPayload);
    }

    const errorMessage = errorPayload.toString("utf8");
    throw new Error(`Volc ASR protocol error ${errorCode}: ${errorMessage}`);
  }

  if (messageType !== MESSAGE_TYPE_FULL_SERVER_RESPONSE) {
    return null;
  }

  const payloadSize = buffer.readUInt32BE(headerBytes);
  const payloadStart = headerBytes + 4;
  const payloadEnd = payloadStart + payloadSize;
  let payload = buffer.subarray(payloadStart, payloadEnd);

  if (compression === COMPRESSION_GZIP) {
    payload = gunzipSync(payload);
  }

  if (serialization !== SERIALIZATION_JSON) {
    return null;
  }

  return JSON.parse(payload.toString("utf8")) as VolcAsrResponsePayload;
}

function buildInitialRequestPayload(uid: string) {
  const appId = process.env.VOLC_ASR_APP_ID?.trim();
  const accessToken = process.env.VOLC_ASR_ACCESS_TOKEN?.trim();
  const cluster = process.env.VOLC_ASR_CLUSTER?.trim();

  if (!appId || !accessToken || !cluster) {
    throw new Error("VOLC_ASR_* is not configured");
  }

  return {
    app: {
      appid: appId,
      token: accessToken,
      cluster,
    },
    user: {
      uid,
    },
    audio: {
      format: "wav",
      rate: WAV_SAMPLE_RATE,
      bits: WAV_BITS,
      channel: WAV_CHANNELS,
      language: "zh-CN",
    },
    request: {
      reqid: crypto.randomUUID(),
      sequence: 1,
      nbest: 1,
      workflow: "audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate",
      show_utterances: false,
      vad_signal: true,
      start_silence_time: 5000,
      vad_silence_time: 800,
    },
  };
}

export async function transcribeVolcAsr({
  audioBuffer,
  uid = "xiaojingzi-web",
}: TranscribeVolcAsrOptions): Promise<VolcAsrResult> {
  const accessToken = process.env.VOLC_ASR_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new Error("VOLC_ASR_ACCESS_TOKEN is not configured");
  }

  const initialPayload = gzipSync(
    Buffer.from(JSON.stringify(buildInitialRequestPayload(uid)), "utf8")
  );

  return await new Promise<VolcAsrResult>((resolve, reject) => {
    let settled = false;
    let finalPayload: VolcAsrResponsePayload | null = null;

    const ws = new WebSocket(VOLC_ASR_URL, {
      headers: {
        Authorization: `Bearer; ${accessToken}`,
      },
      handshakeTimeout: 15000,
    });

    const finish = (result: VolcAsrResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
      ws.close();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
      ws.close();
    };

    ws.on("open", () => {
      ws.send(
        buildFrame(
          MESSAGE_TYPE_FULL_CLIENT_REQUEST,
          MESSAGE_FLAG_NONE,
          SERIALIZATION_JSON,
          COMPRESSION_GZIP,
          initialPayload
        )
      );

      for (let offset = 0; offset < audioBuffer.length; offset += WAV_CHUNK_BYTES) {
        const chunk = audioBuffer.subarray(offset, offset + WAV_CHUNK_BYTES);
        const isLastChunk = offset + WAV_CHUNK_BYTES >= audioBuffer.length;
        ws.send(
          buildFrame(
            MESSAGE_TYPE_AUDIO_ONLY_REQUEST,
            isLastChunk ? MESSAGE_FLAG_LAST_AUDIO : MESSAGE_FLAG_NONE,
            SERIALIZATION_NONE,
            COMPRESSION_GZIP,
            gzipSync(chunk)
          )
        );
      }
    });

    ws.on("message", (rawData: RawData) => {
      try {
        const payload = parseResponseFrame(
          Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as ArrayBuffer)
        );
        if (!payload) return;

        if (typeof payload.code === "number" && payload.code !== 1000) {
          if (payload.code === 1013) {
            finish({
              text: "",
              code: payload.code,
              message: payload.message || "Audio silence",
              sequence: payload.sequence ?? 0,
              durationMs: payload.addition?.duration
                ? Number(payload.addition.duration)
                : undefined,
              logId: payload.addition?.logid,
            });
            return;
          }

          fail(new Error(`Volc ASR failed ${payload.code}: ${payload.message || "Unknown error"}`));
          return;
        }

        finalPayload = payload;
        if ((payload.sequence ?? 0) < 0) {
          finish({
            text: payload.result?.[0]?.text?.trim() || "",
            code: payload.code ?? 1000,
            message: payload.message || "Success",
            sequence: payload.sequence ?? 0,
            durationMs: payload.addition?.duration
              ? Number(payload.addition.duration)
              : undefined,
            logId: payload.addition?.logid,
          });
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });

    ws.on("error", (error: Error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });

    ws.on("close", () => {
      if (settled) return;
      if (finalPayload) {
        finish({
          text: finalPayload.result?.[0]?.text?.trim() || "",
          code: finalPayload.code ?? 1000,
          message: finalPayload.message || "Success",
          sequence: finalPayload.sequence ?? 0,
          durationMs: finalPayload.addition?.duration
            ? Number(finalPayload.addition.duration)
            : undefined,
          logId: finalPayload.addition?.logid,
        });
        return;
      }

      fail(new Error("Volc ASR socket closed before final result"));
    });
  });
}
