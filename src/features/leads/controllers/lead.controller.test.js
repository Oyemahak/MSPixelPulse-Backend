import test from "node:test";
import assert from "node:assert/strict";
import { createLead, leadControllerInternals } from "./lead.controller.js";

const secret = ["intake", "test", "value"].join("-").padEnd(40, "k");

function fakeResponse() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fakeRequest(body) {
  return { body, ip: "203.0.113.9", get: () => "ExampleBrowser/1.0" };
}

async function withForwardingSpy(run) {
  const previous = {
    url: process.env.CONSOLE_INTAKE_URL,
    secret: process.env.CONSOLE_INTAKE_SECRET,
    fetch: globalThis.fetch,
    internals: { ...leadControllerInternals },
  };
  process.env.CONSOLE_INTAKE_URL = "https://console.example.com/api/intake/inquiry";
  process.env.CONSOLE_INTAKE_SECRET = secret;
  const calls = { fetch: 0, forward: 0, save: 0 };
  globalThis.fetch = async () => { calls.fetch += 1; return { ok: true, status: 202 }; };
  leadControllerInternals.startConsoleIntake = async () => { calls.forward += 1; };
  leadControllerInternals.saveLead = async () => { calls.save += 1; throw new Error("not expected"); };
  try {
    await run(calls);
  } finally {
    Object.assign(leadControllerInternals, previous.internals);
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.CONSOLE_INTAKE_URL;
    else process.env.CONSOLE_INTAKE_URL = previous.url;
    if (previous.secret === undefined) delete process.env.CONSOLE_INTAKE_SECRET;
    else process.env.CONSOLE_INTAKE_SECRET = previous.secret;
  }
}

const validBody = { name: "Example Visitor", email: "visitor@example.com", message: "Hello there." };

test("honeypot submissions are not stored or forwarded", async () => {
  await withForwardingSpy(async (calls) => {
    const res = fakeResponse();
    await createLead(fakeRequest({ ...validBody, _hp: "bot" }), res);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(calls, { fetch: 0, forward: 0, save: 0 });
  });
});

test("validation failures are not stored or forwarded", async () => {
  await withForwardingSpy(async (calls) => {
    const res = fakeResponse();
    await createLead(fakeRequest({ name: "Example Visitor", email: "not-an-email", message: "Hi" }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(calls, { fetch: 0, forward: 0, save: 0 });
  });
});

test("duplicate submissions return the existing lead and are not forwarded", async () => {
  await withForwardingSpy(async (calls) => {
    leadControllerInternals.findRecentDuplicate = async () => ({ _id: "lead-1", confirmationEmailStatus: "sent" });
    const res = fakeResponse();
    await createLead(fakeRequest(validBody), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.duplicate, true);
    assert.deepEqual(calls, { fetch: 0, forward: 0, save: 0 });
  });
});
