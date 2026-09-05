import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isRecord,
  shortHash,
  stringValue,
  unwrapSandValuePreservingBinary,
  type JsonObject
} from "./sand-values.js";
import {
  toolCallItem,
  toolOutputItem,
  type ToolWirePart
} from "./tool-wire.js";

interface SandPart extends ToolWirePart {
  text?: unknown;
  textDelta?: unknown;
  thinking?: unknown;
  image_url?: unknown;
  url?: unknown;
  image?: unknown;
  data?: unknown;
  mimeType?: unknown;
  mime_type?: unknown;
  detail?: unknown;
}

interface SandMessage extends SandPart {
  role?: unknown;
  toolCalls?: unknown;
  tool_calls?: unknown;
}

export interface MessageWireContext {
  agentId?: string | undefined;
  dataRoot?: string | undefined;
}

const MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024;

function partType(part: SandPart | undefined): string {
  return stringValue(part && (part.type || part.kind));
}

function textFromContent(content: unknown, includeReasoning = false): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringValue(content);
  const text = [];
  for (const part of content) {
    const item = isRecord(part) ? part as SandPart : {};
    const type = partType(item);
    if (["text", "input_text", "output_text"].includes(type)) text.push(stringValue(item.text ?? item.content));
    if (includeReasoning && ["reasoning", "thinking"].includes(type)) {
      text.push(stringValue(item.text ?? item.textDelta ?? item.thinking));
    }
  }
  return text.filter(Boolean).join("\n");
}

export function assistantMessageItem(text: string, ordinal = 0): JsonObject {
  return {
    type: "message",
    id: `msg_grok_${ordinal}_${shortHash(text, 20)}`,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }]
  };
}

function imageMimeType(header: Buffer): string | undefined {
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  const prefix = header.subarray(0, 6).toString("ascii");
  if (prefix === "GIF87a" || prefix === "GIF89a") return "image/gif";
  if (header.subarray(0, 4).toString("ascii") === "RIFF" &&
      header.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

function isBinaryValue(value: unknown): value is Buffer | Uint8Array {
  return Buffer.isBuffer(value) || value instanceof Uint8Array;
}

function binaryImageDataUrl(value: Buffer | Uint8Array | undefined): string | undefined {
  if (!value) return undefined;
  const image = Buffer.isBuffer(value)
    ? value
    : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (image.length === 0 || image.length > MAX_LOCAL_IMAGE_BYTES) return undefined;
  const mimeType = imageMimeType(image.subarray(0, 12));
  return mimeType ? `data:${mimeType};base64,${image.toString("base64")}` : undefined;
}

function localPath(value: string): string | undefined {
  if (path.isAbsolute(value)) return path.resolve(value);
  if (!value.toLowerCase().startsWith("file:")) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "file:" || url.hostname) return undefined;
    return path.resolve(fileURLToPath(url));
  } catch {
    return undefined;
  }
}

interface TrustedAttachmentRoot {
  canonical: string;
  requested: string;
}

function trustedAttachmentRoot(dataRoot: string, agentId: string): TrustedAttachmentRoot | undefined {
  const requestedDataRoot = path.resolve(dataRoot);
  const requested = path.join(requestedDataRoot, "agents", agentId, "attachments");
  const directories = [
    path.join(requestedDataRoot, "agents"),
    path.join(requestedDataRoot, "agents", agentId),
    requested
  ];
  try {
    const canonicalDataRoot = fs.realpathSync(requestedDataRoot);
    for (const directory of directories) {
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
    }
    const canonical = fs.realpathSync(requested);
    if (canonical !== path.join(canonicalDataRoot, "agents", agentId, "attachments")) return undefined;
    return { canonical, requested };
  } catch {
    return undefined;
  }
}

function openedPath(descriptor: number): string | undefined {
  for (const link of [`/proc/self/fd/${descriptor}`, `/dev/fd/${descriptor}`]) {
    try {
      return fs.realpathSync(link);
    } catch {}
  }
  return undefined;
}

function boundedRead(descriptor: number, expectedSize: number): Buffer | undefined {
  const capacity = Math.min(MAX_LOCAL_IMAGE_BYTES + 1, Math.max(12, expectedSize + 1));
  const image = Buffer.allocUnsafe(capacity);
  let total = 0;
  while (total < capacity) {
    const count = fs.readSync(descriptor, image, total, capacity - total, null);
    if (count === 0) break;
    total += count;
  }
  if (total > MAX_LOCAL_IMAGE_BYTES) return undefined;
  if (total === capacity) {
    const extra = Buffer.allocUnsafe(1);
    if (fs.readSync(descriptor, extra, 0, 1, null) !== 0) return undefined;
  }
  return total === 0 ? undefined : image.subarray(0, total);
}

function localImageDataUrl(value: string, context: MessageWireContext): string | undefined {
  if (!context.agentId || !/^[a-zA-Z0-9_-]+$/.test(context.agentId)) return undefined;
  try {
    const dataRoot = context.dataRoot || process.env.SAND_DATA_ROOT || path.join(os.homedir(), "sand-data");
    const attachmentRoot = trustedAttachmentRoot(dataRoot, context.agentId);
    const candidate = localPath(value);
    if (!attachmentRoot || !candidate || path.dirname(candidate) !== attachmentRoot.requested) return undefined;
    if (typeof fs.constants.O_NOFOLLOW !== "number") return undefined;
    const descriptor = fs.openSync(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_LOCAL_IMAGE_BYTES) return undefined;
      const resolvedOpenedPath = openedPath(descriptor);
      if (!resolvedOpenedPath ||
          path.dirname(resolvedOpenedPath) !== attachmentRoot.canonical ||
          path.basename(resolvedOpenedPath) !== path.basename(candidate)) return undefined;
      const image = boundedRead(descriptor, stat.size);
      if (!image) return undefined;
      const mimeType = imageMimeType(image.subarray(0, 12));
      if (!mimeType) return undefined;
      return `data:${mimeType};base64,${image.toString("base64")}`;
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return undefined;
  }
}

function imageInput(part: SandPart, context: MessageWireContext): JsonObject {
  const imageUrl = isRecord(part.image_url) ? part.image_url["url"] : part.image_url;
  const binaryValue = isBinaryValue(part.image) ? part.image : isBinaryValue(part.data) ? part.data : undefined;
  const binaryDataUrl = binaryImageDataUrl(binaryValue);
  const value = binaryValue ? "" : stringValue(imageUrl || part.url || part.image || part.data).trim();
  const mimeType = stringValue(part.mimeType || part.mime_type).trim().toLowerCase();
  const dataUrl = binaryDataUrl || localImageDataUrl(value, context) || (
    value && !/^(?:data:|https?:\/\/)/i.test(value) && mimeType.startsWith("image/")
      ? `data:${mimeType};base64,${value}`
      : value
  );
  if (/^https?:\/\//i.test(dataUrl) || /^data:image\/[^;,]+;base64,[a-z0-9+/]*={0,2}$/i.test(dataUrl)) {
    return { type: "input_image", detail: part.detail || "auto", image_url: dataUrl };
  }
  return { type: "input_text", text: "image content omitted because its source is not available to Codex" };
}

export function convertMessages(
  messages: unknown,
  context: MessageWireContext = {}
): { instructions: string; input: unknown[] } {
  const instructions = [];
  const input = [];
  let assistantOrdinal = 0;
  for (const raw of Array.isArray(messages) ? messages : []) {
    const unwrapped = unwrapSandValuePreservingBinary(raw);
    const message = isRecord(unwrapped) ? unwrapped as SandMessage : {};
    const role = stringValue(message.role || "user");
    if (role === "system" || role === "developer") {
      const text = textFromContent(message.content, false);
      if (text) instructions.push(text);
      continue;
    }
    if (role === "tool" || role === "toolResult") {
      const parts = Array.isArray(message.content) ? message.content : [message];
      let emitted = false;
      for (const rawPart of parts) {
        const part = isRecord(rawPart) ? rawPart as SandPart : {};
        if (partType(part) === "tool-result" || partType(part) === "tool_result" || rawPart === message) {
          input.push(toolOutputItem(part, message));
          emitted = true;
        }
      }
      if (!emitted) input.push(toolOutputItem(message));
      continue;
    }
    if (role === "assistant") {
      const text = textFromContent(message.content, false);
      if (text) input.push(assistantMessageItem(text, assistantOrdinal++));
      const parts = [
        ...(Array.isArray(message.content) ? message.content : []),
        ...(Array.isArray(message.toolCalls) ? message.toolCalls : []),
        ...(Array.isArray(message.tool_calls) ? message.tool_calls : [])
      ];
      for (const rawPart of parts) {
        const part = isRecord(rawPart) ? rawPart as SandPart : {};
        const type = partType(part);
        if (["tool-call", "tool_use", "function_call"].includes(type) || part.function) {
          input.push(toolCallItem(part));
        }
      }
      continue;
    }
    if (Array.isArray(message.content)) {
      const parts = [];
      for (const rawPart of message.content) {
        const part = isRecord(rawPart) ? rawPart as SandPart : {};
        const type = partType(part);
        if (["text", "input_text", "output_text"].includes(type)) {
          const text = stringValue(part.text ?? part.content);
          if (text) parts.push({ type: "input_text", text });
        } else if (["attachment", "image", "image_url", "input_image"].includes(type)) {
          parts.push(imageInput(part, context));
        }
      }
      if (parts.length) input.push({ role: "user", content: parts });
    } else {
      const text = stringValue(message.content);
      if (text) input.push({ role: "user", content: [{ type: "input_text", text }] });
    }
  }
  if (input.length === 0) input.push({ role: "user", content: [{ type: "input_text", text: "(continue)" }] });
  return { instructions: instructions.join("\n\n") || "You are a helpful assistant.", input };
}
