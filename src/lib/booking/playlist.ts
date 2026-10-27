import {
  bookedHours,
  screenHourKey,
  screenHoursForDate,
  addDays,
  dateRange,
  formatHour,
  type BookingRequest,
} from "./hours";
import { DEFAULT_SETTINGS, type BookingSettings } from "./settings";

export type PlaylistBooking = {
  bookingId: string;
  lengthSeconds: number;
  howOften: number;
  adverts: string[];
};

export type AdvertItem = {
  kind: "advert";
  bookingId: string;
  advert: string;
  start: number;
  seconds: number;
};

export type KcaItem = {
  kind: "kca";
  start: number;
  seconds: number;
};

export type PlaylistItem = AdvertItem | KcaItem;

export type HourPlaylist = {
  items: PlaylistItem[];
  maxDriftSeconds: number;
};

const CELL_SECONDS = 5;
const CELLS_PER_HOUR = 720;
const HOUR_SECONDS = 3600;

type PlannedPlay = {
  booking: PlaylistBooking;
  bookingOrder: number;
  playIndex: number;
  intendedStart: number;
  start: number;
  seconds: number;
};

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function fitsExactly(
  offsetCells: number,
  spacingCells: number,
  lengthCells: number,
  howOften: number,
  occupied: Uint8Array
): boolean {
  for (let play = 0; play < howOften; play += 1) {
    const start = offsetCells + play * spacingCells;
    if (start + lengthCells > CELLS_PER_HOUR) return false;
    for (let cell = start; cell < start + lengthCells; cell += 1) {
      if (occupied[cell]) return false;
    }
  }
  return true;
}

function clashCount(
  offsetCells: number,
  spacingCells: number,
  lengthCells: number,
  howOften: number,
  occupied: Uint8Array
): number {
  let clashes = 0;
  for (let play = 0; play < howOften; play += 1) {
    const start = offsetCells + play * spacingCells;
    for (let cell = start; cell < start + lengthCells; cell += 1) {
      if (occupied[cell]) clashes += 1;
    }
  }
  return clashes;
}

function centreDistance(
  offsetCells: number,
  spacingCells: number,
  lengthCells: number,
  howOften: number,
  occupied: Uint8Array
): number {
  let totalDistance = 0;

  for (let play = 0; play < howOften; play += 1) {
    const start = offsetCells + play * spacingCells;
    let runStart = start;
    let runEnd = start + lengthCells;

    while (runStart > 0 && !occupied[runStart - 1]) runStart -= 1;
    while (runEnd < CELLS_PER_HOUR && !occupied[runEnd]) runEnd += 1;

    const centre = (runStart + runEnd - lengthCells) / 2;
    totalDistance += Math.abs(start - centre);
  }

  return totalDistance / howOften;
}

function markCells(
  offsetCells: number,
  spacingCells: number,
  lengthCells: number,
  howOften: number,
  occupied: Uint8Array
) {
  for (let play = 0; play < howOften; play += 1) {
    const start = offsetCells + play * spacingCells;
    for (let cell = start; cell < start + lengthCells; cell += 1) {
      occupied[cell] = 1;
    }
  }
}

function makePlays(
  booking: PlaylistBooking,
  bookingOrder: number,
  offsetCells: number,
  spacingCells: number
): PlannedPlay[] {
  const plays: PlannedPlay[] = [];

  for (let play = 0; play < booking.howOften; play += 1) {
    const intendedStart =
      offsetCells * CELL_SECONDS + play * spacingCells * CELL_SECONDS;
    plays.push({
      booking,
      bookingOrder,
      playIndex: play,
      intendedStart,
      start: intendedStart,
      seconds: booking.lengthSeconds,
    });
  }

  return plays;
}

function compareIntended(a: PlannedPlay, b: PlannedPlay): number {
  if (a.intendedStart !== b.intendedStart) {
    return a.intendedStart - b.intendedStart;
  }
  if (a.bookingOrder !== b.bookingOrder) {
    return a.bookingOrder - b.bookingOrder;
  }
  return a.playIndex - b.playIndex;
}

function predictMaxDrift(
  existing: PlannedPlay[],
  candidate: PlannedPlay[]
): number {
  const all = [...existing, ...candidate].sort(compareIntended);
  const starts: number[] = [];
  let cursor = 0;

  for (const play of all) {
    const start = Math.max(play.intendedStart, cursor);
    starts.push(start);
    cursor = start + play.seconds;
  }

  if (cursor > HOUR_SECONDS) {
    let limit = HOUR_SECONDS;
    for (let index = all.length - 1; index >= 0; index -= 1) {
      const end = Math.min(starts[index] + all[index].seconds, limit);
      starts[index] = end - all[index].seconds;
      limit = starts[index];
    }
  }

  let maxDrift = 0;
  for (let index = 0; index < all.length; index += 1) {
    const drift = Math.abs(starts[index] - all[index].intendedStart);
    if (drift > maxDrift) maxDrift = drift;
  }

  return maxDrift;
}

function buildItems(plays: PlannedPlay[]): PlaylistItem[] {
  const ordered = [...plays].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.bookingOrder !== b.bookingOrder) {
      return a.bookingOrder - b.bookingOrder;
    }
    return a.playIndex - b.playIndex;
  });

  const items: PlaylistItem[] = [];
  let cursor = 0;

  for (const play of ordered) {
    if (play.start > cursor) {
      items.push({
        kind: "kca",
        start: cursor,
        seconds: play.start - cursor,
      });
    }

    const adverts = play.booking.adverts;
    const advert =
      adverts.length > 0 ? adverts[play.playIndex % adverts.length] : "";

    items.push({
      kind: "advert",
      bookingId: play.booking.bookingId,
      advert,
      start: play.start,
      seconds: play.seconds,
    });
    cursor = play.start + play.seconds;
  }

  if (cursor < HOUR_SECONDS) {
    items.push({
      kind: "kca",
      start: cursor,
      seconds: HOUR_SECONDS - cursor,
    });
  }

  return items;
}

export function hourPlaylist(bookings: PlaylistBooking[]): HourPlaylist {
  if (bookings.length === 0) {
    return {
      items: [{ kind: "kca", start: 0, seconds: HOUR_SECONDS }],
      maxDriftSeconds: 0,
    };
  }

  const ordered = [...bookings].sort((a, b) => {
    if (a.howOften !== b.howOften) return b.howOften - a.howOften;
    if (a.lengthSeconds !== b.lengthSeconds) {
      return b.lengthSeconds - a.lengthSeconds;
    }
    return compareText(a.bookingId, b.bookingId);
  });

  const occupied = new Uint8Array(CELLS_PER_HOUR);
  const plays: PlannedPlay[] = [];
  let overflow = false;

  ordered.forEach((booking, order) => {
    const spacingCells = CELLS_PER_HOUR / booking.howOften;
    const lengthCells = booking.lengthSeconds / CELL_SECONDS;
    let offsetCells = -1;

    if (!overflow) {
      for (let offset = 0; offset < spacingCells; offset += 1) {
        if (
          fitsExactly(
            offset,
            spacingCells,
            lengthCells,
            booking.howOften,
            occupied
          )
        ) {
          offsetCells = offset;
          break;
        }
      }
    }

    if (offsetCells === -1) {
      overflow = true;
      let fewestClashes = Number.POSITIVE_INFINITY;
      for (let offset = 0; offset < spacingCells; offset += 1) {
        const clashes = clashCount(
          offset,
          spacingCells,
          lengthCells,
          booking.howOften,
          occupied
        );
        if (clashes < fewestClashes) fewestClashes = clashes;
      }

      if (fewestClashes === 0) {
        let bestCentreDistance = Number.POSITIVE_INFINITY;
        for (let offset = 0; offset < spacingCells; offset += 1) {
          const clashes = clashCount(
            offset,
            spacingCells,
            lengthCells,
            booking.howOften,
            occupied
          );
          if (clashes !== 0) continue;

          const distance = centreDistance(
            offset,
            spacingCells,
            lengthCells,
            booking.howOften,
            occupied
          );
          if (distance < bestCentreDistance) {
            bestCentreDistance = distance;
            offsetCells = offset;
          }
        }
      } else {
        let bestDrift = Number.POSITIVE_INFINITY;
        for (let offset = 0; offset < spacingCells; offset += 1) {
          const clashes = clashCount(
            offset,
            spacingCells,
            lengthCells,
            booking.howOften,
            occupied
          );
          if (clashes !== fewestClashes) continue;

          const candidate = makePlays(
            booking,
            order,
            offset,
            spacingCells
          );
          const drift = predictMaxDrift(plays, candidate);
          if (drift < bestDrift) {
            bestDrift = drift;
            offsetCells = offset;
          }
        }
      }
    }

    if (offsetCells < 0) offsetCells = 0;

    markCells(
      offsetCells,
      spacingCells,
      lengthCells,
      booking.howOften,
      occupied
    );
    plays.push(...makePlays(booking, order, offsetCells, spacingCells));
  });

  if (!overflow) {
    return {
      items: buildItems(plays),
      maxDriftSeconds: 0,
    };
  }

  const inOrder = [...plays].sort(compareIntended);

  let cursor = 0;
  for (const play of inOrder) {
    play.start = Math.max(play.intendedStart, cursor);
    cursor = play.start + play.seconds;
  }

  const last = inOrder[inOrder.length - 1];
  if (last && last.start + last.seconds > HOUR_SECONDS) {
    let limit = HOUR_SECONDS;
    for (let index = inOrder.length - 1; index >= 0; index -= 1) {
      const play = inOrder[index];
      const end = Math.min(play.start + play.seconds, limit);
      play.start = end - play.seconds;
      limit = play.start;
    }
  }

  let maxDriftSeconds = 0;
  for (const play of inOrder) {
    const drift = Math.abs(play.start - play.intendedStart);
    if (drift > maxDriftSeconds) maxDriftSeconds = drift;
  }

  return {
    items: buildItems(inOrder),
    maxDriftSeconds,
  };
}

export type ScheduledBooking = {
  bookingId: string;
  request: BookingRequest;
  adverts: string[];
};

export type SchedulePlaylist = {
  name: string;
  items: PlaylistItem[];
};

export type ScheduleRow = {
  playlist: string;
  startDate: string;
  endDate: string;
  startHour: number;
  endHour: number;
};

export type Schedule = {
  playlists: SchedulePlaylist[];
  rows: ScheduleRow[];
  playlistsCsv: string;
  scheduleCsv: string;
};

function csvField(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvLine(values: (string | number)[]): string {
  return values.map(csvField).join(",");
}

function buildCsv(schedule: {
  playlists: SchedulePlaylist[];
  rows: ScheduleRow[];
}): Pick<Schedule, "playlistsCsv" | "scheduleCsv"> {
  const playlistLines = [
    csvLine(["playlist", "order", "kind", "advert", "seconds"]),
  ];

  for (const playlist of schedule.playlists) {
    playlist.items.forEach((item, index) => {
      playlistLines.push(
        csvLine([
          playlist.name,
          index + 1,
          item.kind,
          item.kind === "advert" ? item.advert : "",
          item.seconds,
        ])
      );
    });
  }

  const scheduleLines = [
    csvLine([
      "playlist",
      "start date",
      "end date",
      "start time",
      "end time",
    ]),
  ];

  for (const row of schedule.rows) {
    scheduleLines.push(
      csvLine([
        row.playlist,
        row.startDate,
        row.endDate,
        formatHour(row.startHour),
        formatHour(row.endHour),
      ])
    );
  }

  return {
    playlistsCsv: playlistLines.join("\n"),
    scheduleCsv: scheduleLines.join("\n"),
  };
}

export function buildSchedule(
  bookings: ScheduledBooking[],
  fromDate: string,
  toDate: string,
  settings: BookingSettings = DEFAULT_SETTINGS
): Schedule {
  const activeByHour = new Map<string, ScheduledBooking[]>();
  const fromKey = `${fromDate}T00`;

  for (const booking of bookings) {
    for (const hour of bookedHours(booking.request, settings)) {
      if (hour < fromKey || hour.slice(0, 10) > toDate) continue;
      const active = activeByHour.get(hour) ?? [];
      active.push(booking);
      activeByHour.set(hour, active);
    }
  }

  const playlists: SchedulePlaylist[] = [];
  const playlistBySignature = new Map<string, string>();
  const dailyRows: ScheduleRow[] = [];
  let nextPlaylistNumber = 1;

  for (const date of dateRange(fromDate, toDate)) {
    const screenHours = screenHoursForDate(date, settings);
    if (!screenHours) continue;

    let rowStart = screenHours.open;
    let currentPlaylist: string | null = null;

    for (let hour = screenHours.open; hour < screenHours.close; hour += 1) {
      const key = screenHourKey(date, hour);
      const active = [...(activeByHour.get(key) ?? [])].sort((a, b) =>
        compareText(a.bookingId, b.bookingId)
      );
      const signature =
        active.length === 0
          ? "KCA"
          : active.map((booking) => booking.bookingId).join("\u0000");

      let name = playlistBySignature.get(signature);

      if (!name) {
        if (active.length === 0) {
          name = "KCA";
        } else {
          name = `P${String(nextPlaylistNumber).padStart(2, "0")}`;
          nextPlaylistNumber += 1;
        }
        playlistBySignature.set(signature, name);

        const hourResult = hourPlaylist(
          active.map((booking) => ({
            bookingId: booking.bookingId,
            lengthSeconds: booking.request.lengthSeconds,
            howOften: booking.request.howOften,
            adverts: booking.adverts,
          }))
        );
        playlists.push({ name, items: hourResult.items });
      }

      if (currentPlaylist === null) {
        currentPlaylist = name;
        rowStart = hour;
      } else if (currentPlaylist !== name) {
        dailyRows.push({
          playlist: currentPlaylist,
          startDate: date,
          endDate: date,
          startHour: rowStart,
          endHour: hour,
        });
        currentPlaylist = name;
        rowStart = hour;
      }
    }

    if (currentPlaylist !== null) {
      dailyRows.push({
        playlist: currentPlaylist,
        startDate: date,
        endDate: date,
        startHour: rowStart,
        endHour: screenHours.close,
      });
    }
  }

  const rows: ScheduleRow[] = [];
  const latestRowForKey = new Map<string, ScheduleRow>();

  for (const row of dailyRows) {
    const key = `${row.playlist}|${row.startHour}|${row.endHour}`;
    const previous = latestRowForKey.get(key);

    if (previous && previous.endDate === addDays(row.startDate, -1)) {
      previous.endDate = row.endDate;
    } else {
      const saved = { ...row };
      rows.push(saved);
      latestRowForKey.set(key, saved);
    }
  }

  const csv = buildCsv({ playlists, rows });

  return {
    playlists,
    rows,
    playlistsCsv: csv.playlistsCsv,
    scheduleCsv: csv.scheduleCsv,
  };
}
