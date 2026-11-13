import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ADMIN_PASSWORD = 'admin123';

export function resolveEnvFilePath(): string {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), '.env');
}

/**
 * Parses ADMIN_PASSWORD directly from a .env file content string.
 * Strips surrounding whitespace, double quotes, and single quotes.
 * Supports ADMIN_PASSWORD=... and admin_password=... with flexible spacing.
 */
export function parseAdminPasswordFromEnvContent(content: string): string | null {
  if (!content) return null;
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(?:ADMIN_PASSWORD|admin_password)\s*=\s*(.*)$/i);
    if (match) {
      let val = match[1].trim();
      // Remove inline comments if present (e.g., ADMIN_PASSWORD=myPass # comment)
      if (val.includes(' #')) {
        val = val.split(' #')[0].trim();
      }
      // Strip surrounding matching double quotes or single quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).trim();
      }
      if (val) return val;
    }
  }
  return null;
}

/**
 * Dynamically resolves the current admin password:
 * 1. Reads .env from disk on-the-fly (so edits to .env take effect immediately without restarting PM2/Node)
 * 2. Falls back to process.env.ADMIN_PASSWORD
 * 3. Defaults to 'admin123'
 */
export function getAdminPassword(): string {
  try {
    const envPath = resolveEnvFilePath();
    if (fs.existsSync(envPath)) {
      const raw = fs.readFileSync(envPath, 'utf8');
      const parsed = parseAdminPasswordFromEnvContent(raw);
      if (parsed) return parsed;
    }
  } catch {
    // fallback below
  }

  const envVal = process.env.ADMIN_PASSWORD?.trim();
  if (envVal) {
    if (
      (envVal.startsWith('"') && envVal.endsWith('"')) ||
      (envVal.startsWith("'") && envVal.endsWith("'"))
    ) {
      return envVal.slice(1, -1).trim() || DEFAULT_ADMIN_PASSWORD;
    }
    return envVal;
  }

  return DEFAULT_ADMIN_PASSWORD;
}

/**
 * Checks whether an incoming password matches the current admin password.
 */
export function verifyAdminPassword(inputPassword?: string): boolean {
  if (typeof inputPassword !== 'string') return false;
  const target = getAdminPassword();
  const input = inputPassword.trim();
  if (input === target) return true;

  // Additional resilience check: if process.env has an unquoted/trimmed alternate
  const alt = process.env.ADMIN_PASSWORD?.trim();
  if (alt && (input === alt || input === alt.replace(/^['"]|['"]$/g, ''))) {
    return true;
  }

  return false;
}

/**
 * Saves a new admin password directly into .env and process.env.
 */
export function setAdminPassword(newPassword: string): { success: boolean; message: string } {
  const cleanPassword = newPassword.trim();
  if (!cleanPassword || cleanPassword.length < 4) {
    return {
      success: false,
      message: '新密码长度至少需要 4 位字符',
    };
  }

  try {
    const envPath = resolveEnvFilePath();
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    if (/^(?:ADMIN_PASSWORD|admin_password)\s*=/im.test(content)) {
      content = content.replace(
        /^(?:ADMIN_PASSWORD|admin_password)\s*=.*$/im,
        `ADMIN_PASSWORD="${cleanPassword}"`
      );
    } else {
      content = content.trimEnd() + `\nADMIN_PASSWORD="${cleanPassword}"\n`;
    }

    fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');
    process.env.ADMIN_PASSWORD = cleanPassword;

    return {
      success: true,
      message: '新密码已保存至 .env 并即时生效',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `写入 .env 失败: ${err?.message || '文件权限不足'}`,
    };
  }
}
