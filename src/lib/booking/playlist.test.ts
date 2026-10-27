import { describe, expect, it } from "vitest";
import { dateRange, screenHourKey, weekdayOf } from "./hours";
import { DEFAULT_SETTINGS } from "./settings";
import {
  buildSchedule,
  hourPlaylist,
  type PlaylistBooking,
  type PlaylistItem,
  type ScheduledBooking,
} from "./playlist";

function makeBooking(
  bookingId: string,
  lengthSeconds: number,
  howOften: number,
  adverts: string[] = ["advert"]
): PlaylistBooking {
  return { bookingId, lengthSeconds, howOften, adverts };
}

function advertCounts(items: PlaylistItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== "advert") continue;
    counts.set(item.bookingId, (counts.get(item.bookingId) ?? 0) + 1);
  }
  return counts;
}

function expectFullHour(items: PlaylistItem[]) {
  let cursor = 0;
  for (const item of items) {
    expect(item.start).toBe(cursor);
    expect(item.seconds).toBeGreaterThan(0);
    cursor += item.seconds;
  }
  expect(cursor).toBe(3600);
}

function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("hourPlaylist", () => {
  it("places 18 bookings of 15 seconds at how often 10 with no drift", () => {
    const bookings = Array.from({ length: 18 }, (_, index) =>
      makeBooking(`booking-${index}`, 15, 10)
    );
    const result = hourPlaylist(bookings);

    expect(result.maxDriftSeconds).toBe(0);
    expectFullHour(result.items);

    const counts = advertCounts(result.items);
    for (const booking of bookings) {
      expect(counts.get(booking.bookingId)).toBe(10);
    }
  });

  it("places 54 bookings of 5 seconds at how often 10 with no drift", () => {
    const bookings = Array.from({ length: 54 }, (_, index) =>
      makeBooking(`booking-${index}`, 5, 10)
    );
    const result = hourPlaylist(bookings);

    expect(result.maxDriftSeconds).toBe(0);
    expectFullHour(result.items);

    const counts = advertCounts(result.items);
    for (const booking of bookings) {
      expect(counts.get(booking.bookingId)).toBe(10);
    }
  });

  it("uses three adverts in turn across ten plays", () => {
    const result = hourPlaylist([
      makeBooking("multi", 5, 10, ["A", "B", "C"]),
    ]);

    expectFullHour(result.items);

    const adverts = result.items
      .filter((item) => item.kind === "advert")
      .map((item) => item.advert);
    expect(adverts).toHaveLength(10);
    expect(adverts.filter((advert) => advert === "A")).toHaveLength(4);
    expect(adverts.filter((advert) => advert === "B")).toHaveLength(3);
    expect(adverts.filter((advert) => advert === "C")).toHaveLength(3);
  });

  it("uses one KCA item for an empty hour", () => {
    const result = hourPlaylist([]);
    expect(result.items).toEqual([
      { kind: "kca", start: 0, seconds: 3600 },
    ]);
    expect(result.maxDriftSeconds).toBe(0);
  });

  it("keeps 200 seeded random hours within 60 seconds of drift", () => {
    const lengths = [5, 10, 15, 20, 30];
    const howOftenValues = [1, 2, 4, 6, 10, 20];
    const random = makeRandom(20261102);
    let worstDrift = 0;
    let worstHour = 0;

    for (let hour = 0; hour < 200; hour += 1) {
      const target = 2000 + Math.floor(random() * 701);
      const bookings: PlaylistBooking[] = [];
      let soldSeconds = 0;
      let guard = 0;

      while (soldSeconds < target && guard < 1000) {
        guard += 1;
        const lengthSeconds =
          lengths[Math.floor(random() * lengths.length)];
        const howOften =
          howOftenValues[Math.floor(random() * howOftenValues.length)];
        const seconds = lengthSeconds * howOften;
        if (soldSeconds + seconds > 2700) continue;

        const advertCount = 1 + Math.floor(random() * 3);
        bookings.push(
          makeBooking(
            `hour-${hour}-booking-${bookings.length}`,
            lengthSeconds,
            howOften,
            Array.from(
              { length: advertCount },
              (_, index) => `hour-${hour}-${index}`
            )
          )
        );
        soldSeconds += seconds;
      }

      expect(soldSeconds).toBeGreaterThanOrEqual(2000);
      expect(soldSeconds).toBeLessThanOrEqual(2700);

      const result = hourPlaylist(bookings);
      expectFullHour(result.items);

      const counts = advertCounts(result.items);
      for (const booking of bookings) {
        expect(counts.get(booking.bookingId)).toBe(booking.howOften);
      }

      if (result.maxDriftSeconds > worstDrift) {
        worstDrift = result.maxDriftSeconds;
        worstHour = hour;
      }
    }

    expect(worstDrift, `worst drift ${worstDrift} in hour ${worstHour}`).toBeLessThanOrEqual(60);
  });
});

function scheduleBooking(
  bookingId: string,
  adverts: string[],
  request: ScheduledBooking["request"],
  status: "Approved" | "Live" = "Approved"
): ScheduledBooking & { status: "Approved" | "Live" } {
  return { bookingId, adverts, request, status };
}

describe("buildSchedule", () => {
  const bookings = [
    scheduleBooking(
      "A",
      ["A1"],
      {
        lengthSeconds: 10,
        howOften: 10,
        days: [1],
        blocks: ["morning"],
        startDate: "2026-11-02",
        endDate: "2026-11-02",
      },
      "Approved"
    ),
    scheduleBooking(
      "B",
      ["B1", "B2"],
      {
        lengthSeconds: 5,
        howOften: 20,
        days: [1],
        blocks: ["morning", "midday"],
        startDate: "2026-11-02",
        endDate: "2026-11-02",
      },
      "Live"
    ),
    scheduleBooking(
      "C",
      ["C1"],
      {
        lengthSeconds: 5,
        howOften: 10,
        days: [1, 2],
        blocks: ["morning"],
        startDate: "2026-11-02",
        endDate: "2026-11-03",
      },
      "Approved"
    ),
  ];

  const schedule = buildSchedule(bookings, "2026-11-02", "2026-11-08");

  it("covers every screen hour exactly once", () => {
    for (const date of dateRange("2026-11-02", "2026-11-08")) {
      const weekday = weekdayOf(date);
      const screenHours = DEFAULT_SETTINGS.screenHours[weekday];

      for (
        let hour = screenHours.open;
        hour < screenHours.close;
        hour += 1
      ) {
        const matches = schedule.rows.filter(
          (row) =>
            row.startDate <= date &&
            date <= row.endDate &&
            row.startHour <= hour &&
            hour < row.endHour
        );
        expect(matches, `${screenHourKey(date, hour)}`).toHaveLength(1);
      }
    }
  });

  it("names playlists in order of first appearance", () => {
    expect(schedule.playlists.map((playlist) => playlist.name)).toEqual([
      "P01",
      "P02",
      "KCA",
      "P03",
    ]);
  });

  it("merges matching rows across consecutive dates", () => {
    expect(
      schedule.rows.filter((entry) => entry.playlist === "KCA")
    ).toEqual([
      {
        playlist: "KCA",
        startDate: "2026-11-02",
        endDate: "2026-11-02",
        startHour: 14,
        endHour: 22,
      },
      {
        playlist: "KCA",
        startDate: "2026-11-03",
        endDate: "2026-11-03",
        startHour: 10,
        endHour: 22,
      },
      {
        playlist: "KCA",
        startDate: "2026-11-04",
        endDate: "2026-11-05",
        startHour: 6,
        endHour: 22,
      },
      {
        playlist: "KCA",
        startDate: "2026-11-06",
        endDate: "2026-11-08",
        startHour: 6,
        endHour: 24,
      },
    ]);
  });

  it("writes both CSV tables", () => {
    const playlistLines = schedule.playlistsCsv.split("\n");
    const scheduleLines = schedule.scheduleCsv.split("\n");

    expect(playlistLines[0]).toBe("playlist,order,kind,advert,seconds");
    expect(scheduleLines[0]).toBe(
      "playlist,start date,end date,start time,end time"
    );
    expect(scheduleLines).toHaveLength(schedule.rows.length + 1);
    expect(playlistLines).toHaveLength(
      schedule.playlists.reduce(
        (total, playlist) => total + playlist.items.length,
        1
      )
    );
  });
});
