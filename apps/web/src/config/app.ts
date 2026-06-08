const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "JumpFlow";

/** Derive a short monogram for the brand mark from the configured app name. */
function deriveMonogram(name: string): string {
  const caps = name.replace(/[^A-Z]/g, "");
  if (caps.length >= 2) return caps.slice(0, 2);

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();

  return name.slice(0, 2).toUpperCase();
}

export const appConfig = {
  name: appName,
  monogram: deriveMonogram(appName),
};
