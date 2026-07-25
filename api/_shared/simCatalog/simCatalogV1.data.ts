// ────────────────────────────────────────────────────────────────────────────
// SIMULATION-CATALOG-BASELINE-01 — 시험용 상품 기준선 v1 (원시 데이터)
//
// 신분: **시험 데이터(test mall)** — 실제 판매 자료가 아니다.
// 용도: 가상 운영시험(2년치 합성 주문·매출·재고) **전용** 상품 원천.
// 경계(불변): 실제 products/inventory 응답·실재고에 절대 주입하지 않는다.
//   새 판매몰 상품/재고가 들어와도 v1 을 자동 변경·혼합·덮어쓰기하지 않는다.
//   향후 변경은 별도 v2 + 승인 작업으로만 가능하다.
//
// ⚠️ 이 파일은 **데이터**다. 로더(simCatalogV1.ts)가 스키마·무결성을 검증하고 동결한다.
//    손수 편집하면 로더가 fail-closed 로 거부한다(integrity 불일치).
//
// 확보: /api/godomall/products (Production, sourceType api_proxy_real) — 시험몰 만료 직전.
// 포함 필드: 상품 마스터 19종만. 고객·주문·문의·리뷰·전화·이메일·주소·API키·secret·
//   cookie·인증정보·실재고값은 포함하지 않는다.
// ────────────────────────────────────────────────────────────────────────────

/** 시험용 상품 기준선 원시 레코드(상품 마스터 필드만 — 실재고 제외). */
export interface SimCatalogRawRecord {
  productId: string;
  productCode: string;
  productName: string;
  price: number;
  fixedPrice: number;
  categoryCode: string;
  allCategoryCode: string;
  brandCode: string;
  makerName: string;
  originName: string;
  optionName: string;
  sellPc: boolean;
  sellMobile: boolean;
  displayPc: boolean;
  displayMobile: boolean;
  soldOut: boolean;
  stockEnabled: boolean;
  registeredAt: string;
  modifiedAt: string;
}

export interface SimCatalogManifest {
  catalogId: string;
  schemaVersion: number;
  datasetKind: 'simulation';
  dataIdentity: string;
  recordCount: number;
  /** 필드 순서 고정 canonical JSON 의 FNV-1a 32bit 해시. 로더가 재계산해 대조(변조 감지). */
  integrity: string;
  fields: readonly string[];
  excludes: string;
  capturedFrom: string;
}

export const SIM_CATALOG_V1_MANIFEST: SimCatalogManifest = {
  catalogId: 'sim-catalog-v1',
  schemaVersion: 1,
  datasetKind: 'simulation',
  dataIdentity: '시험 데이터(test mall) — 실제 자료 아님',
  recordCount: 13,
  integrity: "fnv1a32:e173b6d0",
  fields: ["productId","productCode","productName","price","fixedPrice","categoryCode","allCategoryCode","brandCode","makerName","originName","optionName","sellPc","sellMobile","displayPc","displayMobile","soldOut","stockEnabled","registeredAt","modifiedAt"],
  excludes: '고객·주문·문의·리뷰·전화·이메일·주소·API키·secret·cookie·인증정보·실재고값',
  capturedFrom: '/api/godomall/products (Production, sourceType api_proxy_real)'
};

/** 시험용 상품 기준선 v1 — 13개 원시 레코드. 필드 순서 고정(integrity 대조 기준). */
export const SIM_CATALOG_V1_RECORDS: readonly SimCatalogRawRecord[] = [
  {"productId":"1000000012","productCode":"","productName":"테스트상품","price":111,"fixedPrice":111,"categoryCode":"","allCategoryCode":"","brandCode":"","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-23 15:55:27","modifiedAt":"2026-06-23 15:55:27"},
  {"productId":"1000000011","productCode":"","productName":"스마트 에어 공기청정기","price":19800,"fixedPrice":22000,"categoryCode":"001","allCategoryCode":"001|006|009","brandCode":"002","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000010","productCode":"","productName":"스마트 에코 음식물처리기","price":25650,"fixedPrice":28500,"categoryCode":"001","allCategoryCode":"001|006|009","brandCode":"002","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000009","productCode":"","productName":"스마트 무선 청소기","price":28800,"fixedPrice":32000,"categoryCode":"006","allCategoryCode":"006|009","brandCode":"002","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000008","productCode":"","productName":"대용량 에어 가습기","price":19800,"fixedPrice":22000,"categoryCode":"006","allCategoryCode":"006|009","brandCode":"002","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000007","productCode":"","productName":"스마트 에코 밥솥","price":32040,"fixedPrice":35600,"categoryCode":"001","allCategoryCode":"001|006|008","brandCode":"002","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000006","productCode":"","productName":"스텐 에어프라이기","price":31500,"fixedPrice":35000,"categoryCode":"003","allCategoryCode":"003|003002|008","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000005","productCode":"","productName":"스마트 에어프라이어","price":18000,"fixedPrice":20000,"categoryCode":"003","allCategoryCode":"003|003002|008","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000004","productCode":"","productName":"파워 스마트 믹서기","price":13500,"fixedPrice":15000,"categoryCode":"003","allCategoryCode":"003|003002|008","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000003","productCode":"","productName":"스마트 에어 히터","price":16200,"fixedPrice":18000,"categoryCode":"001","allCategoryCode":"001|003|003001|007","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000002","productCode":"","productName":"스텐 미니 가습기","price":40500,"fixedPrice":45000,"categoryCode":"001","allCategoryCode":"001|003|003001|007","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000001","productCode":"","productName":"에어 파워 드라이기","price":27000,"fixedPrice":30000,"categoryCode":"001","allCategoryCode":"001|004|007","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"},
  {"productId":"1000000000","productCode":"","productName":"에코 무소음 선풍기","price":13500,"fixedPrice":15000,"categoryCode":"001","allCategoryCode":"001|004|007","brandCode":"001","makerName":"","originName":"","optionName":"","sellPc":true,"sellMobile":true,"displayPc":true,"displayMobile":true,"soldOut":false,"stockEnabled":false,"registeredAt":"2026-06-22 13:53:23","modifiedAt":"2026-06-22 13:53:23"}
];
