function toLocalDateInput(date) {
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toDateInput(value, todayInputValue) {
  if (!value) return todayInputValue();
  return toLocalDateInput(new Date(value));
}

function toTimeInput(value) {
  if (!value) return "";
  return new Date(value).toTimeString().slice(0, 5);
}

export function defaultPlannedDateTime(item = null, todayInputValue) {
  const plan = item?.requiredArrivalAt || "";
  return {
    plannedDate: toDateInput(plan, todayInputValue),
    plannedTime: toTimeInput(plan),
  };
}
