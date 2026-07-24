export const TRIP_SCHEDULE_DATE_FIELDS = [
  "plannedDate",
  "point1ArrivalDate",
  "point1DepartDate",
  "point2ArrivalDate",
  "point2DepartDate",
  "point3ArrivalDate",
  "point3DepartDate",
];

export const TRIP_POINT_DATE_FIELDS = TRIP_SCHEDULE_DATE_FIELDS.slice(1);

const TRIP_SCHEDULE_POINTS = [
  { date: "point1ArrivalDate", time: "point1ArrivalTime" },
  { date: "point1DepartDate", time: "point1DepartTime" },
  { date: "point2ArrivalDate", time: "point2ArrivalTime" },
  { date: "point2DepartDate", time: "point2DepartTime" },
  { date: "point3ArrivalDate", time: "point3ArrivalTime" },
  { date: "point3DepartDate", time: "point3DepartTime" },
];

function toLocalDateInput(date) {
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function dateFromTimestamp(value, fallbackDate) {
  if (!value) return fallbackDate;
  return toLocalDateInput(new Date(value)) || fallbackDate;
}

function dateTimeValue(date, time) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return 0;
  const from = new Date(`${fromDate}T00:00:00`).getTime();
  const to = new Date(`${toDate}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
}

export function addDaysToDate(value, days) {
  if (!value) return value;
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return toLocalDateInput(date);
}

export function tripScheduleDatesFromItem(item, plannedDate) {
  return {
    point1ArrivalDate: dateFromTimestamp(item?.point1ArrivalAt, plannedDate),
    point1DepartDate: dateFromTimestamp(item?.point1DepartAt, plannedDate),
    point2ArrivalDate: dateFromTimestamp(item?.point2ArrivalAt, plannedDate),
    point2DepartDate: dateFromTimestamp(item?.point2DepartAt, plannedDate),
    point3ArrivalDate: dateFromTimestamp(item?.point3ArrivalAt, plannedDate),
    point3DepartDate: dateFromTimestamp(item?.point3DepartAt, plannedDate),
  };
}

export function normalizeTripScheduleOrder(form) {
  const next = { ...form };
  let previous = null;

  TRIP_SCHEDULE_POINTS.forEach((point) => {
    const current = dateTimeValue(next[point.date], next[point.time]);
    if (current === null) return;
    if (previous !== null && current < previous.value) {
      next[point.date] = previous.date;
      next[point.time] = previous.time;
      previous = { ...previous };
      return;
    }
    previous = { value: current, date: next[point.date], time: next[point.time] };
  });

  return next;
}

export function adjustTripScheduleDate(form, field, days) {
  const startIndex = TRIP_SCHEDULE_DATE_FIELDS.indexOf(field);
  if (startIndex === -1 || !days) return normalizeTripScheduleOrder(form);

  const next = { ...form };
  TRIP_SCHEDULE_DATE_FIELDS.slice(startIndex).forEach((dateField) => {
    next[dateField] = addDaysToDate(next[dateField], days);
  });

  return normalizeTripScheduleOrder(next);
}

export function setTripScheduleDate(form, field, value) {
  const startIndex = TRIP_SCHEDULE_DATE_FIELDS.indexOf(field);
  if (startIndex === -1) return normalizeTripScheduleOrder(form);

  const next = { ...form };
  const days = daysBetween(next[field], value);
  next[field] = value;

  if (days) {
    TRIP_SCHEDULE_DATE_FIELDS.slice(startIndex + 1).forEach((dateField) => {
      next[dateField] = addDaysToDate(next[dateField], days);
    });
  }

  return normalizeTripScheduleOrder(next);
}
