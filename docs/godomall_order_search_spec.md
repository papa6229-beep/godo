# Godomall Order_Search API Spec Export

URL: https://devcenter.godo.co.kr/godomall5/openapi/spec/order_search#dateType
ExportedAt: 2026-06-26T01:12:27.496Z


| 주문 |
| --- |
| 주문조회 API 직접 실행 페이지 |


| 요청 URL |
| --- |
| SANDBOX : http://sbopenhub.godo.co.kr/godomall5/order/Order_Search.php |
| 실제서버 : https://openhub.godo.co.kr/godomall5/order/Order_Search.php |


| 인증 파라미터 |  |  |
| --- | --- | --- |
| 변수명 | Type | 설명 |
| partner_key | STRING | 제휴사 고유키 |
| key | STRING | API 승인시 발급된 사용자 키 |


| 요청 파라미터 |  |  |  |
| --- | --- | --- | --- |
| 변수명 | Type | 필수여부 | 설명 |
| dateType | STRING | Y | 기간검색 타입 코드표 참조 |
| startDate | DATE | N | 주문일 기준 조회 시작일 ※ orderNo가 없는 경우 필수 |
| endDate | DATE | N | 주문일 기준 조회 종료일 ※ orderNo가 없는 경우 필수 |
| orderNo | INTEGER | N | 주문번호 ※ startDate, endDate가 없는 경우 필수 |
| orderStatus | STRING | N | 주문상태 코드 코드표 참조 |
| orderChannel | STRING | N | 주문채널 ※생략 시 전체주문을 가져옵니다. 코드표 참조 |
| searchType | STRING | N | 검색어 검색 타입 코드표 참조 |
| searchKeyword | STRING | N | 검색어 ※ 전화번호 입력시 - 를 포함하여 전송 |
| sort | STRING | N | 주문정렬 ※생략 시 주문번호 내림차순 정렬 코드표 참조 |
| mallSno | INTEGER | N | 상점번호 코드표 참조 |
| size | INTEGER | N | 페이지당 주문 건수 |
| lastOrder | STRING | N | 마지막으로 조회된 주문번호 - size 가 지정된 경우에만 사용 가능 합니다. - 값이 있는 경우, 해당 주문 번호 이후 건들을 조회 합니다. (ex. '2501151716000289' → orderNo < '2501151716000289' 조회) |


| 응답 파라미터 |  |  |
| --- | --- | --- |
| 변수명 | Type | 설명 |
| code | INTEGER | 성공/실패 코드 |
| msg | STRING | 성공 또는 실패사유 |
| lastOrder | STRING | 다음 페이지 존재 여부 (true = 있음, false = 없음) (size 가 지정된 경우에만 응답되는 필드 입니다.) |
| order_data |  |  |
| orderNo | INTEGER | 주문번호 |
| memNo | INTEGER | 회원번호 |
| orderTypeFl | STRING | 주문유형 코드표 참조 |
| apiOrderGoodsNo | INTEGER | 외부채널품목고유번호 |
| orderStatus | STRING | 주문상태 코드 코드표 참조 |
| orderIp | STRING | 주문자IP |
| orderEmail | STRING | 이메일 |
| orderChannelFl | STRING | 주문채널 |
| orderGoodsNm | STRING | 주문상품명 |
| orderGoodsCnt | INTEGER | 주문상품갯수 |
| settlePrice | FLOAT | 총 주문금액 |
| taxSupplyPrice | FLOAT | 최초 총 과세금액 |
| taxVatPrice | FLOAT | 최초 총 부가세 금액 |
| taxFreePrice | FLOAT | 최초 총 면세금액 |
| realTaxSupplyPrice | FLOAT | 실제 총 과세금액(환불제외) |
| realTaxVatPrice | FLOAT | 실제 총 부가세(환불제외) |
| realTaxFreePrice | FLOAT | 실제 총 면세금액(환불제외) |
| useMileage | FLOAT | 주문시 사용한 마일리지 |
| useDeposit | FLOAT | 주문시 사용한 예치금 |
| totalGoodsPrice | FLOAT | 총 상품 금액 |
| totalDeliveryCharge | FLOAT | 총 배송비 |
| totalGoodsDcPrice | FLOAT | 총 상품 할인 금액 |
| totalMemberDcPrice | FLOAT | 총 회원 할인 금액 |
| totalMemberOverlapDcPrice | FLOAT | 총 그룹별 회원 중복할인 금액 |
| totalCouponGoodsDcPrice | FLOAT | 총 상품쿠폰 할인 금액 |
| totalCouponOrderDcPrice | FLOAT | 총 주문쿠폰 할인 금액 |
| totalCouponDeliveryDcPrice | FLOAT | 총 배송쿠폰 할인금액 |
| totalMileage | FLOAT | 총 적립 마일리지 |
| totalGoodsMileage | FLOAT | 총 상품 상품적립 마일리지 |
| totalMemberMileage | FLOAT | 총 회원적립 마일리지 |
| totalCouponGoodsMileage | FLOAT | 총 상품쿠폰 적립 마일리지 |
| totalCouponOrderMileage | FLOAT | 총 주문쿠폰 적립 마일리지 |
| firstSaleFl | STRING | 첫구매 여부 코드표 참조 |
| settleKind | STRING | 주문방법 코드표 참조 |
| multiShippingFl | STRING | 복수배송지 사용여부 (y = 사용, n = 미사용) |
| paymentDt | DATETIME | 입금일자 |
| addField | JSON | 주문추가정보 name : 추가항목명 data : 추가항목 입력값 (입력방법이 order인 경우 Text 타입, goods인 경우 Array 타입) goodsNm : 상품명(goods인 경우 존재함) process : 입력방법(order=공통입력, goods=상품별입력) |
| orderDeliveryData |  | 배송비 정보 |
| orderInfoData |  | 배송지 정보 |
| addGoodsData |  | 추가상품 정보 |
| giftData |  | 사은품 정보 |
| orderGoodsData |  | 주문상품 정보 |
| bankName | STRING | 입금계좌 은행명 ※ 결제방법이 무통장입금, 가상계좌인 경우에만 전달 ※ 간편결제(네이버, 페이코 등)의 무통장입금, 가상계좌는 제외 |
| accountNumber | INTEGER | 입금계좌 계좌번호 ※ bankName이 있는 경우 같이 전달 |
| depositor | STRING | 입금계좌 예금주 ※ bankName이 있는 경우 같이 전달 |
| memId | STRING | 회원아이디 |
| memGroupNm | STRING | 회원그룹명 |
| mallSno | INTEGER | 상점번호 코드표 참조 |
| appOs | STRING | 앱 주문시 휴대폰 OS |
| pushCode | STRING | 앱 주문시 푸시 코드 |
| statisticsAppOrderCntFl | STRING | 주문건수 앱 통계 처리 여부 |
| orderGoodsNmStandard | STRING | 주문 상품명(기준몰) |
| overseasSettleCurrency | STRING | 해외PG 승인금액 적용 환율 코드 |
| overseasSettlePrice | FLOAT | 해외PG 승인금액 (환율변환 적용) |
| totalDeliveryInsuranceFee | FLOAT | 해외배송 EMS 보험료 |
| totalMemberBankDcPrice | FLOAT | 총 회원등급 브랜드 무통장 할인 금액 |
| totalMemberDeliveryDcPrice | FLOAT | 총 회원 배송비 할인 |
| totalMyappDcPrice | FLOAT | 총 마이앱 할인 금액 |
| totalEnuriDcPrice | FLOAT | 총 운영자추가할인 |
| totalDeliveryWeight | FLOAT | 배송 총 무게 |
| currencyPolicy | STRING | 주문당시의 상점통화 기본정책 |
| exchangeRatePolicy | STRING | 주문당시의 환율 기본정책 |
| myappPolicy | STRING | 주문당시의 마이앱 기본정책 |
| adminMemo | STRING | 관리자 메모 |
| pgRealTaxSupplyPrice | FLOAT | 실제 총 PG 과세금액 |
| pgRealTaxVatPrice | FLOAT | 실제 총 PG 부가세 |
| pgRealTaxFreePrice | FLOAT | 실제 총 PG 면세금액 |
| bankdaManualNo | STRING | 뱅크다 번호 |
| bankdaManualFl | STRING | 자동입금수동여부 |
| bankdaManualMangerId | STRING | 자동입금수동처리관리자아이디 |
| trackingKey | STRING | 페이코 쇼핑 트래킹키 |
| userHandleProcess | STRING | 주문 환불/반품/교환 자동 승인 처리 여부 |
| pgChargeBack | STRING | 차지백여부 |
| fbPixelKey | STRING | 페이스북 픽셀 쿠키값 |
| orderInfoData |  |  |
| sno | INTEGER | 배송지 정보 고유번호 ※ order_data > multiShippingFl 가 y (복수배송지 사용) 인 경우 변수 존재 |
| orderInfoCd | INTEGER | 배송지 정보 순번 ※ 기본값 : 1, 복수배송지인 경우 값이 증가함 |
| orderName | STRING | 주문자 이름 |
| orderEmail | STRING | 주문자 이메일 |
| orderPhone | STRING | 주문자 전화번호 |
| orderCellPhone | STRING | 주문자 핸드폰 번호 |
| orderZipcode | STRING | 주문자 우편번호 |
| orderZonecode | STRING | 주문자 새우편번호 |
| orderAddress | STRING | 주문자 주소 |
| orderAddressSub | STRING | 주문자 나머지 주소 |
| receiverName | STRING | 수취인 이름 |
| receiverPhone | STRING | 수취인 전화번호 |
| receiverCellPhone | STRING | 수취인 핸드폰 번호 |
| receiverZipcode | STRING | 수취인 우편번호 |
| receiverZonecode | STRING | 수취인 새우편번호 |
| receiverAddress | STRING | 수취인 주소 |
| receiverAddressSub | STRING | 수취인 나머지 주소 |
| customIdNumber | STRING | 개인통관고유번호 |
| orderMemo | STRING | 주문시 남기는글 |
| receiverUseSafeNumberFl | STRING | 안심번호 상태 n = 사용안함, y = 사용, c = 사용해지, w = 발급대기 |
| receiverSafeNumberDt | DATETIME | 안심번호 발급일시 |
| receiverSafeNumber | STRING | 안심번호 |
| orderPhonePrefixCode | STRING | 주문자 전화번호 국가코드 |
| orderPhonePrefix | INTEGER | 주문자 전화번호 국가번호 |
| orderCellPhonePrefixCode | STRING | 주문자 휴대폰 국가코드 |
| orderCellPhonePrefix | INTEGER | 주문자 휴대폰 국가번호 |
| orderState | STRING | 주문자 주/지방/지역 |
| orderCity | STRING | 주문자 도시 |
| receiverCountryCode | STRING | 수취인 국가 코드 |
| receiverPhonePrefixCode | STRING | 수취인 전화번호 국가코드 |
| receiverPhonePrefix | INTEGER | 수취인 전화번호 국가번호 |
| receiverCellPhonePrefixCode | STRING | 수취인 휴대폰 국가코드 |
| receiverCellPhonePrefix | INTEGER | 수취인 핸드폰 국가번호 |
| receiverCountry | STRING | 수취인 국가 |
| receiverState | STRING | 수취인 주/지방/지역 |
| receiverCity | STRING | 수취인 도시 |
| deliveryVisit | STRING | 배송방법(y:방문배송, n:방문배송제외, a:방문배송포함) |
| visitAddress | STRING | 방문 수령지 주소 |
| visitName | STRING | 방문자명 |
| visitPhone | STRING | 방문자연락처 |
| visitMemo | STRING | 방문수령 메모 |
| packetCode | STRING | 묶음배송코드 |
| smsFl | STRING | SMS 수신동의 여부 |
| orderDeliveryData |  |  |
| scmNo | INTEGER | 공급사 번호 |
| commission | FLOAT | 배송비 수수료율 |
| scmAdjustNo | INTEGER | 공급사 정산고유번호 |
| deliveryCharge | FLOAT | 총 배송비 (지역별 배송비 포함) |
| deliveryPolicyCharge | FLOAT | 총 배송비 (지역별 배송비 제외) |
| deliveryAreaCharge | FLOAT | 총 지역별 배송비 |
| deliveryFixFl | STRING | 배송정책 코드표 참조 |
| deliveryCollectFl | STRING | 배송비 결제방법 코드표 참조 |
| orderInfoSno | INTEGER | 배송지 정보 고유번호 ※ orderInfoData > sno 와 동일한 값 ※ order_data > multiShippingFl 가 y (복수배송지 사용) 인 경우 변수 존재 |
| sno | INTEGER | 일련번호 |
| scmAdjustAfterNo | INTEGER | 공급사 정산 후 환불의 정산 고유 번호 |
| divisionDeliveryUseDeposit | FLOAT | 주문할인 금액의 안분된 예치금 |
| divisionDeliveryUseMileage | FLOAT | 주문할인 금액의 안분된 마일리지 |
| divisionDeliveryCharge | FLOAT | 총 배송비 쿠폰 안분 금액 |
| divisionMemberDeliveryDcPrice | FLOAT | 회원 배송비 무료 안분 금액 |
| deliveryInsuranceFee | FLOAT | EMS배송시 적용되는 해외배송 보험료 |
| deliveryWeightInfo | JSON | 총 배송무게 (상품+박스) |
| overseasDeliveryPolicy | STRING | 주문당시의 해외 배송정책 |
| deliveryCollectPrice | FLOAT | 착불시 발생된 배송비 |
| deliveryWholeFreePrice | FLOAT | 동일 배송비 무료조건시의 배송비 |
| statisticsOrderFl | STRING | 주문/매출 통계 처리 상태 |
| giftData |  |  |
| sno | INTEGER | 주문-사은품 매칭 고유번호 ※ 각각의 주문과 사은품 정보를 하나로 매칭시켜 지급하기 위해 사용 |
| presentTitle | STRING | 사은품지급조건명 |
| giftNo | INTEGER | 사은품번호 |
| giftCd | STRING | 사은품코드 |
| giftNm | STRING | 사은품명 |
| giftCnt | INTEGER | 사은품 지급수량 |
| orderGoodsData |  |  |
| sno | INTEGER | 주문상품 고유번호 |
| orderNo | INTEGER | 주문번호 |
| orderCd | INTEGER | 주문순서 |
| orderGroupCd | INTEGER | 수량 부분취소시 그룹번호 |
| orderStatus | STRING | 주문상태 코드 코드표 참조 |
| invoiceCompanySno | INTEGER | 택배사 번호 |
| invoiceCompany | STRING | 택배사명 |
| invoiceNo | STRING | 송장번호 |
| scmNo | INTEGER | 공급사 번호 |
| commission | FLOAT | 공급사 수수료율 |
| goodsNo | INTEGER | 상품번호 |
| goodsCd | INTEGER | 상품코드 |
| listImageData | STRING | 상품 썸네일 이미지 URL |
| goodsModelNo | STRING | 모델명 |
| goodsNm | STRING | 상품명 |
| goodsCnt | INTEGER | 구매수량 |
| goodsPrice | FLOAT | 상품가격 |
| divisionUseMileage | FLOAT | 주문할인 금액의 안분된 마일리지 |
| divisionGoodsDeliveryUseDeposit | FLOAT | 주문할인 금액의 안분된 배송비 에치금 |
| divisionGoodsDeliveryUseMileage | FLOAT | 주문할인 금액의 안분된 배송비 마일리지 |
| divisionCouponOrderDcPrice | FLOAT | 주문할인 금액의 안분된 주문쿠폰 |
| divisionUseDeposit | FLOAT | 주문할인 금액의 안분된 예치금 |
| divisionCouponOrderMileage | FLOAT | 주문에 지급될 마일리지의 안분된 마일리지 |
| addGoodsPrice | FLOAT | 추가상품금액 |
| optionPrice | FLOAT | 옵션금액 |
| optionTextPrice | FLOAT | 입력옵션금액 |
| fixedPrice | FLOAT | 정가 |
| costPrice | FLOAT | 매입가 |
| goodsDcPrice | FLOAT | 쿠폰할인금액 |
| memberDcPrice | FLOAT | 회원할인금액(추가상품제외) |
| memberOverlapDcPrice | FLOAT | 회원그룹 중복할인 금액(추가상품제외) |
| couponGoodsDcPrice | FLOAT | 상품쿠폰 할인 금액 |
| goodsMileage | FLOAT | 적립마일리지(추가상품제외) |
| memberMileage | FLOAT | 회원 적립마일리지(추가상품제외) |
| couponGoodsMileage | FLOAT | 상품쿠폰 적립 마일리지(추가상품 제외) |
| minusDepositFl | STRING | 사용 예치금 차감여부 코드표 참조 |
| minusRestoreDepositFl | STRING | 사용 예치금 복원여부 코드표 참조 |
| minusMileageFl | STRING | 사용 마일리지 차감 여부 코드표 참조 |
| minusRestoreMileageFl | STRING | 사용 마일리지 복원여부 코드표 참조 |
| plusMileageFl | STRING | 적립 마일리지 차감 여부 코드표 참조 |
| plusRestoreMileageFl | STRING | 적립 마일리지 복원여부 코드표 참조 |
| minusStockFl | STRING | 재고차감 여부 코드표 참조 |
| minusRestoreStockFl | STRING | 재고복원 여부 코드표 참조 |
| optionSno | INTEGER | 상품옵션 고유번호 |
| optionInfo | STRING | 옵션정보 (json 형식) |
| optionTextInfo | STRING | 입력옵션정보 (json 형식) |
| cancelDt | DATETIME | 배송일자 |
| paymentDt | DATETIME | 입금일자 |
| invoiceDt | DATETIME | 송장번호 등록일 |
| deliveryDt | DATETIME | 배송일자 |
| deliveryCompleteDt | DATETIME | 배송완료일자 |
| finishDt | DATETIME | 구매확정일자 |
| claimData |  | 클레임 정보 |
| mallSno | INTEGER | 상점번호 코드표 참조 |
| goodsNmStandard | STRING | 기준몰 상품명 |
| myappDcPrice | FLOAT | 마이앱 할인 금액 (추가상품 제외) |
| apiOrderGoodsNo | INTEGER | 외부채널품목고유번호 |
| optionCostPrice | FLOAT | 옵션 매입가 |
| goodsDeliveryCollectPrice | FLOAT | 상품별 착불시 발생된 배송비 |
| orderDeliverySno | INTEGER | 배송테이블 번호 |
| timeSalePrice | FLOAT | 타임세일 할인 금액 (상품에만 적용) |
| goodsDeliveryCollectFl | STRING | 상품별배송비 결제방법 (pre - 선불, later - 착불) |
| purchaseNo | INTEGER | 매입처 고유번호 |
| brandBankSalePrice | FLOAT | 브랜드 무통장결제 세일 할인 금액 (상품에만 적용) |
| cateAllCd | STRING | 상품에 연결된 전체 카테고리 코드 |
| scmAdjustAfterNo | INTEGER | 공급사 정산 후 환불의 정산 고유 번호 |
| hscode | STRING | hscode |
| goodsType | STRING | 주문상품종류 |
| mileageGiveDt | DATE | 마일리지 지급 유예에 따른 실 지급일 |
| timeSaleFl | STRING | 타임세일 구매 여부 |
| checkoutData | STRING | 간편구매 추가데이터 |
| parentMustFl | STRING | 추가상품 종속성 여부 |
| statisticsOrderFl | STRING | 주문/매출 통계 처리 상태 |
| parentGoodsNo | INTEGER | 부모상품의 상품코드 |
| statisticsGoodsFl | STRING | 상품 통계 처리 상태 |
| sendSmsFl | JSON | 문자발송여부 |
| deliveryMethodFl | STRING | 배송방식 |
| goodsDiscountInfo | STRING | 주문당시상품할인정보 |
| goodsMileageAddInfo | STRING | 주문당시상품적립정보 |
| inflow | STRING | 외부 인입 플랫폼 |
| linkMainTheme | STRING | 메인 상품 진열에서 장바구니 담은 정보 |
| visitAddress | STRING | 방문 수령지 주소 |
| goodsVolume | FLOAT | 상품 용량 |
| couponMileageFl | STRING | 쿠폰으로 적립되는 마일리지 품목별 지급현황 |
| easypayScmReceiptFl | STRING | 이지페이 하위가맹점 등록여부 |
| deliveryScheduleFl | STRING | 배송일정 사용여부 |
| enuri | INTEGER | 에누리 |
| brandCd | STRING | 브랜드코드 |
| addGoodsData |  |  |
| sno | INTEGER | 주문상품 고유번호 |
| addGoodsNo | INTEGER | 추가상품 번호 |
| orderNo | INTEGER | 주문번호 |
| orderCd | INTEGER | 주문순서 |
| parentGoodsNo | INTEGER | 부모상품의 상품코드 |
| orderGroupCd | INTEGER | 수량 부분취소시 그룹번호 |
| orderStatus | STRING | 주문상태 코드 코드표 참조 |
| invoiceCompanySno | INTEGER | 택배사 번호 |
| invoiceCompany | STRING | 택배사명 |
| invoiceNo | STRING | 송장번호 |
| scmNo | INTEGER | 공급사 번호 |
| commission | FLOAT | 공급사 수수료율 |
| goodsCd | INTEGER | 상품코드 |
| listImageData | STRING | 상품 썸네일 이미지 URL |
| goodsModelNo | STRING | 모델명 |
| goodsNm | STRING | 상품명 |
| goodsCnt | INTEGER | 구매수량 |
| goodsPrice | FLOAT | 상품가격 |
| divisionUseMileage | FLOAT | 주문할인 금액의 안분된 마일리지 |
| divisionGoodsDeliveryUseDeposit | FLOAT | 주문할인 금액의 안분된 배송비 에치금 |
| divisionGoodsDeliveryUseMileage | FLOAT | 주문할인 금액의 안분된 배송비 마일리지 |
| divisionCouponOrderDcPrice | FLOAT | 주문할인 금액의 안분된 주문쿠폰 |
| divisionUseDeposit | FLOAT | 주문할인 금액의 안분된 예치금 |
| divisionCouponOrderMileage | FLOAT | 주문에 지급될 마일리지의 안분된 마일리지 |
| addGoodsPrice | FLOAT | 추가상품금액 |
| optionPrice | FLOAT | 옵션금액 |
| optionTextPrice | FLOAT | 입력옵션금액 |
| fixedPrice | FLOAT | 정가 |
| costPrice | FLOAT | 매입가 |
| goodsDcPrice | FLOAT | 쿠폰할인금액 |
| memberDcPrice | FLOAT | 회원할인금액(추가상품제외) |
| memberOverlapDcPrice | FLOAT | 회원그룹 중복할인 금액(추가상품제외) |
| couponGoodsDcPrice | FLOAT | 상품쿠폰 할인 금액 |
| goodsMileage | FLOAT | 적립마일리지(추가상품제외) |
| memberMileage | FLOAT | 회원 적립마일리지(추가상품제외) |
| couponGoodsMileage | FLOAT | 상품쿠폰 적립 마일리지(추가상품 제외) |
| minusDepositFl | STRING | 사용 예치금 차감여부 코드표 참조 |
| minusRestoreDepositFl | STRING | 사용 예치금 복원여부 코드표 참조 |
| minusMileageFl | STRING | 사용 마일리지 차감 여부 코드표 참조 |
| minusRestoreMileageFl | STRING | 사용 마일리지 복원여부 코드표 참조 |
| plusMileageFl | STRING | 적립 마일리지 차감 여부 코드표 참조 |
| plusRestoreMileageFl | STRING | 적립 마일리지 복원여부 코드표 참조 |
| minusStockFl | STRING | 재고차감 여부 코드표 참조 |
| minusRestoreStockFl | STRING | 재고복원 여부 코드표 참조 |
| optionSno | INTEGER | 상품옵션 고유번호 |
| optionInfo | STRING | 옵션정보 (json 형식) |
| optionTextInfo | STRING | 입력옵션정보 (json 형식) |
| cancelDt | DATETIME | 배송일자 |
| paymentDt | DATETIME | 입금일자 |
| invoiceDt | DATETIME | 송장번호 등록일 |
| deliveryDt | DATETIME | 배송일자 |
| deliveryCompleteDt | DATETIME | 배송완료일자 |
| finishDt | DATETIME | 구매확정일자 |
| claimData |  | 클레임 정보 |
| mallSno | INTEGER | 상점번호 코드표 참조 |
| apiOrderGoodsNo | INTEGER | 외부채널품목고유번호 |
| eventSno | INTEGER | 기획전 번호 |
| orderDeliverySno | INTEGER | 배송테이블 번호 |
| purchaseNo | INTEGER | 매입처 고유번호 |
| scmAdjustAfterNo | INTEGER | 공급사 정산 후 환불의 정산 고유 번호 |
| goodsType | STRING | 주문상품종류 |
| timeSaleFl | STRING | 타임세일 구매 여부 |
| parentMustFl | STRING | 추가상품 종속성 여부 |
| goodsNmStandard | STRING | 기준몰 상품명 |
| optionCostPrice | FLOAT | 옵션 매입가 |
| timeSalePrice | FLOAT | 타임세일 할인 금액 (상품에만 적용) |
| brandBankSalePrice | FLOAT | 브랜드 무통장결제 세일 할인 금액 (상품에만 적용) |
| myappDcPrice | FLOAT | 마이앱 할인 금액 (추가상품 제외) |
| goodsDeliveryCollectPrice | FLOAT | 상품별 착불시 발생된 배송비 |
| goodsDeliveryCollectFl | STRING | 상품별배송비 결제방법 (pre - 선불, later - 착불) |
| cateAllCd | STRING | 상품에 연결된 전체 카테고리 코드 |
| hscode | STRING | hscode |
| mileageGiveDt | DATE | 마일리지 지급 유예에 따른 실 지급일 |
| checkoutData | STRING | 간편구매 추가데이터 |
| statisticsOrderFl | STRING | 주문/매출 통계 처리 상태 |
| statisticsGoodsFl | STRING | 상품 통계 처리 상태 |
| sendSmsFl | JSON | 문자발송여부 |
| deliveryMethodFl | STRING | 배송방식 |
| goodsDiscountInfo | STRING | 주문당시상품할인정보 |
| goodsMileageAddInfo | STRING | 주문당시상품적립정보 |
| inflow | STRING | 외부 인입 플랫폼 |
| linkMainTheme | STRING | 메인 상품 진열에서 장바구니 담은 정보 |
| visitAddress | STRING | 방문 수령지 주소 |
| goodsVolume | FLOAT | 상품 용량 |
| couponMileageFl | STRING | 쿠폰으로 적립되는 마일리지 품목별 지급현황 |
| easypayScmReceiptFl | STRING | 이지페이 하위가맹점 등록여부 |
| deliveryScheduleFl | STRING | 배송일정 사용여부 |
| enuri | INTEGER | 에누리 |
| brandCd | STRING | 브랜드코드 |
| claimData |  |  |
| beforeStatus | STRING | 이전 주문상태 주문상태코드 참조 |
| handleMode | STRING | 클레임 모드 코드표 참조 |
| handleCompleteFl | STRING | 처리완료여부 코드표 참조 |
| handleReason | STRING | 클레임 사유 |
| handleDetailReason | STRING | 클레임 상세사유 |
| handleDt | DATETIME | 처리완료일자 |
| refundPrice | FLOAT | 결제 환불금액 |
| refundUseDeposit | FLOAT | 예치금 환불금액 |
| refundUseMileage | FLOAT | 적립금 환원금액 |
| refundDeliveryCharge | FLOAT | 배송비 환불금액 |
| refundCharge | FLOAT | 환불수수료 |
| handleDetailReasonShowFl | STRING | 처리상세사유 출력여부 |
| refundDeliveryUseDeposit | FLOAT | 배송비에 할당된 사용 예치금 환원 |
| refundDeliveryUseMileage | FLOAT | 배송비에 할당된 사용 마일리지 환원 |
| refundDeliveryInsuranceFee | FLOAT | 환불 해외배송 보험료 |
| refundDeliveryCoupon | FLOAT | 취소 배송비쿠폰금액 |
| refundUseDepositCommission | FLOAT | 사용예치금 수수료 |
| refundUseMileageCommission | FLOAT | 사용마일리지 수수료 |
| handleGroupCd | INTEGER | 클레임일회처리당 그룹 |
| regDt | DATETIME | 등록일 |
| exchageInfoData |  | 다른 상품교환 차액정보 |
| exchageInfoData |  |  |
| ehDifferencePrice | FLOAT | 총 차액 |
| ehCancelDeliveryPrice | FLOAT | 취소된 배송비 |
| ehAddDeliveryPrice | FLOAT | 추가된 배송비 |
| ehRefundMethod | STRING | 환불수단 |
| ehRefundName | STRING | 환불예금주 |
| ehRefundBankName | STRING | 환불은행명 |
| ehRefundBankAccountNumber | STRING | 환불계좌번호 |
| ehSettleName | STRING | 추가결제입금자명 |
| ehSettleBankAccountInfo | STRING | 추가결제은행정보 |
| ehEnuri | FLOAT | 에누리 |
| orderConsultData |  |  |
| sno | INTEGER | 요청사항/상담메모 고유번호 |
| orderNo | INTEGER | 주문번호 |
| requestMemo | STRING | 요청사항 |
| consultMemo | STRING | 상담메모 |
| regDt | DATETIME | 등록일 |
| modDt | DATETIME | 수정일 |


| dateType 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| order | 주문일 |
| modify | 수정일 |


| orderStatus 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| o1 | 입금대기 |
| p1 | 결제완료 |
| g1 | 상품준비중 |
| g2 | 구매발주 |
| g3 | 상품입고 |
| g4 | 상품출고 |
| d1 | 배송중 |
| d2 | 배송완료 |
| s1 | 구매확정 |
| c1 | 자동취소 |
| c2 | 품절취소 |
| c3 | 관리자취소 |
| c4 | 고객취소요청 |
| f1 | 결제시도 |
| f2 | 고객결제중단 |
| f3 | 결제실패 |
| f4 | PG 확인요망 |
| b1 | 반품접수 |
| b2 | 반송중 |
| b3 | 반품보류 |
| b4 | 반품회수완료 |
| e1 | 교환접수 |
| e2 | 반송중 |
| e3 | 재배송중 |
| e4 | 교환보류 |
| e5 | 교환완료 |
| r1 | 환불접수 |
| r2 | 환불보류 |
| r3 | 환불완료 |
| z1 | 추가입금대기 |
| z2 | 추가결제완료 |
| z3 | 추가배송중 |
| z4 | 추가배송완료 |
| z5 | 교환추가완료 |


| orderChannel 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| shop | 쇼핑몰 주문 |
| payco | 페이코 주문 |
| naverpay | 네이버페이 주문 |


| searchType 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| orderPhone | 주문자 전화번호 |
| receiverPhone | 수령자 전화번호 |
| orderCellPhone | 주문자 휴대폰번호 |
| receiverCellPhone | 수령자 휴대폰번호 |


| sort 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| orderNo desc | 주문번호 내림차순 |
| orderNo asc | 주문번호 오름차순 |


| mallSno 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| 1 | 기준몰(국내몰) |
| 2 | 영문몰 |
| 3 | 중문몰 |
| 4 | 일문몰 |


| orderTypeFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| pc | PC |
| mobile | 모바일 |
| write | 수기 |


| firstSaleFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| y | 첫구매 |


| settleKind 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| eb | 에스크로 계좌이체 |
| ec | 에스크로 신용카드 |
| ev | 에스크로 가상계좌 |
| fb | 간편결제 계좌이체 |
| fc | 간편결제 신용카드 |
| fh | 간편결제 휴대폰 |
| fp | 간편결제 포인트 |
| fv | 간편결제 가상계좌 |
| fa | 간편결제 무통장입금 |
| gb | 무통장 입금 |
| pb | 계좌이체 |
| pc | 신용카드 |
| ph | 휴대폰 |
| pv | 가상계좌 |
| pk | 간편결제 카카오페이 |
| pl | 간편결제 후불결제 |
| pn | 간편결제 네이버페이 |
| gd | 예치금 |
| gm | 마일리지 |
| gz | 전액할인 |
| gr | 기타 |


| deliveryFixFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| fixed | 고정 |
| free | 무료 |
| price | 가격별 |
| weight | 무게별 |
| count | 수량별 |


| deliveryCollectFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| pre | 선불 |
| later | 착불 |


| minusDepositFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미차감 |
| y | 차감 |


| minusRestoreDepositFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미복원 |
| y | 복원 |


| minusMileageFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미차감 |
| y | 차감 |


| minusRestoreMileageFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미복원 |
| y | 복원 |


| plusMileageFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미차감 |
| y | 차감 |


| plusRestoreMileageFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미복원 |
| y | 복원 |


| minusStockFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| y | 차감 |
| n | 미차감 |


| minusRestoreStockFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| n | 미복원 |
| y | 복원 |


| handleMode 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| r | 환불접수 |
| b | 반품접수 |
| e | 교환접수 |
| z | 교환추가 |
| c | 취소 |


| handleCompleteFl 코드값 |  |
| --- | --- |
| 코드값 | 설명 |
| y | 환불완료 |
| n | 환불접수 |
