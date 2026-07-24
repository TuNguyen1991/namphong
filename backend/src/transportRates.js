function transportRateKey(rate = {}) {
  return `${String(rate.customer || "").trim().toUpperCase()}|||${String(rate.route || "").trim().toUpperCase()}`;
}

export function findTransportRateIndex(rates = [], target = {}) {
  const key = transportRateKey(target);
  if (key === "|||") return -1;
  return rates.findIndex((rate) => transportRateKey(rate) === key);
}

export function upsertTransportRate(rates = [], rate, nextId) {
  const existingIndex = findTransportRateIndex(rates, rate);
  if (existingIndex >= 0) {
    Object.assign(rates[existingIndex], rate, { id: rates[existingIndex].id });
    return { rate: rates[existingIndex], created: false };
  }

  rate.id = nextId(rates);
  rates.push(rate);
  return { rate, created: true };
}
