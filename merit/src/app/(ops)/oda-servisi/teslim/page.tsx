import { renderOdaServisi } from "../renderOdaServisi";

/** /oda-servisi/teslim renders the delivery tab directly; the RO-TES gate lives in the shared renderer. */
export default async function TeslimPage() {
  return renderOdaServisi(Promise.resolve({}), "teslim");
}
