export function routeOptionsForCustomer(rates = [], customerCode = "") {
  const selectedCustomer = String(customerCode || "").trim().toUpperCase();
  if (!selectedCustomer) return [];
  const seen = new Set();
  return rates.reduce((options, rate) => {
    const rateCustomer = String(rate.customer || "").trim().toUpperCase();
    const routeCode = String(rate.route || "").trim().toUpperCase();
    if (rateCustomer !== selectedCustomer || !routeCode || rate.status === "inactive" || seen.has(routeCode)) return options;
    seen.add(routeCode);
    options.push({ customerCode: rateCustomer, routeCode });
    return options;
  }, []);
}
