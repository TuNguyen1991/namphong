const REPORT_EVENT_TYPES = {
  document: "document",
  waiting: "expense",
  handling: "expense",
  toll: "expense",
  incident: "incident",
};

const REPORT_LABELS = {
  document: "Chung tu",
  waiting: "Cho lau",
  handling: "Boc xep",
  toll: "Ve cau duong",
  incident: "Su co",
};

export function driverNextStop(stops = []) {
  return stops.find((stop) => !stop.departAt) || stops[stops.length - 1] || null;
}

export function driverReportEventType(reportType) {
  return REPORT_EVENT_TYPES[reportType] || "incident";
}

export function driverReportLabel(reportType) {
  return REPORT_LABELS[reportType] || "Su co";
}

export function buildDriverReportPayload({
  stopNo,
  reportType,
  amount = "",
  note = "",
  attachmentName = "",
  attachmentDataUrl = "",
}) {
  return {
    stopNo,
    eventType: driverReportEventType(reportType),
    reportType,
    amount: String(amount || "").trim(),
    note: String(note || "").trim(),
    attachmentName: String(attachmentName || "").trim(),
    attachmentDataUrl: String(attachmentDataUrl || "").trim(),
  };
}
