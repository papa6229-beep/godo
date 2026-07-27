# 도메인 저장 경계 (repository / facade)

**화면(`src/components`)은 저장소 구현 모듈을 직접 import 하지 않는다.** 이 폴더의 facade 만 쓴다.

이유(마스터 계획 B-core-3):
- 저장소를 교체할 때(localStorage → 서버) 화면 코드를 건드리지 않기 위해서다.
- 화면이 범용 persistence port 에 직접 결합되면 도메인 의미가 사라진다.
  그래서 여기서는 **도메인 의미를 보존한 연산**만 노출한다.

현재 어댑터는 전부 localStorage 다(`src/services/*Store.ts` · `*Memory.ts` · `*Ledger.ts` 등).
**저장키와 저장 형식은 이번 단계에서 바꾸지 않았다** — 기존 자료가 그대로 읽힌다.

선례: `api/_shared/marketingBehaviorPersistentStore.ts`(포트) ← `marketingBehaviorPostgresStore.ts`(어댑터)
      ← `api/marketing/[action].ts`(소비자는 포트만 import)
