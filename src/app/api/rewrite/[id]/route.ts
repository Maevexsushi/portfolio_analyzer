import { getAnalysis } from "@/lib/history";
import { buildRewritePdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The improved draft as a downloadable, ATS-plain PDF. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAnalysis(id);

  if (!result || result.kind !== "resume" || !result.rewrite) {
    return new Response("There is no improved draft stored for that report.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const pdf = await buildRewritePdf(result.rewrite, result.upload.fileName);
    const base = result.upload.fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9.-]/gi, "-");

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${base}-improved-draft.pdf"`,
        "content-length": String(pdf.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("rewrite pdf export failed", error);
    return new Response("Could not generate the draft PDF.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
