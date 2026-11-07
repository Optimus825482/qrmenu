import { renderOdaServisi, type OdaServisiSearch } from "./renderOdaServisi";

export default async function OdaServisiPage({ searchParams }: { searchParams: Promise<OdaServisiSearch> }) {
  return renderOdaServisi(searchParams);
}
