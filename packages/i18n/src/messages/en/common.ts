import type { CommonMessages } from "../common.js";

export const common: CommonMessages = {
  skipLink: "Skip to content",
  mode: {
    names: { device: "as the device", light: "light", dark: "dark" },
    current: (name) => `Display: ${name}`,
    switch: (name, next) => `Display: ${name}. Switch to ${next}`,
  },
  language: {
    label: "Language",
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
