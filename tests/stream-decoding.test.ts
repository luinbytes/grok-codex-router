import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import type WebSocket from "ws";
import { DEFAULT_STREAM_IDLE_TIMEOUT_MS } from "../src/codex-policy.js";
import { parseSSE } from "../src/sse-stream.js";
import { websocketEvents } from "../src/websocket-stream.js";
import type { RouterError } from "../src/recovery.js";

const EXPECTED_STREAM_IDLE_TIMEOUT_MS = 180_000;

async function flushPromises(): Promise<void> {
  await setImmediate();
}

test("SSE decoding preserves events across split CRLF boundaries", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"first"}\r'));
      controller.enqueue(encoder.encode('\n\r'));
      controller.enqueue(encoder.encode('\ndata: {"type":"second"}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  const events = [];
  for await (const event of parseSSE(new Response(body), undefined)) events.push(event.type);
  assert.deepEqual(events, ["first", "second"]);
});

test("WebSocket decoding preserves an oversized-frame close after a generic error", async () => {
  const socket = new EventEmitter() as WebSocket;
  const iterator = websocketEvents(socket, undefined, 0)[Symbol.asyncIterator]();
  const next = iterator.next();
  socket.emit("error", new Error("transport failed"));
  socket.emit("close", 1009, Buffer.alloc(0));

  await assert.rejects(next, (error: RouterError) => error.closeCode === 1009);
});

test("WebSocket listeners are released when a response completes", async () => {
  const socket = new EventEmitter() as WebSocket;
  const iterator = websocketEvents(socket, undefined, 0)[Symbol.asyncIterator]();
  const next = iterator.next();
  socket.emit("message", Buffer.from('{"type":"response.completed","response":{"status":"completed"}}'));
  assert.equal((await next).value?.type, "response.completed");
  assert.equal((await iterator.next()).done, true);
  assert.equal(socket.listenerCount("message"), 0);
  assert.equal(socket.listenerCount("error"), 0);
  assert.equal(socket.listenerCount("close"), 0);
});

test("WebSocket idle timeout rejects at the configured boundary and detaches listeners", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const socket = new EventEmitter() as WebSocket;
  const controller = new AbortController();
  const iterator = websocketEvents(socket, controller.signal, DEFAULT_STREAM_IDLE_TIMEOUT_MS)[Symbol.asyncIterator]();
  const next = iterator.next();
  let rejection: unknown;
  void next.catch((error) => { rejection = error; });

  t.mock.timers.tick(EXPECTED_STREAM_IDLE_TIMEOUT_MS);
  await flushPromises();
  try {
    assert.ok(rejection, "silent streams must fail at the configured idle boundary");
  } finally {
    if (!rejection) {
      controller.abort();
      await flushPromises();
    }
  }
  assert.equal((rejection as RouterError).code, "WS_IDLE_TIMEOUT");
  assert.equal(socket.listenerCount("message"), 0);
  assert.equal(socket.listenerCount("error"), 0);
  assert.equal(socket.listenerCount("close"), 0);
});

test("WebSocket abort rejects and detaches listeners", async () => {
  const socket = new EventEmitter() as WebSocket;
  const controller = new AbortController();
  const iterator = websocketEvents(socket, controller.signal, DEFAULT_STREAM_IDLE_TIMEOUT_MS)[Symbol.asyncIterator]();
  const next = iterator.next();
  controller.abort();
  await assert.rejects(next, (error: Error) => error.message === "Request was aborted");
  assert.equal(socket.listenerCount("message"), 0);
  assert.equal(socket.listenerCount("error"), 0);
  assert.equal(socket.listenerCount("close"), 0);
});

test("WebSocket activity resets the idle timeout across a long response", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const socket = new EventEmitter() as WebSocket;
  const iterator = websocketEvents(socket, undefined, DEFAULT_STREAM_IDLE_TIMEOUT_MS)[Symbol.asyncIterator]();
  const first = iterator.next();
  t.mock.timers.tick(EXPECTED_STREAM_IDLE_TIMEOUT_MS - 1);
  await flushPromises();
  socket.emit("message", Buffer.from('{"type":"response.created","response":{"id":"resp_1"}}'));
  assert.equal((await first).value?.type, "response.created");

  const second = iterator.next();
  t.mock.timers.tick(EXPECTED_STREAM_IDLE_TIMEOUT_MS - 1);
  await flushPromises();
  socket.emit("message", Buffer.from('{"type":"response.completed","response":{"status":"completed"}}'));
  assert.equal((await second).value?.type, "response.completed");
  assert.equal((await iterator.next()).done, true);
  assert.equal(socket.listenerCount("message"), 0);
  assert.equal(socket.listenerCount("error"), 0);
  assert.equal(socket.listenerCount("close"), 0);
});
