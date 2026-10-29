import { NextResponse } from "next/server";
import { scanPopupAlerts } from "@/lib/popups/popup-markets-store";
import { sendTelegramAlert } from "@/lib/jewellery-ops/telegram-alerts";
import { getManufacturerOverview } from "@/lib/jewellery-ops/manufacturer";

/**
 * Vercel Cron: popup deadline scan + manufacturer low-stock alerts.
 */
export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const alt = (request.headers.get("x-cron-secret") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (bearer !== expected && alt !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const popupScan = await scanPopupAlerts();
    let popupAlert = null;
    if ((popupScan.alerted || 0) > 0) {
      popupAlert = await sendTelegramAlert({
        alert_type: "popup",
        title: "Popup application deadlines approaching",
        body: `${popupScan.alerted} market(s) need attention within 21 days.`,
      });
    }
    const manufacturer = await getManufacturerOverview({ alert: true });

    return NextResponse.json(
      {
        ok: true,
        worker: "jewellery_ops_scan",
        popup_scan: popupScan,
        popup_alert: popupAlert,
        manufacturer_low_stock: manufacturer.low_stock_alerts || [],
        time: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        worker: "jewellery_ops_scan",
        error: err instanceof Error ? err.message : "scan_failed",
        time: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
