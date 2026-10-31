import { DomainError } from "@/lib/result";
import { readUpload } from "@/lib/uploads";

/** Serves files saved with saveUpload (menu images). Only image types; file names carry a content hash. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  try {
    const file = await readUpload(segments.join("/"));
    if (!file) return new Response("Not found", { status: 404 });
    const headers: Record<string, string> = {
      "content-type": file.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    };
    // SVG can carry script: serve it inert (no scripts, no network, sandboxed) if opened directly.
    if (file.contentType === "image/svg+xml") {
      headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    return new Response(new Uint8Array(file.data), { headers });
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
