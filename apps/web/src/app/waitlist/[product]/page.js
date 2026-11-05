import { redirect } from "next/navigation";

/**
 * Friendly alias → short public form path.
 * /waitlist/[product] → /f/[product]
 *
 * @param {{ params: Promise<{ product?: string }> | { product?: string } }} props
 */
export default async function WaitlistAliasPage({ params }) {
  const resolved = await params;
  const product = String(resolved?.product || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!product) {
    redirect("/f/interest");
  }
  redirect(`/f/${product}`);
}
