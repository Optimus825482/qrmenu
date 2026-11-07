import { renderOdaServisi } from "../renderOdaServisi";

/** /oda-servisi/teyit renders the confirmation tab directly; the RO-TEL gate lives in the shared renderer. */
export default async function TeyitPage() {
  return renderOdaServisi(Promise.resolve({}), "teyit");
}
