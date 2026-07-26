import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Packages that must not be bundled.
   *
   * tesseract.js resolves its worker script from its own `__dirname` at runtime. Once
   * bundled, that path becomes an artefact of the build (`C:\ROOT\node_modules\...`),
   * the worker never starts, and an image upload hangs until the request times out
   * rather than failing. unpdf ships a prebuilt pdf.js worker with the same property.
   */
  serverExternalPackages: ["cheerio", "tesseract.js", "unpdf"],
};

export default nextConfig;
