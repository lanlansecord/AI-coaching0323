# 小镜子豆包实时语音配置

这份说明只处理两件事：

- 哪些配置可以直接照抄
- 哪些配置不要在仓库里硬编码

## 1. 直接可用的人格配置

O / O2.0 版本支持 `bot_name`、`system_role`、`speaking_style`。  
小镜子的推荐值已经放在：

- [doubao-agent-config.example.json](/Users/xingcaiyan/Documents/claude%20code/xiaojingzi/docs/voice/doubao-agent-config.example.json)

对应环境变量写法：

```bash
VOLC_VOICE_AGENT_CONFIG_JSON='{"bot_name":"小镜子","system_role":"你是小镜子，一个帮助用户看见自己、整理感受、推进下一步的中文语音对话伙伴。你不是心理咨询师，不做诊断，也不替代医生。你的目标是让对方在 5 到 10 分钟里感觉到被听见了，也更清楚自己一点。对话里优先共情、澄清和陪伴，再慢慢推进，不要像客服，不要像老师。","speaking_style":"声音温柔、稳定、偏慢一点，像一个很会聊天、很有分寸的朋友。多用短句和自然停顿，不说教，不端着，不用术语，不像在朗读稿子。用户低落时更轻一点，用户混乱时更稳一点，用户卡住时给非常小的一步。不要夸张表演，不要甜腻，不要故作神秘。"}'
```

## 2. S2SConfig 不在仓库里写死

`S2SConfig` 的字段会随着模型版本变化，而且不同版本的可选能力也不一样。  
当前代码已经支持把整段官方 JSON 原样透传到 `Config.S2SConfig`，所以最稳的做法是：

1. 在火山控制台或官方文档里选择你要的实时语音版本
2. 拿到对应的 `S2SConfig` JSON
3. 直接粘到环境变量里

例如：

```bash
VOLC_VOICE_S2S_CONFIG_JSON='{"这里粘贴火山官方给你的 S2SConfig 原文"}'
```

如果你拿到的是一整个 `Config` JSON，而不只是 `S2SConfig`，就改用：

```bash
VOLC_VOICE_START_CONFIG_JSON='{"这里粘贴完整 Config JSON"}'
```

代码优先级：

- `VOLC_VOICE_START_CONFIG_JSON`：整段 `Config` 原样透传
- `VOLC_VOICE_S2S_CONFIG_JSON`：自动合并到 `Config.S2SConfig`

## 3. 最小必填环境变量

```bash
NEXT_PUBLIC_VOICE_PROVIDER=doubao-realtime
VOLC_RTC_APP_ID=
VOLC_RTC_BOT_USER_ID=
VOLC_RTC_ACCESS_KEY_ID=
VOLC_RTC_SECRET_ACCESS_KEY=
VOLC_REGION=cn-north-1
VOLC_RTC_TOKEN_EXPIRE_MS=3600000
VOLC_VOICE_AGENT_CONFIG_JSON=
VOLC_VOICE_S2S_CONFIG_JSON=
VOLC_RTC_SUBTITLE_ENABLED=true
```

## 4. 什么时候用哪个音色方向

对小镜子这类产品，优先建议：

- `O2.0 + 精品音色 + speaking_style`

不建议第一版就走太强的角色扮演感。  
目标更像“温柔稳定的陪伴者”，不是“情绪表演型角色”。

## 5. 额外提醒

- 如果你希望语音会话文本自动写回 `messages`，要在 RTC 控制台开实时字幕
- 代码已经支持直接通过 RTC OpenAPI `GetAppToken` 生成进房 Token，不再强依赖外部 Token 服务
- 如果还没准备好 AK/SK，也可以先用 `VOLC_RTC_TEST_TOKEN / ROOM_ID / USER_ID` 做单设备 smoke test
- 当前代码已经接了 `StartVoiceChat / StopVoiceChat / UpdateVoiceChat`，所以最关键的是把控制台参数补齐
