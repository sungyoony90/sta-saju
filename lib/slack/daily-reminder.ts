const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";

export class SlackReminderConfigError extends Error {}
export class SlackReminderSendError extends Error {}

export type SlackReminderConfig = {
  botToken: string;
  channelId: string;
  appUrl: string;
};

type SlackApiResponse = {
  ok?: boolean;
  error?: string;
};

function requiredEnv(name: string, value: string | undefined) {
  const clean = value?.trim();
  if (!clean) throw new SlackReminderConfigError(`${name} 환경변수가 필요합니다.`);
  return clean;
}

export function getSlackReminderConfig(
  env: Record<string, string | undefined> = process.env,
): SlackReminderConfig {
  const botToken = requiredEnv("SLACK_BOT_TOKEN", env.SLACK_BOT_TOKEN);
  const channelId = requiredEnv("SLACK_CHANNEL_ID", env.SLACK_CHANNEL_ID);
  const appUrl = requiredEnv("APP_URL", env.APP_URL);

  if (!botToken.startsWith("xoxb-"))
    throw new SlackReminderConfigError("SLACK_BOT_TOKEN은 봇 토큰이어야 합니다.");
  if (!/^[CDGU][A-Z0-9]+$/.test(channelId))
    throw new SlackReminderConfigError("SLACK_CHANNEL_ID 형식이 올바르지 않습니다.");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new SlackReminderConfigError("APP_URL 형식이 올바르지 않습니다.");
  }
  if (parsedUrl.protocol !== "https:")
    throw new SlackReminderConfigError("APP_URL은 HTTPS 주소여야 합니다.");

  return { botToken, channelId, appUrl: parsedUrl.toString() };
}

export function buildDailyReminderMessage(appUrl: string) {
  return [
    "🌅 오늘의 운세를 확인해보세요!",
    "오늘의 흐름을 살펴보고 하루를 가볍게 시작해보세요.",
    appUrl,
  ].join("\n");
}

export async function sendDailySlackReminder(
  config: SlackReminderConfig,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(SLACK_POST_MESSAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: config.channelId,
        text: buildDailyReminderMessage(config.appUrl),
        unfurl_links: false,
        unfurl_media: false,
      }),
      cache: "no-store",
    });
  } catch {
    throw new SlackReminderSendError("Slack에 연결하지 못했습니다.");
  }

  let payload: SlackApiResponse = {};
  try {
    payload = (await response.json()) as SlackApiResponse;
  } catch {
    throw new SlackReminderSendError("Slack 응답을 확인하지 못했습니다.");
  }

  if (!response.ok || payload.ok !== true)
    throw new SlackReminderSendError("Slack 알림을 보내지 못했습니다.");
}
