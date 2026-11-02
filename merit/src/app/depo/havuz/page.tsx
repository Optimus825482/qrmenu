import { redirect } from "next/navigation";

/** Catalogue path of the pool screen (MB-ZIM); the page itself lives at /depo/stok. */
export default function DepoHavuzRedirect() {
  redirect("/depo/stok");
}
