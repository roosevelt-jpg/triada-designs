"use client";

import Script from "next/script";

/**
 * Loads the first-party visitor → CRM lead tracker on public pages
 * (login / unauthenticated surfaces on the ops host).
 */
export function VisitorCaptureBeacon({ source = "website", token = "" }) {
  return (
    <Script
      src="/widget/visitor.js"
      strategy="afterInteractive"
      data-api="/api/v1/visitors/capture"
      data-source={source}
      {...(token ? { "data-token": token } : {})}
    />
  );
}
