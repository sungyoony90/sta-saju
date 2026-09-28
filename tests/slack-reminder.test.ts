import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET } from "../app/api/cron/daily-fortune-reminder/route";
import { buildDailyReminderMessage } from "../lib/slack/daily-reminder";

const validEnv = {
  CRON_SECRET: "cron-secret-at-least-16-characters",
  SLACK_BOT_TOKEN: "xoxb-test-bot-token-private",
  SLACK_CHANNEL_ID: "UABC123456",
  APP_URL: "https://saju.example.com/today",
};

const reminderEnvKeys = Object.keys(validEnv) as Array<keyof typeof validEnv>;

function setReminderEnv(values: Partial<typeof validEnv>) {
  const previous = Object.fromEntries(
    reminderEnvKeys.map((key) => [key, process.env[key]]),
  ) as Record<keyof typeof validEnv, string | undefined>;

  for (const key of reminderEnvKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }

  return () => {
    for (const key of reminderEnvKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function cronRequest(authorization?: string) {
  return new Request("https://saju.example.com/api/cron/daily-fortune-reminder", {
    headers: authorization ? { Authorization: authorization } : undefined,
  });
}

test("Cron 인증이 없거나 틀리면 401을 반환하고 Slack을 호출하지 않는다", async () => {
  const restoreEnv = setReminderEnv(validEnv);
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }));
  }) as typeof fetch;

  try {
    for (const authorization of [
      undefined,
      "Bearer wrong-cron-secret",
      validEnv.CRON_SECRET,
    ]) {
      const response = await GET(cronRequest(authorization));
      const payload = (await response.json()) as { ok: boolean; code: string; error: string };

      assert.equal(response.status, 401);
      assert.deepEqual(payload, {
        ok: false,
        code: "unauthorized",
        error: "허용되지 않은 요청입니다.",
      });
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("Slack 설정이 하나라도 누락되면 503을 반환하고 Slack을 호출하지 않는다", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }));
  }) as typeof fetch;

  try {
    for (const missing of ["SLACK_BOT_TOKEN", "SLACK_CHANNEL_ID", "APP_URL"] as const) {
      const env: Partial<typeof validEnv> = { ...validEnv };
      delete env[missing];
      const restoreEnv = setReminderEnv(env);
      try {
        const response = await GET(cronRequest(`Bearer ${validEnv.CRON_SECRET}`));
        const payload = (await response.json()) as {
          ok: boolean;
          code: string;
          error: string;
        };

        assert.equal(response.status, 503);
        assert.deepEqual(payload, {
          ok: false,
          code: "missing_config",
          error: "Slack 알림 설정이 필요합니다.",
        });
      } finally {
        restoreEnv();
      }
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("정상 요청은 봇 토큰, 대상과 앱 URL로 안전한 Slack payload를 전송한다", async () => {
  const restoreEnv = setReminderEnv(validEnv);
  const originalFetch = globalThis.fetch;
  let slackUrl = "";
  let authorization = "";
  let contentType = "";
  let slackBody: Record<string, unknown> = {};

  globalThis.fetch = (async (input, init) => {
    slackUrl = String(input);
    const headers = new Headers(init?.headers);
    authorization = headers.get("authorization") || "";
    contentType = headers.get("content-type") || "";
    slackBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await GET(cronRequest(`Bearer ${validEnv.CRON_SECRET}`));
    const payload = (await response.json()) as Record<string, unknown>;
    const responseText = JSON.stringify(payload);
    const slackBodyText = JSON.stringify(slackBody);

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
    assert.equal(slackUrl, "https://slack.com/api/chat.postMessage");
    assert.equal(authorization, `Bearer ${validEnv.SLACK_BOT_TOKEN}`);
    assert.equal(contentType, "application/json; charset=utf-8");
    assert.deepEqual(slackBody, {
      channel: validEnv.SLACK_CHANNEL_ID,
      text: buildDailyReminderMessage(validEnv.APP_URL),
      unfurl_links: false,
      unfurl_media: false,
    });
    assert.doesNotMatch(slackBodyText, new RegExp(validEnv.SLACK_BOT_TOKEN));
    assert.doesNotMatch(slackBodyText, new RegExp(validEnv.CRON_SECRET));
    for (const secret of [
      validEnv.SLACK_BOT_TOKEN,
      validEnv.SLACK_CHANNEL_ID,
      validEnv.CRON_SECRET,
    ]) {
      assert.doesNotMatch(responseText, new RegExp(secret));
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("Slack ok:false와 네트워크 실패는 각각 502로 처리하고 내부 오류를 노출하지 않는다", async () => {
  const restoreEnv = setReminderEnv(validEnv);
  const originalFetch = globalThis.fetch;

  try {
    for (const fetcher of [
      async () =>
        new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      async () => {
        throw new Error("network detail that must stay private");
      },
    ]) {
      globalThis.fetch = fetcher as typeof fetch;
      const response = await GET(cronRequest(`Bearer ${validEnv.CRON_SECRET}`));
      const payload = (await response.json()) as {
        ok: boolean;
        code: string;
        error: string;
      };
      const serialized = JSON.stringify(payload);

      assert.equal(response.status, 502);
      assert.deepEqual(payload, {
        ok: false,
        code: "slack_error",
        error: "Slack 알림을 보내지 못했습니다.",
      });
      assert.doesNotMatch(serialized, /invalid_auth|network detail/);
      assert.doesNotMatch(serialized, new RegExp(validEnv.SLACK_BOT_TOKEN));
      assert.doesNotMatch(serialized, new RegExp(validEnv.CRON_SECRET));
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("Slack 메시지에는 링크와 고정 안내만 있고 개인정보는 포함되지 않는다", () => {
  const message = buildDailyReminderMessage(validEnv.APP_URL);

  assert.match(message, /오늘의 운세를 확인해보세요/);
  assert.match(message, new RegExp(validEnv.APP_URL.replaceAll(".", "\\.")));
  assert.doesNotMatch(
    message,
    /2005-12-23|08:37|private@example\.com|홍길동|乙酉|birthDate|birthTime|email/,
  );
  assert.doesNotMatch(message, /xoxb-|cron-secret|UABC123456/);
});

test("Vercel Cron은 보호된 경로를 매일 00:00 UTC에 호출한다", () => {
  const config = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
  ) as { crons?: Array<{ path?: string; schedule?: string }> };

  assert.deepEqual(config.crons, [
    {
      path: "/api/cron/daily-fortune-reminder",
      schedule: "0 0 * * *",
    },
  ]);
});
