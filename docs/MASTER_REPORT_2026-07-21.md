# MASTER REPORT — 2026-07-21

> 전일: `MASTER_REPORT_2026-07-16.md` (기본형 Phase 2 완성·main 확정)
> 기준 감사 문서: `AUDIT_BASELINE_2026-07-21.md` (DRAFT, main 소재)
> 계약 문서: `CONTRACT_DRAFT_RC1_METRICS.md` (기능 브랜치 소재)

이 문서는 **결론 모음이 아니라 포인터 + 검증법 + 열린 질문**이다.
숫자·상태를 인용하기 전에 아래 "재확인 명령"을 먼저 실행해 원본을 다시 관측할 것.

---

## 1. 오늘 무엇을 했나

전면 감사(Phase A) → 근본원인 대장(Phase B) → **SEC-03 긴급 보안 수정**(main 반영) →
**RC-1 지표 정합성 1차**(기능 브랜치) → 브랜치 교차검증 → Preview 배포·실검증.

핵심 성격: **계산 정의 통일**이다. 새 기능 추가가 아니다.

---

## 2. 종료 상태 (2026-07-21)

| 항목 | 값 |
|---|---|
| 작업 브랜치 | `fix/rc-1-metric-parity` |
| HEAD | `9b635e6e8ef48b2e4fd218d9284455403f92acf8` |
| 원격 | push 완료 (`origin/fix/rc-1-metric-parity` 동일 해시) |
| main | `716f5881bac22b16b9c83d2405ca4db52afa8f3a` — **미병합, 오늘 변경 없음** |
| Production 승격 | 없음 |
| 작업 트리 | clean |
| 브랜치 규모 | 28 커밋 / 19 파일 / +2,149 −84 |

> 이 문서 커밋으로 HEAD가 1칸 전진한다(docs 전용, 소스 0파일).
> 내일 첫 작업의 "현재 HEAD"는 그 docs 커밋이며, **위 `9b635e6`가 코드 기준선**이다.

---

## 3. 완료된 검증 (근거)

### 로컬
- 지표 정합성 하네스 `scripts/smoke-metric-definition-parity-v0.mjs` — **163 pass / 0 fail / 0 skip** (exit 0)
- 필수 스모크 **81개 전부 통과**, `flowRouteSmoke` PASS
- `tsc -b` exit 0 · `npm run build` ✓
- `git diff --check` OK · 제어문자 가드 PASS
- eslint **신규 0** (기존 1건: `scripts/flowRouteSmoke.ts:49 Unexpected any`)

### Preview — 배포 무결성 (도구 검증)
- 배포 JS/CSS가 로컬 `npm run build` 산출물과 **바이트 단위 완전 일치**
  (`index-CcKJDmnU.js`, `index-Dh-pGCIC.css`) → 배포 코드 = 검증한 코드
- 정적 자산 200 · 빌드 오류 페이지 없음

### Preview — SEC-03 API 실검증
| 요청 | 결과 |
|---|---|
| 메타데이터 IP `169.254.169.254` | **400** `허용되지 않은 이미지 호스트입니다` |
| 비허용 도메인 `example.com` | **400** 동일 |
| `url` 누락 | **400** `url 쿼리가 필요합니다` |
| 허용 CDN `cdn-banana.bizhost.kr` (없는 파일) | **422** 상류 실패 정상 처리 |

### Preview — 브라우저 실동작 (독립 검증)
- 첫 화면·부서 이동 정상
- 마케팅/상품관리 대시보드 정상
- **마케팅팀과 상품팀 공통 수치 일치: 매출 88,116,982원 / 주문 1,182건**
- **첫구매 311건·20,384,132원 + 재구매 871건·67,732,850원 = 전체 일치**
- 객단가 분석 정상
- 미분류 0건일 때 **빈 셀·0원 막대 없음** (C-8 핵심 위험 해소 확인)
- 채팅 3종 정상
  1. `첫구매와 재구매 매출 비교`
  2. `2025년 카테고리별 판매수량 비중` → **'개' 단위** (C-5)
  3. `2025년 매출 알려줘` → **불필요한 미분류 경고 없음**
- 상품팀 회귀 없음 · 콘솔 빨간 오류 **0건** · 모바일 콘텐츠 카드 정상

---

## 4. 병합 전 남은 결함 1건 (내일 첫 작업)

**증상**: 마케팅 대시보드 '카테고리 매출 TOP'에 내부 키 `uncategorized`가 사용자 화면에 그대로 노출.

**원인 위치 (실측)**: `src/services/marketingAnalysisFacts.ts:458-459`
```ts
const catCode  = str(l.categoryCode) || str(meta?.categoryCode) || 'uncategorized';
const catLabel = str(l.categoryLabel) || catCode;   // ← 폴백이 내부 키를 그대로 label로 승격
```

**C-1 계약**: 내부 key = `uncategorized` / 화면 label = `미분류`

**수정 범위 (엄격)**
- key는 `uncategorized` **그대로 유지**
- **label만** `미분류`로 변환
- productIndex 재조인 **금지**, 계산식 변경 **금지**, 기타 리팩터링 **금지**

**성격**: 표시 결함. 계산 오류 아님, 긴급 아님.

---

## 5. 별도 백로그 (이번 브랜치에 섞지 말 것)

| # | 항목 | 근거 |
|---|---|---|
| UI-1 | 모바일 상단 메뉴 일부가 화면 밖으로 잘려 접근 어려움 | **Production에서도 동일** → 이번 브랜치 회귀 아님 |
| DEBT-1 | Tailwind CDN 사용 경고 (콘솔 1건) | 기존 기술부채 |

---

## 6. 내일 작업 순서

1. 브랜치·HEAD·clean·main 미병합 상태 재확인
2. `uncategorized` 표시 결함을 **테스트에서 먼저 재현**(RED)
3. 내부 key 유지 + 화면 label만 `미분류`로 바꾸는 **최소 수정**
4. productIndex 재조인·계산식·기타 리팩터링 금지
5. **facts/대시보드 실제 반환값**에서 `key = uncategorized` 와 `label = 미분류`를 **동시에** 검증하는 회귀 테스트 추가
   (문자열 스캔·테스트 전용 복제 구현 금지 — 실제 모듈 반환값으로 검증)
6. 전체 재검증: 하네스 fail 0/skip 0 · 필수 스모크 전부 · `tsc`/`build` · 신규 lint 0 · diff-check · 제어문자 가드
7. **별도 커밋** 후 기능 브랜치만 push
8. 새 Preview가 해당 커밋으로 배포됐는지 확인
9. 마케팅 '카테고리 매출 TOP' **표시만** 브라우저 재검증
10. 전체 결과 제출 후 **main 병합 승인 대기**

> 승인 전 main 병합·Production 승격 금지.

---

## 7. 병합 시 규칙

- 병합 명칭은 **`RC-1 지표 정합성 1차 — C-1, C-5~C-10`**
- **"RC-1 전체 완료"로 부르지 않는다.**
- 병합 후에도 **C-2·C-3·C-4가 남아 있으므로 RC-2로 바로 넘어가지 않는다.**
  RC-1 잔여 계약의 **범위와 순서를 다시 승인**받는다.

---

## 8. 이월된 미착수 항목

| ID | 내용 | 상태 |
|---|---|---|
| C-2 | revenue 명명 정리 | 미착수 |
| C-3 | 재고 리스크 단계 정의 | 미착수 |
| C-4 | 어댑터 정규화 | 미착수 |
| — | 자연어 '미분류' 필터 파싱 | 미착수 |
| RC-2 | 업무/승인 ID 계약 | 미착수 |
| RC-3 | 변환기 출력 계약 | **차단** — 산출물 2종 필요(PDF p.29–37 스크린샷 또는 렌더러 / 고도몰 대량등록 샘플 엑셀) |
| RC-4 | 저장 계층(IndexedDB 전환) | 미착수 — 배치 전 필수 |
| SEC-03 장기 | DNS 리바인딩 TOCTOU, 전역 rate limit, 관리자 인증 | 미착수 |

> SEC-03은 **A+B만으로 모든 우회가 차단되지 않는다.** DNS 리바인딩은 남아 있다.

---

## 9. 재확인 명령 (인용 전 실행)

```bash
git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git status --porcelain
git merge-base --is-ancestor HEAD main && echo "main포함" || echo "main미포함"
node scripts/smoke-metric-definition-parity-v0.mjs
npx tsc -b && npm run build
```

---

## 10. 열린 질문

- 카테고리 label 폴백을 `미분류`로 바꿀 때, **`categoryLabel`은 없고 `categoryCode`는 실제 값이 있는** 주문의 label은 무엇이어야 하는가?
  (현재는 코드값이 label로 노출된다. `uncategorized`만 고칠지, 폴백 규칙 전체를 고칠지 — **범위를 넓히면 C-1 밖이므로 승인 필요**)
- 상품팀/마케팅팀 공통 수치 일치는 확인됐으나, **CSV·`OperationsDataSnapshot` 세계는 여전히 별도**다. CommerceSnapshot 통합 시점 미정.
