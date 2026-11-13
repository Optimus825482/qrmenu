import { redirect } from "next/navigation";
import { withQuery } from "@/components/staff/backTarget";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Catalogue path of MB-DOL (K11): the screen itself lives at /depo/doluluk-yukle (the query, e.g. the hotel, goes along). */
export default async function DolulukRedirect({ searchParams }: { searchParams: SearchParams }): Promise<never> {
  redirect(withQuery("/depo/doluluk-yukle", await searchParams));
}
