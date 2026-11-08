import { BaseStore, emptyData, type StoreData } from "./base";
import { demoData } from "./demo";
import { todayInNairobi } from "./validation";

export class MemoryStore extends BaseStore {
  readonly mode = "memory" as const;
  // KCA_DEMO_DATA=1 starts the demo with made-up bookings (about 79% of this week sold).
  // KCA_DEMO_DATA=month70 fills the whole calendar month to about 70% instead.
  private data: StoreData = process.env.KCA_DEMO_DATA === "1" ? demoData(todayInNairobi())
    : process.env.KCA_DEMO_DATA === "month70" ? demoData(todayInNairobi(), "month70") : emptyData();
  private queue: Promise<unknown> = Promise.resolve();
  protected async read() { await this.queue; return structuredClone(this.data); }
  protected async transaction<T>(change: (data: StoreData) => T): Promise<T> {
    const work = this.queue.then(() => {
      const next = structuredClone(this.data);
      const result = change(next);
      next.revision++;
      this.data = next;
      return structuredClone(result);
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  async isStaff() { return true; }
  protected async upload() {}
  protected async removeUpload() {}
  protected async fileUrl() { return null; }
}
