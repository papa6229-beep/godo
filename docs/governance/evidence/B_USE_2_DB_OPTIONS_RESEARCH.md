# B-use-2 서버 기록 — DB 후보 비교자료 (결정자료, 채택안 아님)

조사일: **2026-07-28** · 브랜치 `codex/b-use-2-db-options-research` (`e599ce2` 에서 분기)
입력 문서: `docs/governance/evidence/B_USE_2_SERVER_RECORDS_WORKLOAD.md`

> **이 문서는 DB 를 고르지 않는다.** 나중에 최종 실행 장소가 정해질 때 쓸 **결정자료**다.
> 사용자 확정 방향: 최종 실행 장소 미확정 · 유력 방향은 회사 관리 서버 또는 고도몰 전용 서버 ·
> 개인 데스크톱은 운영 서버로 쓰지 않음 · 11월 한 달 실서버 작동 시험 · 특정 DB·클라우드 미채택.

**근거 규칙(헌법 §10)**: 가격·한도·백업·보안·지역·연결 방식은 **각 제품의 공식 가격표와 공식 문서만** 근거로 삼았다. 블로그·비교 사이트·AI 요약은 쓰지 않았다. 공식 문서에서 확인하지 못한 값은 **`미확인`** 으로 둔다. 사용량·지역·계약에 따라 달라지는 값은 단일 숫자로 확정하지 않고 **계산 구조**를 적는다.

---

## 1. 쉬운 결론

**① 지금 고르지 않아도 된다.** 세 후보 모두 **표준 PostgreSQL** 이다. 표준 SQL·표준 드라이버(`pg`)로만 설계하면 나중에 셋 중 어디로 가든 옮길 수 있다. 지금 고르면 아직 모르는 회사 서버 사양에 맞춰 되돌려야 할 수 있다.

**② 무료 등급은 셋 다 우리 규모에 맞지 않는다.** Supabase Free 는 DB **500 MB** 이고 **1주 미사용 시 프로젝트가 정지**된다. Neon Free 는 프로젝트당 **0.5 GB** 이고 한도를 넘으면 **다음 청구월까지 컴퓨트가 정지**된다. 입력 문서의 예시 계산(텍스트 약 180 MB + 첨부 약 2.5 GB)과 비교하면 텍스트만으로도 무료 한도를 넘는다.

**③ 첨부를 DB 밖으로 빼는 결정이 DB 선택보다 먼저다.** 입력 문서 §4.1 실측대로 텍스트 레코드는 412 B~1,218 B 인데 팀 메시지 첨부 1건은 약 1.2 MB 다. 첨부를 base64 로 DB 에 넣으면 용량 요구가 한 자릿수 단위로 달라진다. 이 결정은 **공급자와 무관**하다.

**④ 개인정보 저장 위치에서 셋이 갈린다.** Supabase 는 **서울(`ap-northeast-2`)** 리전이 있고, Neon 은 **한국 리전이 없다**(Asia-Pacific 은 싱가포르·시드니뿐). 직접 운영은 서버가 있는 곳에 저장된다. CS 완료 기록에 이름·전화·이메일 그릇이 있으므로(입력 §3.4) 실데이터 연결 이후에는 이 차이가 실제 조건이 된다.

**⑤ 장애 복구 책임자가 다르다.** 관리형 두 곳은 백업·복구 기반을 공급자가 제공하고, 직접 운영은 **우리가 WAL 아카이빙·기본 백업·모니터링을 직접 설정하고 유지**해야 한다(PostgreSQL 공식 문서가 그렇게 요구한다).

**⑥ Neon Object Storage 는 아직 beta 이고 `us-east-2` 전용**이다. 첨부 저장소로 지금 전제할 수 없다.

---

## 2. 공식 출처 목록 (전부 2026-07-28 확인)

| # | 출처 | URL |
|---|---|---|
| S1 | Supabase 공식 가격표 | https://supabase.com/pricing |
| S2 | Supabase 백업 공식 문서 | https://supabase.com/docs/guides/platform/backups |
| S3 | Supabase 연결 방식 공식 문서 | https://supabase.com/docs/guides/database/connecting-to-postgres |
| S4 | Supabase 리전 공식 문서 | https://supabase.com/docs/guides/platform/regions |
| S5 | Supabase 운영 전환 체크리스트 | https://supabase.com/docs/guides/platform/going-into-prod |
| S6 | Supabase 운영 보안 체크리스트 | https://supabase.com/docs/guides/deployment/going-into-prod |
| S7 | Supabase Storage 공식 문서 | https://supabase.com/docs/guides/storage |
| N1 | Neon 공식 가격표 | https://neon.com/pricing |
| N2 | Neon 요금제 공식 문서 | https://neon.com/docs/introduction/plans |
| N3 | Neon 연결 풀링 공식 문서 | https://neon.com/docs/connect/connection-pooling |
| N4 | Neon 리전 공식 문서 | https://neon.com/docs/introduction/regions |
| N5 | Neon Object Storage 공식 문서 | https://neon.com/docs/storage/overview |
| N6 | Neon–Vercel 연동 공식 문서 | https://neon.com/docs/guides/vercel-overview |
| P1 | PostgreSQL 공식 문서 — 연속 아카이빙·PITR | https://www.postgresql.org/docs/current/continuous-archiving.html |
| P2 | PostgreSQL 공식 버전 지원 정책 | https://www.postgresql.org/support/versioning/ |
| V1 | Vercel 통합 공식 문서 | https://vercel.com/docs/integrations |

---

## 3. 후보 3종 비교

**Prisma 는 후보에서 제외한다.** DB 제품이 아니라 ORM·데이터 접근 도구다(§7 별도 설명).

### 3.1 가격·한도

| 항목 | ① 직접 운영 PostgreSQL | ② Supabase | ③ Neon |
|---|---|---|---|
| 소프트웨어 비용 | **0원** (오픈소스) | Free $0 · Pro **$25/월부터** · Team **$599/월부터** (S1) | Free $0 · Launch·Scale "Pay for what you use" (N1·N2) |
| 실제 비용 구조 | 서버·디스크·백업 저장소 + **사람 운영시간** | 플랜 기본요금 + 초과분(디스크 $0.125/GB · egress $0.09/GB) (S1) | 사용량 과금: 컴퓨트 Launch **$0.106/CU-h** · Scale **$0.222/CU-h** · 저장 **$0.35/GB-월** · 이력 보존 **$0.20/GB-월** (N1·N2) |
| 무료/최저 등급 저장 한도 | 해당 없음(디스크 용량만큼) | Free **DB 500 MB** · egress 5 GB (S1) | Free **0.5 GB/프로젝트** · 컴퓨트 **100 CU-h/프로젝트** (N1·N2) |
| 유료 최저 등급 디스크 | 해당 없음 | Pro **8 GB 포함**, 이후 $0.125/GB (S1) | 포함량 없음 — 쓴 만큼 $0.35/GB-월 (N1) |
| **무료 등급 정지 조건** | 없음 | **"Free projects are paused after 1 week of inactivity"** (S1) · 체크리스트: "We may pause applications on the Free Plan that exhibit low activity in a 7-day period" (S5) | **"suspends compute until the next billing month"** (한도 초과 시) (N1) |
| 무료 등급 자동 삭제 | 해당 없음 | **미확인** — 공식 문서에 삭제 규정 없음(정지만 명시) | **미확인** — 공식 문서에 삭제·비활성 규정 없음 |
| 한도 초과 시 동작 | 디스크가 차면 쓰기 실패(운영자 책임) | Free: **하드 리밋**(pay-as-you-go 없음) · Pro 이상: 초과분 과금(기본 spend cap 켜짐) (S1) | Free: **컴퓨트 정지** · Launch/Scale: 초과분 과금 (N1) |
| 유휴 시 동작 | 계속 켜짐 | Free 만 정지 · Pro 이상 "Never pauses" (S1) | **5분 후 자동 정지(scale to zero)** · Launch 는 해제 가능 · Scale 은 1분~always-on 설정 (N1) |

> **주의**: Neon Launch/Scale 의 "월 기본요금"을 공식 페이지에서 단일 숫자로 확정하지 못했다(N1·N2 모두 "Pay for what you use"·"Pay only for what you use" 로만 표기). **월 최소 청구액은 `미확인`** 이며, 위 단가로 계산 구조만 적는다.

### 3.2 운영·백업·복구

| 항목 | ① 직접 운영 | ② Supabase | ③ Neon |
|---|---|---|---|
| 일일 백업 | **우리가 구성** | Pro **7일** · Team **14일** · Enterprise **최대 30일** · **Free 없음** (S2) | 해당 개념 대신 이력 보존: Free **6시간(1 GB 한도)** · Launch **최대 7일** · Scale **최대 30일** (N1·N2) |
| PITR(시점 복구) | **PostgreSQL 기본 기능**. 단 `wal_level`·`archive_mode`·`archive_command` 설정 + `pg_basebackup` 기본 백업 + **아카이빙 모니터링**을 직접 해야 한다 (P1) | **유료 부가**: "$100 per month per 7 days retention" · Pro 이상 + 최소 Small 컴퓨트 필요 · 활성화 시 일일 백업 중단 · RPO 최악 2분·초 단위 granularity (S1·S2) | 이력 보존 창 안에서 복원 · $0.20/GB-월 (N1·N2) |
| 일반 SQL dump/export | `pg_dump` 그대로 | Free 는 백업 다운로드 불가 → **"Supabase CLI `db dump`"** 로 직접 내보내야 함 (S2·S5) · 수동 백업은 CLI 또는 `pg_dump` (S2) | **미확인**(공식 문서에서 dump 절차 문구를 확인하지 못함). 표준 PostgreSQL 이므로 `pg_dump` 사용 가능성은 높으나 공식 근거를 붙이지 못했다 |
| 백업 방식 | 우리가 선택 | Postgres `15.8.1.079` 이상은 **물리 백업**, 이전은 논리 백업 (S2) | **미확인** |
| 장애 복구 책임 | **전적으로 우리** (서버·디스크·복원 절차) | 공급자가 기반 제공, **복원 실행은 우리** (대시보드·Management API) (S2) | 공급자가 기반 제공, 복원 실행은 우리 |
| 버전 지원 | 메이저 버전 **초기 릴리스 후 5년** 지원, 이후 EOL (P2) · 현재 지원: 14~18 (P2) | 공급자가 관리(업그레이드는 우리가 실행) | 공급자가 관리 |

### 3.3 연결·동시성

| 항목 | ① 직접 운영 | ② Supabase | ③ Neon |
|---|---|---|---|
| serverless 연결 방식 | 우리가 풀러(PgBouncer 등) 구성 | **Supavisor transaction mode**(`:6543`) — 공식 문구: "ideal for serverless or edge functions, which require many transient connections" · "Use pooler transaction mode for application traffic from temporary clients (for example, serverless or edge functions)" (S3) | **PgBouncer** — 호스트에 `-pooler` 접미사. 공식 문구: "Use the pooled connection string ... for serverless functions and connection-per-request workloads" (N3) |
| 풀링 최대 클라이언트 | 우리 설정 | 컴퓨트 등급별 "max pooler clients" — **구체 수치 미확인**(S3 은 등급별 표를 이 페이지에서 제시하지 않음) | **최대 10,000 동시 연결** · 풀 크기는 `max_connections` 의 90% (N3) |
| 직접 연결 상한 | 우리 설정(`max_connections`) | **미확인** | 컴퓨트 크기별: 0.25 CU **104** · 0.5 CU **209** · 1 CU **419** · 2 CU **839** · 9 CU 이상 **4000** (N3) |
| IPv4/IPv6 | 우리 네트워크 | 직접 연결은 기본 IPv6, **IPv4 는 유료 부가**. Supavisor 두 모드는 전 등급 IPv4 (S3) | **미확인** |
| 트랜잭션·낙관적 잠금 | 표준 PostgreSQL 그대로 | 표준 PostgreSQL 그대로 | 표준 PostgreSQL 그대로 |

> 세 후보 모두 표준 PostgreSQL 이므로 **트랜잭션·`SELECT ... FOR UPDATE`·`xmin`/`updated_at` 기반 낙관적 잠금·`INSERT ... ON CONFLICT` upsert 는 동일하게 동작한다.** 이 항목은 후보 간 차이가 아니다.

### 3.4 지역·개인정보

| 항목 | ① 직접 운영 | ② Supabase | ③ Neon |
|---|---|---|---|
| 한국 리전 | **서버가 있는 곳**(회사·고도몰 서버) | **있음 — Northeast Asia (Seoul) `ap-northeast-2`** (S4) | **없음** — Asia-Pacific 은 싱가포르·시드니뿐 (N4) |
| 리전 변경 | 서버 이전 | **미확인**(공식 문서가 생성 후 변경 가능 여부를 다루지 않음) (S4) | **불가** — "You cannot change the region for an existing project" · 새 프로젝트 + 데이터 이관 필요 (N4) |
| 데이터 레지던시 약정 | 우리 책임 | **명시 없음** — "Each Supabase project is deployed to one primary region" 만 기술 (S4) | **미확인** |
| 접근 통제·전송 암호화 | 우리 구성 | 운영 체크리스트: **SSL Enforcement** 켜기 · **Network Restrictions** 켜기 · 모든 테이블 RLS · MFA (S6) | **미확인** |
| 저장 시 암호화(at rest) | 우리 구성 | **미확인**(체크리스트에 암호화 표준·SOC2 언급 없음) (S6) | **미확인** |

### 3.5 첨부(object storage)

| 항목 | ① 직접 운영 | ② Supabase | ③ Neon |
|---|---|---|---|
| 자체 제공 | 없음 — 파일 서버 또는 외부 S3 호환 저장소 별도 필요 | **Supabase Storage** — "S3 compatible Storage, RESTful API, TUS resumable uploads" · 메타데이터는 Postgres 에 저장 (S7) | **Neon Object Storage** — S3 호환이나 **beta** 이고 "During the beta, object storage is available in the AWS us-east-2 region only" (N5) |
| 플랜별 파일 크기 상한 | 우리 설정 | **미확인**(S7 에 플랜별 상한 문구 없음) | **미확인**(N5 에 가격·상한 없음) |
| 실무 판단 | 외부 S3 호환 저장소를 별도로 고르면 세 후보 모두에서 같은 방식으로 쓸 수 있다 → **공급자 종속을 만들지 않는 선택** |

### 3.6 이전 가능성

| 항목 | ① 직접 운영 | ② Supabase | ③ Neon |
|---|---|---|---|
| 표준 PostgreSQL 호환 | **원본 그 자체** | 표준 PostgreSQL 기반(플랜별 버전 명시, 예 `15.8.1.079`) (S2) | 표준 PostgreSQL 기반 |
| 다른 서버로 옮기기 | `pg_dump`/`pg_restore` (P1 계열 표준 도구) | CLI `db dump` 또는 `pg_dump` (S2) | **미확인**(공식 dump 문구 미확인, 표준 도구 사용 가능성 높음) |
| 공급자 전용 기능 사용 시 이전 비용 | 없음 | Storage·Auth·RLS 정책·Realtime 등을 업무 핵심에 묶으면 **그만큼 재작성** 필요 | 브랜칭·Object Storage 등을 핵심에 묶으면 재작성 필요 |
| Vercel 연결 | 표준 연결 문자열(현재 `pg` 어댑터 그대로) | 표준 연결 문자열 · Supavisor transaction mode 권장 (S3) | **Vercel Marketplace 네이티브 통합 있음**(청구도 Vercel 경유) · Connectable Account · 수동 env 세 경로 (N6) |
| 회사 서버로 앱을 옮겨도 연결 유지 | 그대로 | 연결 문자열만 있으면 유지(인터넷 경유) | 연결 문자열만 있으면 유지(인터넷 경유) |

> Vercel 공식 통합 목록 페이지(V1)는 네이티브 통합 **목록 본문이 렌더되지 않아** Supabase 의 네이티브 통합 여부를 공식 페이지로 확인하지 못했다 → **`미확인`**. Neon 은 자사 공식 문서(N6)가 Vercel Marketplace 네이티브 통합 존재를 명시한다.

---

## 4. 입력 문서 §7 의 12조건 매핑

| # | 조건 | ① 직접 운영 | ② Supabase | ③ Neon | 후보 간 차이인가 |
|---|---|---|---|---|---|
| 1 | 행 단위 append/upsert | ✅ 표준 SQL | ✅ | ✅ | **아니다** — 셋 다 표준 PostgreSQL |
| 2 | 동시 쓰기 충돌 제어(트랜잭션·낙관적 잠금) | ✅ | ✅ | ✅ | **아니다** |
| 3 | 첨부를 DB 밖에 둘 경로 | 외부 S3 호환 저장소 별도 | Supabase Storage(S3 호환) (S7) | Object Storage **beta·us-east-2 전용** (N5) | **그렇다** |
| 4 | append-only 이력 보존 | ✅ 스키마 설계 문제 | ✅ | ✅ | **아니다** |
| 5 | 인덱스(`taskId`·`correlationId`·`teamId`·`at`) | ✅ | ✅ | ✅ | **아니다** |
| 6 | 연결 수 상한(소수 동시 사용자) | 우리 설정 | Supavisor transaction mode 권장, 등급별 상한 **미확인** (S3) | 풀링 최대 10,000 · 직접 0.25 CU 104~ (N3) | **그렇다**(수치 공개 정도가 다름) |
| 7 | serverless 친화(lazy 연결·cold start) | 풀러 직접 구성 | Supavisor transaction mode 공식 권장 (S3) | `-pooler` 엔드포인트 공식 권장 (N3) | 부분적 |
| 8 | 개인정보(위치·암호화·접근통제·보존) | 위치는 우리 서버, 나머지 우리 책임 | **서울 리전 있음** (S4) · SSL 강제·네트워크 제한·RLS (S6) · at-rest 암호화 **미확인** | **한국 리전 없음** (N4) · 나머지 **미확인** | **그렇다 — 가장 큰 차이** |
| 9 | 백업·PITR·export | 전부 우리 구성(P1) | 일일 7~30일 · PITR $100/월/7일 · Free 백업 없음 (S1·S2) | 이력 6시간~30일 · $0.20/GB-월 (N1·N2) | **그렇다** |
| 10 | 무료 등급 초과 시 동작 | 해당 없음 | Free **하드 리밋**·1주 미사용 정지 (S1·S5) | Free **컴퓨트 정지**(다음 청구월까지) (N1) | **그렇다** |
| 11 | 다른 DB 로 옮기는 비용 | 최저 | 공급자 전용 기능을 안 쓰면 낮음 | 공급자 전용 기능을 안 쓰면 낮음 | 설계에 달림 |
| 12 | 실시간 반영 수단(구독/폴링) | 우리가 구현(LISTEN/NOTIFY 등) | **미확인**(Realtime 제품 존재하나 이번 조사에서 공식 근거 미수집) | **미확인** | **미확인** |

**결론**: 12조건 중 **1·2·4·5·11 은 후보 간 차이가 아니다**(전부 표준 PostgreSQL). 실제로 갈리는 것은 **3(첨부)·6(연결)·8(개인정보)·9(백업)·10(무료 등급)** 이고, 그중 **8 이 가장 크다.**

---

## 5. 회사·고도몰 서버 직접 운영 확인표

최종 실행 장소가 회사 서버 또는 고도몰 전용 서버가 될 경우, **서버를 받기 전에 반드시 확인해야 할 항목**이다. 지금은 전부 **미확인**이며, 서버 제공 조건을 받은 뒤 채운다.

| # | 확인 항목 | 왜 필요한가 | 현재 |
|---|---|---|---|
| 1 | **PostgreSQL 또는 Docker 설치 허용 여부** | 설치가 막혀 있으면 직접 운영 자체가 불가 | 미확인 |
| 2 | **관리자(root/sudo) 권한** | `postgresql.conf` 의 `wal_level`·`archive_mode`·`archive_command` 설정에 필요 (P1) | 미확인 |
| 3 | **디스크 용량·증설 방법** | 텍스트 + (첨부를 DB 에 넣는다면) 첨부까지 감당해야 함 | 미확인 |
| 4 | **메모리** | `max_connections`·shared_buffers 산정 근거 | 미확인 |
| 5 | **고정 주소(도메인/IP)와 TLS 인증서** | Vercel 등 외부에서 접속하려면 필요 | 미확인 |
| 6 | **내부/외부 포트 정책(5432 개방 범위)** | 외부 개방 시 접근 통제 설계가 달라짐 | 미확인 |
| 7 | **자동 백업·PITR 제공 여부** | 서버 제공자가 이미 하면 우리가 안 해도 된다. 안 하면 P1 절차를 우리가 전부 구성·모니터링 | 미확인 |
| 8 | **장애 대응 주체와 SLA** | 새벽 장애 시 누가 복구하는가 | 미확인 |
| 9 | **object storage 또는 파일 저장공간 제공 여부** | 첨부를 DB 밖에 둘 자리 | 미확인 |
| 10 | PostgreSQL 버전과 EOL | 메이저 버전은 초기 릴리스 후 **5년** 지원 (P2) — 2026년 시점에 14 는 2026-11-12 최종 릴리스 | 미확인 |

**직접 운영 시 우리가 떠안는 작업(공식 문서 기준)**: WAL 아카이빙 설정 → 아카이빙이 **실제로 동작하는지 모니터링**("You are advised to monitor the archiving process to ensure that it is working as you intend", P1) → 첫 기본 백업 **이전에** 아카이빙 절차를 먼저 세우고 시험("you should set up and test your procedure for archiving WAL files *before* you take your first base backup", P1) → 기본 백업 주기 결정(보관할 WAL 용량 기준) → 복구 절차 리허설 → 마이너 버전 업그레이드(3개월마다 릴리스, P2).

---

## 6. 확정된 사실 / 조건부 사실 / 미확인

### 확정된 사실 (공식 문서 직접 인용)

- Supabase Free: DB **500 MB** · egress 5 GB · 백업 **없음** · **1주 미사용 시 정지** · pay-as-you-go 없음(하드 리밋) (S1·S2·S5)
- Supabase Pro: **$25/월부터** · 디스크 8 GB 포함 후 $0.125/GB · egress 250 GB 후 $0.09/GB · 백업 **7일** · 정지 없음 (S1)
- Supabase PITR: **$100/월/7일 보존** 유료 부가 · 활성화 시 일일 백업 중단 · RPO 최악 2분 (S1·S2)
- Supabase 서울 리전 **`ap-northeast-2` 존재** (S4)
- Supabase serverless 권장 연결 = **Supavisor transaction mode(:6543)** (S3)
- Neon Free: **0.5 GB/프로젝트** · **100 CU-h/프로젝트** · **5분 후 자동 정지** · 이력 **6시간(1 GB)** · 초과 시 **다음 청구월까지 컴퓨트 정지** (N1·N2)
- Neon 단가: 컴퓨트 Launch **$0.106/CU-h** · Scale **$0.222/CU-h** · 저장 **$0.35/GB-월** · 이력 **$0.20/GB-월** (N1·N2)
- Neon **한국 리전 없음** · **리전 변경 불가** (N4)
- Neon 풀링 **최대 10,000 동시 연결**, 직접 연결 상한은 컴퓨트 크기별 104~4000 (N3)
- Neon Object Storage **beta · AWS us-east-2 전용** (N5)
- Neon **Vercel Marketplace 네이티브 통합 존재**, 청구 Vercel 경유 (N6)
- PostgreSQL PITR 은 **기본 기능**이지만 `wal_level`·`archive_mode`·`archive_command` 설정 + `pg_basebackup` + **아카이빙 모니터링**이 필요 (P1)
- PostgreSQL 메이저 버전 지원 **5년**, 이후 EOL (P2)

### 조건부 사실 (계산 구조로만 성립)

- **Neon 월 비용** = 컴퓨트 CU-h × 단가 + 저장 GB × $0.35 + 이력 GB × $0.20. 자동 정지 설정과 실제 사용 시간에 따라 크게 달라진다. **월 최소 청구액은 공식 페이지에서 확인 못 함.**
- **Supabase 월 비용** = 플랜 기본요금 + (디스크 8 GB 초과분 × $0.125) + (egress 250 GB 초과분 × $0.09) + (PITR 쓰면 $100/월/7일).
- **직접 운영 월 비용** = 서버·디스크·백업 저장소 + **사람 운영시간**. 서버 제공 조건이 나와야 계산 가능.

### 미확인 (공식 근거를 붙이지 못한 값)

| 항목 | 대상 |
|---|---|
| 무료 프로젝트 **자동 삭제** 규정 | Supabase · Neon 둘 다 |
| Neon Launch/Scale **월 최소 청구액** | Neon |
| Neon `pg_dump` 공식 절차 문구 · 백업 방식 | Neon |
| Neon IPv4/IPv6 · 데이터 레지던시 · at-rest 암호화 | Neon |
| Supabase 등급별 **max pooler clients 수치** · 직접 연결 상한 | Supabase |
| Supabase 리전 **생성 후 변경 가능 여부** · at-rest 암호화 표준 · SOC2 | Supabase |
| Supabase Storage **플랜별 파일 크기 상한** | Supabase |
| Neon Object Storage **가격·상한** | Neon |
| **실시간 반영 수단**(조건 12) 공식 근거 | Supabase · Neon 둘 다 |
| Vercel 공식 통합 목록의 **Supabase 네이티브 통합 여부** | Vercel(V1 본문 미렌더) |
| 회사·고도몰 서버 **10개 확인 항목 전부** | 직접 운영 |

---

## 7. Prisma 를 후보에서 뺀 이유

Prisma 는 **DB 제품이 아니라 ORM·데이터 접근 도구**다. 위 세 후보 중 어느 것을 쓰든 그 위에 얹거나 안 얹을 수 있다.

지금 판단할 필요도 없다. 현재 저장소에는 **`pg@^8.22.0` + `@types/pg@^8.20.0` 이 이미 설치**돼 있고(입력 §7 재사용 자산), 선례 어댑터(`api/_shared/marketingBehaviorPostgresStore.ts`)가 그 드라이버로 lazy Pool·직접 SQL 방식으로 동작한다. **표준 SQL 로 설계하면 나중에 Prisma 를 얹을지 말지는 별도로 정할 수 있다.**

---

## 8. 지금 선택하지 않아도 되는 이유 · 공통분모 제안

### 지금 고르지 않아도 되는 이유

1. **셋 다 표준 PostgreSQL** 이라 스키마·SQL·드라이버가 같다. 조건 1·2·4·5·11 은 후보 간 차이가 아니다(§4).
2. **실제로 갈리는 조건(3·6·8·9·10)은 전부 "어디에 서버를 두는가"에 종속**된다. 그 답이 아직 없다.
3. **가장 큰 차이인 개인정보 저장 위치(조건 8)** 는 실데이터 연결(C단계) 이후에야 실제 조건이 된다. 지금 CS 자료는 합성이고 문의·리뷰는 미연결이다(입력 §3.4).
4. **첨부 보관 방식 결정(조건 3)이 DB 선택보다 앞선다.** 이 결정은 공급자와 무관하다.
5. 지금 고르면 **11월 실서버 시험 때 받은 서버 조건과 어긋날 위험**이 있고, 그때 되돌리는 비용이 지금 미루는 비용보다 크다.

### 기술적으로 안전한 공통분모 (지금 지킬 수 있는 것)

| # | 원칙 | 이유 |
|---|---|---|
| 1 | **표준 PostgreSQL 스키마**만 쓴다 | 세 후보 사이 이전 가능성 보존 |
| 2 | 이미 설치된 **`pg` 계열 일반 SQL 연결**만 쓴다 | 선례 어댑터가 이미 그렇게 동작(입력 §7) |
| 3 | **공급자 전용 함수·제품에 핵심 업무를 묶지 않는다** | 묶는 만큼 이전 비용이 생긴다(§3.6) |
| 4 | **첨부는 DB 에 base64 로 넣지 않고 object storage 참조**로 둔다 | 첨부 1건 ≈ 텍스트 2,000건(입력 §4.1). 외부 S3 호환 저장소를 쓰면 세 후보에서 동일 |
| 5 | **행 단위 append/upsert** | 현재 전체 배열 재작성이 다중 사용자 lost update 를 만든다(입력 §4.5) |
| 6 | **동시 쓰기 충돌 처리**(트랜잭션 또는 `updated_at` 낙관적 잠금) | 디자인팀 4명 공유 큐(입력 §5) |
| 7 | **일반 SQL dump 로 내보낼 수 있는 구조** | 백업 수단이 현재 0(입력 §5) · 이전 가능성의 최후 보루 |

### 추천 결론

> **최종 회사·고도몰 서버 사양을 받기 전에는 공급자를 확정하지 않는다.**
> 애플리케이션은 **표준 PostgreSQL 공통분모**로 설계해 직접 운영 PostgreSQL·Supabase·Neon 사이의 이전 가능성을 보존한다.
> **최종 선택 시점은 11월 실서버 시험을 준비하기 전**이며, 그때 **서버 제공 조건과 관리 책임**을 함께 비교한다.

**공식 조사 결과와 이 결론이 충돌하는가 → 충돌하지 않는다.** 오히려 조사 결과가 결론을 지지한다: 실제로 갈리는 다섯 조건이 모두 서버 위치·운영 책임에 종속되고(§4), 무료 등급은 셋 다 우리 규모에 못 미치며(§3.1), 가장 큰 차이(한국 리전 유무)는 실데이터 연결 이후에야 발효된다.

---

## 9. 사용자가 나중에 결정해야 할 항목

| # | 결정 | 필요한 입력 | 시점 |
|---|---|---|---|
| 1 | **최종 실행 장소** (회사 서버 / 고도몰 전용 서버 / 그 밖) | §5 확인표 10개 항목 | 11월 실서버 시험 준비 전 |
| 2 | **DB 공급자** | 1번 결과 + 이 문서 §3 비교표 | 1번 직후 |
| 3 | **첨부 보관 방식** (DB 안 base64 / object storage 참조) | 실제 첨부 사용량·평균 크기 | **DB 선택보다 먼저** 가능 |
| 4 | **개인정보 저장 위치 요구** (국내 보관 필요 여부) | 회사 방침 | C단계 실데이터 연결 전 |
| 5 | **백업 주기·복구 목표 시간(RPO/RTO)** | 회사 방침 | 2번과 함께 |
| 6 | **장애 대응 주체** (우리 / 공급자 / 서버 제공자) | 1번 결과 | 2번과 함께 |
| 7 | 보존 기간 · 전사 직원 수 · 1인당 일 기록 건수 | 회사 방침 | 입력 문서 §8 과 동일(여전히 미결정) |

---

## 10. 재현 방법

이 문서의 모든 수치는 §2 의 16개 공식 URL 을 **2026-07-28** 에 직접 열어 확인했다. 재현하려면 같은 URL 을 열고 다음을 대조한다.

- 가격표(S1·N1): 플랜별 월 요금 · 포함 저장량 · 초과 단가 · 정지 조건
- 백업 문서(S2): 플랜별 보존일 · PITR 부가 요금 · Free 백업 부재
- 연결 문서(S3·N3): serverless 권장 모드 · 포트 · 연결 상한
- 리전 문서(S4·N4): 한국 리전 유무 · 리전 변경 가능 여부
- 요금제 문서(N2): 이력 보존 창 · 단가
- Object Storage(S7·N5): S3 호환성 · beta·리전 제한
- PostgreSQL(P1·P2): PITR 필수 설정 · 버전 지원 5년

**가격은 공급자가 예고 없이 바꿀 수 있다.** 실제 결정 시점(11월 예상)에 **같은 URL 을 다시 확인**해야 하며, 이 문서의 숫자를 그때의 근거로 그대로 쓰지 않는다.
