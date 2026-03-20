/**
 * 短信发送模块
 *
 * 当前：开发模式用固定验证码 "123456"，生产模式也暂用此方案
 * 后续：接入阿里云短信 / 腾讯云短信
 *
 * 接入阿里云短信时，需要：
 * 1. 注册阿里云账号，开通短信服务
 * 2. 创建签名和模板（需审核）
 * 3. 设置环境变量：SMS_ACCESS_KEY_ID, SMS_ACCESS_KEY_SECRET, SMS_SIGN_NAME, SMS_TEMPLATE_CODE
 */

/**
 * 生成 6 位随机验证码
 */
export function generateCode(): string {
  // 开发/测试阶段：固定验证码 123456，方便测试
  if (process.env.SMS_PROVIDER !== 'aliyun') {
    return '123456';
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 发送短信验证码
 * @returns true 发送成功, false 发送失败
 */
export async function sendSmsCode(phone: string, code: string): Promise<boolean> {
  // 验证手机号格式（中国大陆）
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    console.error('Invalid phone number:', phone);
    return false;
  }

  const provider = process.env.SMS_PROVIDER;

  if (provider === 'aliyun') {
    return sendViaAliyun(phone, code);
  }

  // 默认：开发模式，打印到控制台
  console.log(`\n========================================`);
  console.log(`📱 验证码发送（开发模式）`);
  console.log(`手机号: ${phone}`);
  console.log(`验证码: ${code}`);
  console.log(`========================================\n`);
  return true;
}

/**
 * 阿里云短信发送（预留）
 */
async function sendViaAliyun(phone: string, code: string): Promise<boolean> {
  const accessKeyId = process.env.SMS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.SMS_ACCESS_KEY_SECRET;
  const signName = process.env.SMS_SIGN_NAME;
  const templateCode = process.env.SMS_TEMPLATE_CODE;

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    console.error('Aliyun SMS not configured');
    return false;
  }

  try {
    // TODO: 实现阿里云短信 API 调用
    // 参考文档: https://help.aliyun.com/document_detail/419273.html
    console.log(`Aliyun SMS: ${phone} -> ${code}`);
    void phone;
    void code;
    return true;
  } catch (error) {
    console.error('Aliyun SMS failed:', error);
    return false;
  }
}
