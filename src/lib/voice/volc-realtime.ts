import { createHash, createHmac } from "node:crypto";
import { Service } from "@volcengine/openapi";

type JsonObject = Record<string, unknown>;

interface StartVoiceChatResult {
  TaskId?: string;
  [key: string]: unknown;
}

export interface RealtimeEnvStatus {
  ready: boolean;
  missing: string[];
  reason: string | null;
  appId: string | null;
  botUserId: string | null;
  usingExternalTokenProvider: boolean;
  usingSmokeTestToken: boolean;
}

export interface RealtimeSessionConnection {
  appId: string;
  roomId: string;
  userId: string;
  token: string;
  taskId: string;
  botUserId: string;
  subtitlesEnabled: boolean;
}

interface RealtimeIdentity {
  sessionId: string;
  identityId: string;
}

interface InterruptPayload {
  roomId: string;
  taskId: string;
}

class XiaojingziRtcService extends Service {
  readonly StartVoiceChat2024 = this.createAPI<JsonObject, StartVoiceChatResult>(
    "StartVoiceChat",
    {
      method: "POST",
      contentType: "json",
      Version: "2024-12-01",
    }
  );

  readonly UpdateVoiceChat2024 = this.createAPI<JsonObject, JsonObject>(
    "UpdateVoiceChat",
    {
      method: "POST",
      contentType: "json",
      Version: "2024-12-01",
    }
  );

  readonly StopVoiceChat2024 = this.createAPI<JsonObject, JsonObject>(
    "StopVoiceChat",
    {
      method: "POST",
      contentType: "json",
      Version: "2024-12-01",
    }
  );

  readonly StopVoiceChat202406 = this.createAPI<JsonObject, JsonObject>(
    "StopVoiceChat",
    {
      method: "POST",
      contentType: "json",
      Version: "2024-06-01",
    }
  );

  constructor() {
    super({
      serviceName: "rtc",
      host: "rtc.volcengineapi.com",
      region: process.env.VOLC_REGION || "cn-north-1",
      defaultVersion: "2024-12-01",
    });
  }
}

function pickFirst(...values: Array<string | undefined | null>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function sanitizeVoiceId(prefix: string, value: string, maxLength = 48) {
  const safe = value.replace(/[^a-zA-Z0-9_@.-]/g, "_");
  return `${prefix}${safe}`.slice(0, maxLength);
}

function buildNumericRtcUserId(identityId: string) {
  const hash = createHash("sha256").update(identityId).digest("hex");
  const numeric = BigInt(`0x${hash.slice(0, 14)}`);
  const base = BigInt("10000000000");
  const modulo = BigInt("899999999999999");
  return (base + (numeric % modulo)).toString();
}

function getAccessKeyId() {
  return pickFirst(process.env.VOLC_RTC_ACCESS_KEY_ID, process.env.VOLC_ACCESSKEY);
}

function getSecretKey() {
  return pickFirst(process.env.VOLC_RTC_SECRET_ACCESS_KEY, process.env.VOLC_SECRETKEY);
}

function getAppId() {
  return pickFirst(process.env.VOLC_RTC_APP_ID);
}

function getBotUserId() {
  return pickFirst(process.env.VOLC_RTC_BOT_USER_ID);
}

function getAppKey() {
  return pickFirst(process.env.VOLC_RTC_APP_KEY);
}

// --- Local RTC Token generation (ported from volcengine RTC_Token SDK) ---

class RtcBufferWriter {
  private buffer = Buffer.alloc(1024);
  private position = 0;

  pack(): Buffer {
    const out = Buffer.alloc(this.position);
    this.buffer.copy(out, 0, 0, out.length);
    return out;
  }

  putUint16(v: number) {
    this.buffer.writeUInt16LE(v, this.position);
    this.position += 2;
    return this;
  }

  putUint32(v: number) {
    this.buffer.writeUInt32LE(v, this.position);
    this.position += 4;
    return this;
  }

  putBytes(bytes: Buffer) {
    this.putUint16(bytes.length);
    bytes.copy(this.buffer, this.position);
    this.position += bytes.length;
    return this;
  }

  putString(str: string) {
    return this.putBytes(Buffer.from(str));
  }

  putTreeMapUInt32(map: Map<number, number>) {
    this.putUint16(map.size);
    map.forEach((value, key) => {
      this.putUint16(key);
      this.putUint32(value);
    });
    return this;
  }
}

function generateRtcToken(
  appId: string,
  appKey: string,
  roomId: string,
  userId: string,
  expireSec: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const expireAt = now + expireSec;
  const nonce = Math.floor(Math.random() * 0xffffffff);

  // Privileges: publish(0) + audio(1) + video(2) + data(3) + subscribe(4)
  const privileges = new Map<number, number>([
    [0, expireAt],
    [1, expireAt],
    [2, expireAt],
    [3, expireAt],
    [4, expireAt],
  ]);

  const msgBuf = new RtcBufferWriter();
  msgBuf.putUint32(nonce);
  msgBuf.putUint32(now);
  msgBuf.putUint32(expireAt);
  msgBuf.putString(roomId);
  msgBuf.putString(userId);
  msgBuf.putTreeMapUInt32(new Map([...privileges.entries()].sort()));
  const bytesM = msgBuf.pack();

  const signature = createHmac("sha256", appKey).update(bytesM).digest();

  const content = new RtcBufferWriter()
    .putBytes(bytesM)
    .putBytes(signature)
    .pack();

  return "001" + appId + content.toString("base64");
}

function parseJsonEnv(name: string): JsonObject | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${name} 必须是 JSON 对象`);
  }

  return parsed as JsonObject;
}

function buildBaseConfig() {
  const startConfig = parseJsonEnv("VOLC_VOICE_START_CONFIG_JSON") ?? {};
  const s2sConfig = parseJsonEnv("VOLC_VOICE_S2S_CONFIG_JSON");

  if (!s2sConfig) {
    return startConfig;
  }

  const merged = { ...startConfig };
  const existing = merged.S2SConfig;
  merged.S2SConfig =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as JsonObject), ...s2sConfig }
      : s2sConfig;

  return merged;
}

function buildAgentConfig() {
  const rawAgentConfig = parseJsonEnv("VOLC_VOICE_AGENT_CONFIG_JSON") ?? {};
  const botUserId = getBotUserId();

  if (!botUserId) {
    return rawAgentConfig;
  }

  return {
    ...rawAgentConfig,
    UserId: botUserId,
  };
}

function getSmokeTestTokenConfig() {
  const token = pickFirst(process.env.VOLC_RTC_TEST_TOKEN);
  const roomId = pickFirst(process.env.VOLC_RTC_TEST_ROOM_ID);
  const userId = pickFirst(process.env.VOLC_RTC_TEST_USER_ID);

  if (!token || !roomId || !userId) {
    return null;
  }

  return { token, roomId, userId };
}

function createRtcService() {
  const service = new XiaojingziRtcService();
  const accessKeyId = getAccessKeyId();
  const secretKey = getSecretKey();

  if (!accessKeyId || !secretKey) {
    throw new Error("缺少火山 RTC AK/SK");
  }

  service.setAccessKeyId(accessKeyId);
  service.setSecretKey(secretKey);

  const sessionToken = pickFirst(process.env.VOLC_SESSION_TOKEN);
  if (sessionToken) {
    service.setSessionToken(sessionToken);
  }

  return service;
}

export function getVolcRealtimeStatus(): RealtimeEnvStatus {
  const missing: string[] = [];
  const appId = getAppId() ?? null;
  const botUserId = getBotUserId() ?? null;
  const accessKeyId = getAccessKeyId();
  const secretKey = getSecretKey();
  const appKey = getAppKey();
  const hasSmokeTestToken = !!getSmokeTestTokenConfig();

  if (!appId) missing.push("VOLC_RTC_APP_ID");
  if (!botUserId) missing.push("VOLC_RTC_BOT_USER_ID");
  if (!appKey) missing.push("VOLC_RTC_APP_KEY");
  if (!accessKeyId) missing.push("VOLC_RTC_ACCESS_KEY_ID / VOLC_ACCESSKEY");
  if (!secretKey) missing.push("VOLC_RTC_SECRET_ACCESS_KEY / VOLC_SECRETKEY");

  try {
    buildBaseConfig();
  } catch {
    missing.push("VOLC_VOICE_START_CONFIG_JSON / VOLC_VOICE_S2S_CONFIG_JSON(JSON 格式错误)");
  }

  if (!process.env.VOLC_VOICE_START_CONFIG_JSON && !process.env.VOLC_VOICE_S2S_CONFIG_JSON) {
    missing.push("VOLC_VOICE_START_CONFIG_JSON 或 VOLC_VOICE_S2S_CONFIG_JSON");
  }

  return {
    ready: missing.length === 0,
    missing,
    reason:
      missing.length > 0
        ? `豆包实时语音缺少配置：${missing.join("、")}`
        : null,
    appId,
    botUserId,
    usingExternalTokenProvider: !!pickFirst(process.env.VOLC_RTC_TOKEN_PROVIDER_URL),
    usingSmokeTestToken: hasSmokeTestToken,
  };
}

export function buildRealtimeSessionIds({
  sessionId,
  identityId,
}: RealtimeIdentity) {
  return {
    roomId: sanitizeVoiceId("xjz_room_", sessionId, 48),
    taskId: sanitizeVoiceId("xjz_task_", sessionId, 48),
    userId: buildNumericRtcUserId(identityId || sessionId),
  };
}

async function fetchExternalRtcToken(params: {
  sessionId: string;
  roomId: string;
  userId: string;
}) {
  const providerUrl = pickFirst(process.env.VOLC_RTC_TOKEN_PROVIDER_URL);
  if (!providerUrl) return null;

  const response = await fetch(providerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`RTC Token provider 调用失败：${detail || response.status}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("RTC Token provider 未返回 token");
  }

  return data.token;
}

async function getRtcJoinToken(params: {
  sessionId: string;
  roomId: string;
  userId: string;
}) {
  const smokeTest = getSmokeTestTokenConfig();
  if (smokeTest) {
    return smokeTest;
  }

  const externalToken = await fetchExternalRtcToken(params);
  if (externalToken) {
    return {
      token: externalToken,
      roomId: params.roomId,
      userId: params.userId,
    };
  }

  const appId = getAppId();
  const appKey = getAppKey();

  if (!appId) {
    throw new Error("缺少 VOLC_RTC_APP_ID");
  }
  if (!appKey) {
    throw new Error("缺少 VOLC_RTC_APP_KEY");
  }

  const expireSec = Math.floor(
    Number(process.env.VOLC_RTC_TOKEN_EXPIRE_MS || 3600000) / 1000
  );
  const token = generateRtcToken(
    appId,
    appKey,
    params.roomId,
    params.userId,
    expireSec
  );

  return {
    token,
    roomId: params.roomId,
    userId: params.userId,
  };
}

export async function createRealtimeSessionConnection(params: RealtimeIdentity) {
  const status = getVolcRealtimeStatus();
  if (!status.ready || !status.appId || !status.botUserId) {
    throw new Error(status.reason || "豆包实时语音未完成配置");
  }

  const baseIds = buildRealtimeSessionIds(params);
  const tokenData = await getRtcJoinToken({
    sessionId: params.sessionId,
    roomId: baseIds.roomId,
    userId: baseIds.userId,
  });

  return {
    appId: status.appId,
    roomId: tokenData.roomId,
    userId: tokenData.userId,
    token: tokenData.token,
    taskId: baseIds.taskId,
    botUserId: status.botUserId,
    subtitlesEnabled: process.env.VOLC_RTC_SUBTITLE_ENABLED !== "false",
  } satisfies RealtimeSessionConnection;
}

export async function startRealtimeVoiceChat(connection: RealtimeSessionConnection) {
  const service = createRtcService();
  const appId = getAppId();

  if (!appId) {
    throw new Error("缺少 VOLC_RTC_APP_ID");
  }

  const agentConfig = buildAgentConfig();
  agentConfig.TargetUserId = [connection.userId];

  const response = await service.StartVoiceChat2024({
    AppId: /^\d+$/.test(appId) ? Number(appId) : appId,
    RoomId: connection.roomId,
    TaskId: connection.taskId,
    AgentConfig: agentConfig,
    Config: buildBaseConfig(),
  });

  if (response.ResponseMetadata.Error) {
    throw new Error(
      response.ResponseMetadata.Error.Message || "StartVoiceChat 调用失败"
    );
  }

  return response.Result;
}

export async function stopRealtimeVoiceChat(connection: RealtimeSessionConnection) {
  const service = createRtcService();
  const appId = getAppId();

  if (!appId) {
    throw new Error("缺少 VOLC_RTC_APP_ID");
  }

  try {
    const response = await service.StopVoiceChat2024({
      AppId: /^\d+$/.test(appId) ? Number(appId) : appId,
      RoomId: connection.roomId,
      TaskId: connection.taskId,
    });

    if (!response.ResponseMetadata.Error) {
      return response.Result;
    }
  } catch {
    // fall through
  }

  const legacyResponse = await service.StopVoiceChat202406({
    AppId: /^\d+$/.test(appId) ? Number(appId) : appId,
    RoomId: connection.roomId,
    UserId: connection.botUserId,
  });

  if (legacyResponse.ResponseMetadata.Error) {
    throw new Error(
      legacyResponse.ResponseMetadata.Error.Message || "StopVoiceChat 调用失败"
    );
  }

  return legacyResponse.Result;
}

export async function interruptRealtimeVoiceChat(payload: InterruptPayload) {
  const service = createRtcService();
  const appId = getAppId();

  if (!appId) {
    throw new Error("缺少 VOLC_RTC_APP_ID");
  }

  const response = await service.UpdateVoiceChat2024({
    AppId: /^\d+$/.test(appId) ? Number(appId) : appId,
    RoomId: payload.roomId,
    TaskId: payload.taskId,
    Command: "Interrupt",
  });

  if (response.ResponseMetadata.Error) {
    throw new Error(
      response.ResponseMetadata.Error.Message || "UpdateVoiceChat 调用失败"
    );
  }

  return response.Result;
}
