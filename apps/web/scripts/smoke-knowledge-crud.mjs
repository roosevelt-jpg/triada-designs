/**
 * Smoke: knowledge catalog CRUD (FAQ/policy + training via knowledge API).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-knowledge-crud.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  deleteKnowledge,
  getKnowledge,
  listKnowledge,
  upsertKnowledge,
} from "@/lib/knowledge/knowledge-store.js";
import {
  deleteTrainingDoc,
  listTrainingDocs,
  upsertTrainingDoc,
} from "@/lib/training/training-docs-store.js";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir.js";

const localFile = path.join(getLocalDataDir(), "knowledge-sources.json");
try {
  await unlink(localFile);
} catch {
  /* ok if missing */
}

const listed0 = await listKnowledge();
console.log("ok list knowledge", {
  mode: listed0.mode,
  count: listed0.data.length,
});

const created = await upsertKnowledge({
  title: "Smoke materials FAQ",
  source_type: "faq",
  status: "published",
  body: "14k gold plated — smoke",
  tags: "materials, smoke",
});
if (!created.knowledge?.id || !created.created) {
  throw new Error(`create failed: ${JSON.stringify(created)}`);
}
console.log("ok create faq", { id: created.knowledge.id, mode: created.mode });

const updated = await upsertKnowledge({
  id: created.knowledge.id,
  title: "Smoke materials FAQ updated",
  source_type: "policy",
  status: "draft",
  body: "Updated smoke body",
  tags: "materials",
});
if (updated.created || updated.knowledge.title !== "Smoke materials FAQ updated") {
  throw new Error(`update failed: ${JSON.stringify(updated)}`);
}
console.log("ok update faq", {
  type: updated.knowledge.source_type,
  status: updated.knowledge.status,
});

const got = await getKnowledge(created.knowledge.id);
if (!got || got.status !== "draft") {
  throw new Error(`get failed: ${JSON.stringify(got)}`);
}
console.log("ok get faq");

const removed = await deleteKnowledge(created.knowledge.id);
if (!removed.ok) throw new Error(`delete failed: ${JSON.stringify(removed)}`);
if (await getKnowledge(created.knowledge.id)) {
  throw new Error("faq still present after delete");
}
console.log("ok delete faq", { mode: removed.mode });

const training = await upsertTrainingDoc({
  title: "Smoke training tone",
  category: "tone",
  body: "Warm smoke tone guidance",
  tags: "tone, smoke",
  status: "published",
});
if (!training.doc?.id) {
  throw new Error(`training create failed: ${JSON.stringify(training)}`);
}
console.log("ok create training", {
  id: training.doc.id,
  storage: training.storage,
});

const listedTraining = await listTrainingDocs();
if (!listedTraining.data.some((d) => d.id === training.doc.id)) {
  throw new Error("training missing from list");
}

const delTraining = await deleteTrainingDoc(training.doc.id);
if (!delTraining.ok) {
  throw new Error(`training delete failed: ${JSON.stringify(delTraining)}`);
}
console.log("ok delete training", { storage: delTraining.storage });

console.log("smoke-knowledge-crud: PASS");
