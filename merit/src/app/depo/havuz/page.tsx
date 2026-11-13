import { redirect } from "next/navigation";
import { withQuery } from "@/components/staff/backTarget";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Catalogue path of the pool screen (MB-ZIM); the page itself lives at /depo/stok (the query, e.g. the hotel, goes along). */
export default async function DepoHavuzRedirect({ searchParams }: { searchParams: SearchParams }) {
  redirect(withQuery("/depo/stok", await searchParams));
}
