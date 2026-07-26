import { getAnalysis } from "@/lib/history";
import { buildReportPdf } from "@/lib/pdf";
import { hostnameOf } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Streams the stored analysis as a downloadable PDF report. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getAnalysis(id);

  if (!result) {
    return new Response("That analysis is no longer stored.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const pdf = await buildReportPdf(result);
    const stamp = result.analyzedAt.slice(0, 10);
    const subject =
      result.kind === "website"
        ? hostnameOf(result.finalUrl)
        : result.upload.fileName.replace(/\.[^.]+$/, "");
    const prefix = result.kind === "resume" ? "resume-report" : "portfolio-report";
    const filename = `${prefix}-${subject.replace(/[^a-z0-9.-]/gi, "-")}-${stamp}.pdf`;

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(pdf.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("pdf export failed", error);
    return new Response("Could not generate the PDF report.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
