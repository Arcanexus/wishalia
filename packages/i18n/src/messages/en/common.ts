import type { CommonMessages } from "../common.js";

export const common: CommonMessages = {
  skipLink: "Skip to content",
  language: {
    label: "Language",
  },
  display: {
    label: "Display, theme and language",
    mode: "Display",
    modes: { device: "As the device", light: "Light", dark: "Dark" },
    theme: "Theme",
    themes: { auto: "Automatic", neutral: "Neutral", christmas: "Christmas" },
    language: "Language",
    text: "Text size",
    texts: { normal: "Normal", large: "Large", larger: "Larger" },
  },
  help: {
    label: "Help",
    guide: "User guide",
    newTab: " (new tab)",
    here: "On this page",
    topics: {
      add: { label: "Add a wish or a series", heading: "Adding a wish" },
      order: { label: "Put your wishes in order", heading: "Putting the wishes in order" },
      share: { label: "Share the list", heading: "Sharing your list" },
      surprise: { label: "How the surprise is kept", heading: "The golden rule: the surprise" },
      occasions: { label: "Occasions", heading: "Occasions" },
      give: { label: "Give a gift", heading: "Giving a gift (for relatives)" },
      display: { label: "Display and text size", heading: "Display, language and app" },
    },
    tip: (about) => `Help: ${about}`,
    more: "Read more in the guide",
  },
  account: {
    menu: (name) => `My account, ${name}`,
    settings: "Account settings",
    lists: "My lists",
    signIn: "Sign in",
    signOut: "Sign out",
  },
  error: {
    title: { notFound: "Not found", other: "Error" },
    somethingWrong: "Something went wrong",
  },
  gallery: {
    open: (title, count) =>
      count > 1 ? `Enlarge the ${count} images of “${title}”` : `Enlarge the image of “${title}”`,
    dialog: (title) => `Images of “${title}”`,
    image: (title, position, count) => (count > 1 ? `${title}, image ${position} of ${count}` : `${title}`),
    position: (position, count) => `Image ${position} of ${count}`,
    show: (position) => `Show image ${position}`,
    previous: "Previous image",
    next: "Next image",
    close: "Close",
  },
  footer: {
    help: "Help: the user guide",
    helpNewTab: " (new tab)",
    version: (version) => `Version ${version}`,
  },
};
