import { NextResponse } from "next/server";
import {
  getSlackReminderConfig,
  sendDailySlackReminder,
  SlackReminderConfigError,
  SlackReminderSendError,
} from "../../../../lib/slack/daily-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (
    !cronSecret ||
    cronSecret.length < 16 ||
    authorization !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      { ok: false, code: "unauthorized", error: "허용되지 않은 요청입니다." },
      { status: 401 },
    );
  }

  try {
    const config = getSlackReminderConfig();
    await sendDailySlackReminder(config);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SlackReminderConfigError) {
      return NextResponse.json(
        { ok: false, code: "missing_config", error: "Slack 알림 설정이 필요합니다." },
        { status: 503 },
      );
    }
    if (error instanceof SlackReminderSendError) {
      return NextResponse.json(
        { ok: false, code: "slack_error", error: "Slack 알림을 보내지 못했습니다." },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { ok: false, code: "unknown_error", error: "Slack 알림 처리에 실패했습니다." },
      { status: 500 },
    );
  }
}
