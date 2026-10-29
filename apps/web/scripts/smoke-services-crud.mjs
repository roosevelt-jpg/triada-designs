/**
 * Smoke: services catalog CRUD (no hardcoded seed; empty → create → update → delete).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-services-crud.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  deleteService,
  getService,
  listServices,
  upsertService,
} from "@/lib/commerce/services-store.js";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir.js";

const localFile = path.join(getLocalDataDir(), "services-catalog.json");
try {
  await unlink(localFile);
} catch {
  /* ok if missing */
}

const listed0 = await listServices();
if (listed0.data.length !== 0) {
  throw new Error(`expected empty catalog, got ${listed0.data.length}`);
}
console.log("ok empty", { mode: listed0.mode, count: 0 });

const created = await upsertService({
  name: "Smoke consultation",
  description: "Temporary smoke service",
  price: 0,
  currency: "AED",
  inquiry_url: "https://triada-designs.com/",
  status: "active",
  approved_claims: ["consultation", "smoke"],
});
if (!created.service?.id || !created.created) {
  throw new Error(`create failed: ${JSON.stringify(created)}`);
}
console.log("ok create", { id: created.service.id, mode: created.mode });

const got = await getService(created.service.id);
if (!got || got.name !== "Smoke consultation") {
  throw new Error(`get failed: ${JSON.stringify(got)}`);
}
console.log("ok get", { id: got.id });

const updated = await upsertService({
  id: created.service.id,
  name: "Smoke consultation updated",
  price: 150,
  status: "draft",
  approved_claims: ["consultation"],
});
if (updated.created || updated.service.name !== "Smoke consultation updated") {
  throw new Error(`update failed: ${JSON.stringify(updated)}`);
}
if (updated.service.price !== 150 || updated.service.status !== "draft") {
  throw new Error(`update fields wrong: ${JSON.stringify(updated.service)}`);
}
console.log("ok update", {
  name: updated.service.name,
  price: updated.service.price,
  status: updated.service.status,
});

const listed1 = await listServices();
if (!listed1.data.some((s) => s.id === created.service.id)) {
  throw new Error("created service missing from list");
}
console.log("ok list", { count: listed1.data.length });

const removed = await deleteService(created.service.id);
if (!removed.ok) {
  throw new Error(`delete failed: ${JSON.stringify(removed)}`);
}
const after = await getService(created.service.id);
if (after) {
  throw new Error("service still present after delete");
}
const listed2 = await listServices();
if (listed2.data.some((s) => s.id === created.service.id)) {
  throw new Error("deleted service still in list");
}
console.log("ok delete", { mode: removed.mode });

console.log("smoke-services-crud: PASS");
