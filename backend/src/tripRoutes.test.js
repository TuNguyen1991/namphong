import test from "node:test";
import assert from "node:assert/strict";
import { ensureTripRoute, tripRouteFields } from "./tripRoutes.js";

test("ensureTripRoute creates a catalog route from a transport-rate-only trip route", () => {
  const store = {
    routes: [],
    transportRates: [{ customer: "ALSE", route: "VSIP BAC NINH - QUE VO", km: "24" }],
  };

  const route = ensureTripRoute(store, {
    customerCode: "ALSE",
    routeCode: "VSIP BAC NINH - QUE VO",
  });

  assert.equal(route.id, 1);
  assert.equal(route.customerCode, "ALSE");
  assert.equal(route.routeCode, "VSIP BAC NINH - QUE VO");
  assert.equal(route.from, "VSIP BAC NINH");
  assert.equal(route.to, "QUE VO");
  assert.equal(route.via, "");
  assert.equal(route.km, 24);
  assert.equal(route.type, "import");
  assert.equal(store.routes[0], route);
});

test("ensureTripRoute prefers an existing route for the same customer and route code", () => {
  const existing = {
    id: 7,
    customerCode: "ALSE",
    routeCode: "VSIP BAC NINH - QUE VO",
    from: "VSIP",
    to: "QUE VO",
    via: "",
    km: 25,
    type: "domestic",
  };
  const store = {
    routes: [existing],
    transportRates: [{ customer: "ALSE", route: "VSIP BAC NINH - QUE VO", km: "24" }],
  };

  const route = ensureTripRoute(store, {
    customerCode: "ALSE",
    routeCode: "VSIP BAC NINH - QUE VO",
  });

  assert.equal(route, existing);
  assert.equal(store.routes.length, 1);
});

test("ensureTripRoute matches transport rates accent-insensitively", () => {
  const store = {
    routes: [],
    transportRates: [{ customer: "ALSE", route: "VSIP BAC NINH - QUE VO", km: "24" }],
  };

  const route = ensureTripRoute(store, {
    customerCode: "ALSE",
    routeCode: "VSIP BẮC NINH - QUẾ VÕ",
  });

  assert.equal(route.routeCode, "VSIP BẮC NINH - QUẾ VÕ");
  assert.equal(route.km, 24);
});

test("ensureTripRoute matches existing routes with extra route spacing", () => {
  const existing = {
    id: 12,
    customerCode: "ALSE",
    routeCode: "VSIP BAC NINH -  QUE VO",
    from: "VSIP BAC NINH",
    to: "QUE VO",
    via: "",
    km: 24,
    type: "import",
  };
  const store = {
    routes: [existing],
    transportRates: [],
  };

  const route = ensureTripRoute(store, {
    customerCode: "ALSE",
    routeCode: "VSIP BAC NINH - QUE VO",
  });

  assert.equal(route, existing);
  assert.equal(store.routes.length, 1);
});

test("tripRouteFields persists the catalog route code over the edited input text", () => {
  const fields = tripRouteFields(
    {
      customerCode: "ALSE",
      routeCode: "VSIP BAC NINH -  QUE VO",
      from: "VSIP BAC NINH",
      to: "QUE VO",
      via: "",
      km: 24,
      type: "import",
    },
    {
      customerCode: "ALSE",
      routeCode: "VSIP BAC NINH - QUE VO",
    },
  );

  assert.equal(fields.customerCode, "ALSE");
  assert.equal(fields.routeCode, "VSIP BAC NINH -  QUE VO");
  assert.equal(fields.from, "VSIP BAC NINH");
  assert.equal(fields.to, "QUE VO");
  assert.equal(fields.km, 24);
});
