import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fromChips, toChips, variablesIn } from "./merge-fields";

describe("designed email fields", () => {
  it("preserves link and image attributes while converting visible text fields", () => {
    const html = '<a href="{{booking_link}}" title="Review > {{campaign_name}}">Hi {{client_name}}</a><img src="{{site_photo_url}}" alt="{{campaign_name}}">';
    const edited = toChips(html);
    const holder = document.createElement("div");
    holder.innerHTML = edited;
    expect(holder.querySelector("a")?.getAttribute("href")).toBe("{{booking_link}}");
    expect(holder.querySelector("a")?.getAttribute("title")).toBe("Review > {{campaign_name}}");
    expect(holder.querySelector("img")?.getAttribute("src")).toBe("{{site_photo_url}}");
    expect(holder.querySelectorAll("[data-mf]")).toHaveLength(1);
    expect(variablesIn(fromChips(edited))).toEqual(variablesIn(html));
  });

  const collection = JSON.parse(readFileSync(path.resolve("../api/Content/KcaConcepts/concepts.json"), "utf8")) as {
    templates: Array<{ name: string; bodyHtml: string }>;
  };
  it.each(collection.templates)("keeps every link and image field through editing: $name", ({ bodyHtml }) => {
    const restored = fromChips(toChips(bodyHtml));
    const before = document.createElement("div");
    const after = document.createElement("div");
    before.innerHTML = bodyHtml;
    after.innerHTML = restored;
    const attributes = (el: HTMLElement) => Array.from(el.querySelectorAll("a,img"))
      .map(node => [node.getAttribute("href"), node.getAttribute("src")]);
    expect(attributes(after)).toEqual(attributes(before));
    expect(variablesIn(restored)).toEqual(variablesIn(bodyHtml));
  });
});
