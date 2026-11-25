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
};
