import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json } from "../../test/event.ts";
import { chooseImage, cropImage, forgetUpload, removeImage, uploadImage } from "./images.ts";

const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";
const IMAGE = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const path = `/manage/items/${ITEM}/image`;

afterEach(() => vi.unstubAllGlobals());

const withFile = (file?: File) => {
  const formData = new FormData();
  if (file) formData.set("image", file);
  return fakeEvent({ formData }).event;
};

describe("uploadImage", () => {
  it("sends the file's bytes to the API, never what the browser said it is", async () => {
    const api = fakeApi({ [`PUT ${path}`]: () => json({ id: ITEM }) });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", { type: "image/svg+xml" });
    expect(await uploadImage(withFile(file), ITEM)).toEqual({ image: { done: "uploaded" } });
    expect(api.calls[0]?.headers.get("content-type")).toBe("application/octet-stream");
    expect(api.calls[0]?.body).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("refuses no file or a file too heavy without calling the API, and words the API's refusals", async () => {
    const api = fakeApi({
      [`PUT ${path}`]: () => json({ error: "not_an_image" }, 415),
    });
    expect(await uploadImage(withFile(), ITEM)).toMatchObject({
      status: 400,
      data: { image: { error: "no_file" } },
    });
    const heavy = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg");
    expect(await uploadImage(withFile(heavy), ITEM)).toMatchObject({
      status: 413,
      data: { image: { error: "too_heavy" } },
    });
    expect(api.calls).toHaveLength(0);
    const text = new File(["hello"], "a.png");
    expect(await uploadImage(withFile(text), ITEM)).toMatchObject({
      status: 415,
      data: { image: { error: "not_an_image" } },
    });
    fakeApi({ [`PUT ${path}`]: () => json({ error: "FST_ERR_CTP_BODY_TOO_LARGE" }, 413) });
    expect(await uploadImage(withFile(text), ITEM)).toMatchObject({
      data: { image: { error: "too_heavy" } },
    });
  });
});

describe("chooseImage, cropImage, removeImage", () => {
  it("chooses an image, refusing what is not an id", async () => {
    const api = fakeApi({ [`PATCH ${path}`]: () => json({ id: ITEM }) });
    expect(await chooseImage(fakeEvent({ form: { imageId: IMAGE } }).event, ITEM)).toEqual({
      image: { done: "chosen" },
    });
    expect(api.calls[0]?.body).toEqual({ imageId: IMAGE });
    expect(await chooseImage(fakeEvent({ form: { imageId: "x" } }).event, ITEM)).toMatchObject({
      status: 400,
    });
  });

  it("saves a frame, made safe, or the whole image", async () => {
    const api = fakeApi({ [`PATCH ${path}`]: () => json({ id: ITEM }) });
    const framed = await cropImage(
      fakeEvent({ form: { x: "0.8", y: "0.1", width: "0.5", height: "0.5" } }).event,
      ITEM,
    );
    expect(framed).toEqual({ image: { done: "cropped" } });
    expect(api.calls[0]?.body).toEqual({ crop: { x: 0.5, y: 0.1, width: 0.5, height: 0.5 } });
    expect(
      await cropImage(fakeEvent({ form: { x: "0", y: "0", width: "1", height: "1" } }).event, ITEM),
    ).toEqual({
      image: { done: "whole" },
    });
    expect(api.calls[1]?.body).toEqual({ crop: null });
    expect(await cropImage(fakeEvent({ form: { whole: "1" } }).event, ITEM)).toEqual({
      image: { done: "whole" },
    });
    expect(await cropImage(fakeEvent({ form: { x: "a" } }).event, ITEM)).toMatchObject({ status: 400 });
  });

  it("shows no image, and passes the API's refusals on", async () => {
    const api = fakeApi({ [`PATCH ${path}`]: () => json({ id: ITEM }) });
    expect(await removeImage(fakeEvent({ form: {} }).event, ITEM)).toEqual({ image: { done: "removed" } });
    expect(api.calls[0]?.body).toEqual({ imageId: null });
    fakeApi({ [`PATCH ${path}`]: () => json({ error: "images_off" }, 503) });
    expect(await removeImage(fakeEvent({ form: {} }).event, ITEM)).toMatchObject({
      status: 503,
      data: { image: { error: "images_off" } },
    });
    expect(await cropImage(fakeEvent({ form: { whole: "1" } }).event, ITEM)).toMatchObject({ status: 503 });
    expect(await chooseImage(fakeEvent({ form: { imageId: IMAGE } }).event, ITEM)).toMatchObject({
      status: 503,
    });
  });
});

describe("forgetUpload", () => {
  it("removes the owner's image, and says whether the link brings the page's back", async () => {
    let url: string | null = "https://shop.example.com/lampe";
    const api = fakeApi({ [`DELETE ${path}/upload`]: () => json({ id: ITEM, url }) });
    expect(await forgetUpload(fakeEvent({}).event, ITEM)).toEqual({ image: { done: "forgotten" } });
    expect(api.calls[0]?.method).toBe("DELETE");
    url = null;
    expect(await forgetUpload(fakeEvent({}).event, ITEM)).toEqual({ image: { done: "forgotten_no_link" } });
  });

  it("words the API's refusal", async () => {
    fakeApi({ [`DELETE ${path}/upload`]: () => json({ error: "no_upload" }, 404) });
    expect(await forgetUpload(fakeEvent({}).event, ITEM)).toMatchObject({
      status: 404,
      data: { image: { error: "no_upload" } },
    });
  });
});
