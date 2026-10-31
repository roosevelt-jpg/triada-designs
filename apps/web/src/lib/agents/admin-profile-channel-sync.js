/**
 * After admin saves a profile photo, best-effort sync to channel surfaces
 * that Meta allows. Never fails the settings save if Graph sync fails.
 */

import {
  getAdminProfileSettings,
  saveAdminProfileSettings,
} from "@/lib/agents/admin-profile-settings";
import { ensureMessengerPersona } from "@/lib/integrations/meta-messenger-persona";
import { syncWhatsAppBusinessProfilePicture } from "@/lib/integrations/whatsapp-business-profile";

const IG_SKIP = {
  ok: false,
  skipped: true,
  reason: "ig_account_photo_only",
  note: "Instagram Messaging has no persona_id / per-message avatar. Customers see the Instagram professional account profile photo only.",
};

/**
 * Sync current (or just-saved) admin avatar to Messenger Personas + WhatsApp
 * business profile. Instagram is always skipped with an honest reason.
 *
 * @param {Partial<import("./admin-profile-settings").AdminProfileSettings>} [profileOverride]
 */
export async function syncAdminProfileToChannels(profileOverride) {
  const current = await getAdminProfileSettings();
  const profile = {
    ...current,
    ...(profileOverride && typeof profileOverride === "object"
      ? profileOverride
      : {}),
  };

  const messenger = await ensureMessengerPersona(profile).catch((err) => ({
    ok: false,
    error: err instanceof Error ? err.message : "messenger_persona_failed",
  }));

  const whatsapp = await syncWhatsAppBusinessProfilePicture(
    profile.avatar_url,
    { synced_url: profile.whatsapp_profile_synced_url },
  ).catch((err) => ({
    ok: false,
    account_level: true,
    error: err instanceof Error ? err.message : "whatsapp_profile_failed",
  }));

  const channel_sync = {
    messenger,
    whatsapp,
    instagram: IG_SKIP,
  };

  const saved = await saveAdminProfileSettings({
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    messenger_persona_id:
      messenger?.ok && messenger.persona_id
        ? String(messenger.persona_id)
        : profile.messenger_persona_id,
    messenger_persona_picture_url:
      messenger?.ok && messenger.profile_picture_url
        ? String(messenger.profile_picture_url)
        : messenger?.ok === false && profile.avatar_url === null
          ? null
          : profile.messenger_persona_picture_url,
    whatsapp_profile_synced_url:
      whatsapp?.ok && whatsapp.profile_picture_url
        ? String(whatsapp.profile_picture_url)
        : profile.whatsapp_profile_synced_url,
    channel_sync,
  });

  return {
    admin_profile: saved,
    channel_sync,
  };
}
