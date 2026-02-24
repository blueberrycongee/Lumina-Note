/**
 * API Key 加密工具
 * 使用 AES-GCM + 机器指纹
 */

// 生成机器指纹（基于浏览器/系统信息）
async function getMachineFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    screen.colorDepth.toString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() || "4",
  ];
  
  // 使用 SHA-256 生成指纹
  const data = new TextEncoder().encode(components.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// 从指纹派生 AES 密钥
async function deriveKey(fingerprint: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(fingerprint),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  
  // 固定盐值（应用级别）
  const salt = encoder.encode("lumina-note-salt-v1");
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// 加密
export async function encryptApiKey(apiKey: string): Promise<string> {
  if (!apiKey) return "";
  
  try {
    const fingerprint = await getMachineFingerprint();
    const key = await deriveKey(fingerprint);
    
    // 生成随机 IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(apiKey)
    );
    
    // 组合 IV + 密文，Base64 编码
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return "encrypted:" + btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption failed:", error);
    return apiKey; // 降级为明文
  }
}

// 解密
export async function decryptApiKey(encryptedKey: string): Promise<string> {
  if (!encryptedKey) return "";
  
  // 如果不是加密格式，直接返回（兼容旧数据）
  if (!encryptedKey.startsWith("encrypted:")) {
    return encryptedKey;
  }
  
  try {
    const fingerprint = await getMachineFingerprint();
    const key = await deriveKey(fingerprint);
    
    // Base64 解码
    const data = encryptedKey.slice("encrypted:".length);
    const combined = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    
    // 分离 IV 和密文
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption failed:", error);
    return ""; // 解密失败返回空
  }
}

// 检查是否是加密格式
export function isEncrypted(value: string): boolean {
  return value.startsWith("encrypted:");
}
