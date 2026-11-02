import { redirect } from "next/navigation";

/** Catalogue path of MB-DOL (K11): the screen itself lives at /depo/doluluk-yukle. */
export default function DolulukRedirect(): never {
  redirect("/depo/doluluk-yukle");
}
