export const DEFAULT_TRANSPORT_FILTERS = {
  customer: "",
  status: "",
  q: "",
  special: "",
  orderType: "",
  createdBy: "",
};

export const REPORT_FILTER_FIELDS = [
  { key: "customerCode", label: "Khách hàng", type: "select", source: "customers" },
  { key: "routeCode", label: "Tuyến", type: "select", source: "routes" },
  { key: "cargoWeight", label: "Tải trọng xe", type: "text" },
  { key: "vehicleType", label: "Loại xe", type: "text" },
  { key: "plannedDate", label: "Ngày kế hoạch", type: "dateRange" },
  { key: "partnerCode", label: "Đơn vị vận tải", type: "select", source: "partners" },
];

export const REPORT_COLUMN_GROUPS = [
  {
    title: "THÔNG TIN CHUYẾN XE",
    columns: [
      { key: "customerCode", label: "Khách hàng" },
      { key: "routeCode", label: "Tuyến" },
      { key: "cargoWeight", label: "Tải trọng xe" },
      { key: "vehicleType", label: "Loại xe" },
      { key: "plannedDate", label: "Ngày kế hoạch" },
      { key: "plannedTime", label: "Giờ kế hoạch" },
      { key: "partnerCode", label: "Đơn vị vận tải" },
      { key: "plateNumber", label: "Biển số xe" },
      { key: "driverName", label: "Lái xe" },
      { key: "driverPhone", label: "SĐT lái xe" },
    ],
  },
  {
    title: "THÔNG TIN VẬN ĐƠN",
    columns: [
      { key: "packageCount", label: "Số kiện" },
      { key: "grossWeight", label: "Trọng lượng" },
    ],
  },
  {
    title: "THỜI GIAN THỰC HIỆN",
    columns: [
      { key: "point1ArrivalAt", label: "Điểm 1 đến" },
      { key: "point1DepartAt", label: "Điểm 1 rời" },
      { key: "point2ArrivalAt", label: "Điểm 2 đến" },
      { key: "point2DepartAt", label: "Điểm 2 rời" },
      { key: "point3ArrivalAt", label: "Điểm 3 đến" },
      { key: "point3DepartAt", label: "Điểm 3 rời" },
    ],
  },
  {
    title: "PHỤ PHÍ",
    columns: [
      { key: "handlingFee", label: "Phí bốc xếp" },
      { key: "otherFees", label: "Phụ phí khác" },
      { key: "totalSurcharge", label: "Tổng phụ phí" },
    ],
  },
];

export const REPORT_COLUMNS = REPORT_COLUMN_GROUPS.flatMap((group) => group.columns);