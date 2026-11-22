/**
 * Title and Open Graph tags of the public pages. They are the same for every page on purpose:
 * a link preview in a chat must never tell the owner what was taken or funded (spec, section 3).
 * Nothing here may take a list, an item or a contribution as input.
 */
export interface PageMeta {
  title: string;
  description: string;
  "og:title": string;
  "og:description": string;
  "og:type": "website";
}

export function genericMeta(appName: string): PageMeta {
  const title = `${appName} · une liste de souhaits`;
  const description = "Une liste de souhaits partagée avec vous.";
  return { title, description, "og:title": title, "og:description": description, "og:type": "website" };
}
