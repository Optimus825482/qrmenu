import { testDb } from "./db";
import { hotelId, makeUser } from "./fixtures";

/** Writes `smtp.*` setting rows (hotel row when `hotelCode` is given, else the system row). Synthetic values only. */
export async function setSmtp(
  values: Partial<Record<"host" | "port" | "security" | "user" | "password" | "fromEmail" | "fromName", unknown>>,
  hotelCode?: string,
): Promise<void> {
  const hid = hotelCode ? await hotelId(hotelCode) : null;
  for (const [k, value] of Object.entries(values)) {
    const key = `smtp.${k}`;
    await testDb.setting.deleteMany({ where: { key, hotelId: hid } });
    await testDb.setting.create({ data: { key, hotelId: hid, value: value as never } });
  }
}

export const stubSmtp = (port: number) =>
  setSmtp({ host: "127.0.0.1", port, security: "NONE", user: "", password: "", fromEmail: "noreply@merit.test", fromName: "Merit Royal" });

/** Opens the hotel + settings so report-type mail is allowed for `hotelCode`. */
export async function openMail(hotelCode: string, kind: "report" | "alert" = "report"): Promise<void> {
  await testDb.hotel.update({
    where: { code: hotelCode },
    data: { emailNotifyEnabled: true, emailReportEnabled: true, emailAlertEnabled: true },
  });
  const key = kind === "report" ? "email.reportEnabled" : "email.alertEnabled";
  await testDb.setting.deleteMany({ where: { key, hotelId: null } });
  await testDb.setting.create({ data: { key, hotelId: null, value: true } });
}

export async function mailUser(username: string, roleCode: string, hotelCode: string, optIn = true) {
  const user = await makeUser({ username, roleCode, hotelCode });
  return testDb.user.update({
    where: { id: user.id },
    data: { email: `${username}@merit.test`, emailOptIn: optIn },
  });
}
