import { redirect } from "next/navigation";

/**
 * This app is the Triada Designs operations subdomain (admin).
 * Public marketing stays on https://triada-designs.com.
 * Unauthenticated visitors land on admin login.
 */
export default function HomePage() {
  redirect("/login");
}
