export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Eski basili oda etiketleri `/qr/{token}` adresini tasir; misafir sayfasi `/q/{token}`'dur.
 * Oturumsuz ve veritabansiz: yalniz bicim denetimi, sonra kalici yonlendirme.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return new Response("Bulunamadı", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(null, { status: 308, headers: { Location: `/q/${token}` } });
}
