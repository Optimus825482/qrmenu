import type { Ctx } from "@/lib/auth";
import { actionsByScreen } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import type { SettingKey } from "@/lib/settings-defs";
import { settingSentence } from "@/components/guide/settingSentences";
import { GENERIC_ACTION_TEXT, guideFor } from "../screenGuide";
import { SCREENS } from "../screens";

export type HelpContent = {
  code: string;
  name: string;
  purpose: string;
  /** "Burada yapabileceklerin": only the actions the user holds on this screen. */
  abilities: string[];
  /** Steps the user is permitted to see (a step's `requires` must be among the user's actions). */
  steps: { title: string; body: string }[];
  mistakes: string[];
  /** Current setting values as sentences. */
  settings: string[];
};

/**
 * Help sheet content for one screen, for the signed-in user: nothing is described that the user
 * cannot do (no `V` -> null) and setting sentences reflect the values in force NOW for the hotel.
 */
export async function helpFor(ctx: Ctx, code: string): Promise<HelpContent | null> {
  const screen = SCREENS.find((s) => s.code === code);
  if (!screen) return null;
  const hotelId = ctx.session.hotelId;
  const actions = (await actionsByScreen(ctx.user.roleId, hotelId)).get(code);
  if (!actions) return null;

  const guide = guideFor(code);
  const keys = (guide.settings ?? []) as SettingKey[];
  const values = keys.length > 0 ? await getSettings(keys, hotelId) : ({} as Record<string, unknown>);
  const settings: string[] = [];
  for (const key of keys) {
    const sentence = settingSentence(key, (values as Record<string, unknown>)[key]);
    if (sentence) settings.push(sentence);
  }

  return {
    code,
    name: screen.name,
    purpose: guide.purpose,
    abilities: actions.map((a) => guide.actions?.[a] ?? GENERIC_ACTION_TEXT[a]),
    steps: guide.steps
      .filter((s) => !s.requires || s.requires.every((a) => actions.includes(a)))
      .map((s) => ({ title: s.title, body: s.body })),
    mistakes: guide.mistakes,
    settings,
  };
}
