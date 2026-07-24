import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDriverReportPayload,
  driverNextStop,
  driverReportEventType,
  driverReportLabel,
} from "./driverMobile.js";

test("driverNextStop returns first stop without depart time", () => {
  const stop = driverNextStop([
    { stopNo: 1, arrivalAt: "2026-07-21T08:00:00.000Z", departAt: "2026-07-21T08:15:00.000Z" },
    { stopNo: 2, arrivalAt: "", departAt: "" },
  ]);

  assert.equal(stop.stopNo, 2);
});

test("driverReportEventType maps quick report types to backend event types", () => {
  assert.equal(driverReportEventType("document"), "document");
  assert.equal(driverReportEventType("waiting"), "expense");
  assert.equal(driverReportEventType("handling"), "expense");
  assert.equal(driverReportEventType("toll"), "expense");
  assert.equal(driverReportEventType("incident"), "incident");
});

test("driverReportLabel returns simple driver-facing labels", () => {
  assert.equal(driverReportLabel("waiting"), "Cho lau");
  assert.equal(driverReportLabel("handling"), "Boc xep");
});

test("buildDriverReportPayload builds payload for current stop", () => {
  const payload = buildDriverReportPayload({
    stopNo: 2,
    reportType: "toll",
    amount: "120000",
    note: "Cau duong",
    attachmentName: "ticket.jpg",
    attachmentDataUrl: "data:image/jpeg;base64,abc",
  });

  assert.deepEqual(payload, {
    stopNo: 2,
    eventType: "expense",
    reportType: "toll",
    amount: "120000",
    note: "Cau duong",
    attachmentName: "ticket.jpg",
    attachmentDataUrl: "data:image/jpeg;base64,abc",
  });
});
