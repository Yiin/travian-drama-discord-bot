/**
 * Scout results are a link to the in-game report, nothing else.
 * Accept http(s) URLs on the configured server host or any travian.com host.
 */
export function isValidReportLink(input: string, serverKey?: string): boolean {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (serverKey && host === `${serverKey.toLowerCase()}.travian.com`) return true;
  return host === "travian.com" || host.endsWith(".travian.com");
}

export function normalizeReportLink(input: string): string {
  return new URL(input.trim()).toString();
}
