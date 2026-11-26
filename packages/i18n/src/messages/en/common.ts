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
};
