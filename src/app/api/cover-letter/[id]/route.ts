import { getAnalysis } from "@/lib/history";
import { buildCoverLetterPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The drafted cover letter as a downloadable PDF. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAnalysis(id);

  if (!result || result.kind !== "resume" || !result.coverLetterDraft) {
    return new Response("There is no cover letter draft stored for that report.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const pdf = await buildCoverLetterPdf(result.coverLetterDraft, result.upload.fileName);
    const base = result.upload.fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9.-]/gi, "-");

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${base}-cover-letter.pdf"`,
        "content-length": String(pdf.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("cover letter pdf export failed", error);
    return new Response("Could not generate the cover letter PDF.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
