import { BaseStore, emptyData, type StoreData } from "./base";
import { demoData } from "./demo";
import { todayInNairobi } from "./validation";

export class MemoryStore extends BaseStore {
  readonly mode = "memory" as const;
  // KCA_DEMO_DATA=1 starts the demo with made-up bookings (about 79% of this week sold).
  private data: StoreData = process.env.KCA_DEMO_DATA === "1" ? demoData(todayInNairobi()) : emptyData();
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
