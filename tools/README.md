# tools/ — 단순형 정본 변환기 사용본

## 무엇인가

`detail-page-converter/` 는 **외부 정본 변환기의 소스 사본**이다. GODO 가 직접 만든 코드가 아니다.

| 항목 | 값 |
|---|---|
| 원본 정본 | `D:\변환기\detail-page-converter` (GitHub `papa6229-beep/detail-page-converter`) |
| 기준 커밋 | **`8fe84e5`** (origin/main) |
| 복사 범위 | `app/` · `slicer/` · `tests/` · `requirements.txt` — **26파일** |
| 복사하지 않은 것 | `.git` · `.venv` · `work` · `__pycache__` · 생성 결과물 · 실행/갱신 스크립트 · docs |

## 손대지 않는다

이 폴더의 파일은 **읽기 전용으로 취급한다.** 변환 규칙 · Excel 읽기 · HTML 출력 · OpenAI/Anthropic 키 판별 · 초록/노랑/빨강 판정은 전부 정본의 것이며, GODO 쪽에서 고치지 않는다.

고칠 일이 생기면 **원본 정본 저장소에서 고치고, 새 커밋을 다시 복사**한다. 여기서 직접 고치면 두 벌이 갈라진다.

원본 폴더(`D:\변환기\detail-page-converter`)는 **수정·이동·삭제하지 않는다.**

## 같은 소스인지 확인하는 법

```bash
SRC="/d/변환기/detail-page-converter"; DST="/d/godo/tools/detail-page-converter"
cd "$SRC" && git ls-tree -r --name-only 8fe84e5 -- app slicer tests requirements.txt > /tmp/list.txt
cd "$SRC" && sha256sum $(cat /tmp/list.txt) | sort > /tmp/src.sha
cd "$DST" && sha256sum $(cat /tmp/list.txt) | sort > /tmp/dst.sha
diff /tmp/src.sha /tmp/dst.sha && echo "전 파일 일치"
```

줄끝 변환이 이 비교를 깨뜨리지 않도록 저장소 루트 `.gitattributes` 가 이 폴더를 `-text` 로 둔다.

## 어떻게 실행되는가

`npm run dev`(GODO 평소 로컬 실행)로 **함께 준비·기동된다.** 별도 `실행.bat` 을 누르지 않는다.

- 실행 관리자: `scripts/detailConverterService.ts` ← `vite.config.ts` 의 `godo-detail-converter-dev` 플러그인
- 파이썬 실행환경: `tools/.venv-detail-converter/` (GODO 안에 따로 만든다 — 원본 `.venv` 에 의존하지 않는다)
- 변환 결과·캐시: `tools/converter-work/` (소스 폴더를 정본과 그대로 비교할 수 있게 밖에 쌓는다)
- 주소: `http://127.0.0.1:8000` — 디자인팀 대시보드 → **[단순형 변환기(정본)]** 작업창이 이 주소를 그대로 연다
- **8000 을 이미 다른 프로그램이 쓰고 있으면 그것을 끄지 않는다.** 안내만 찍고 GODO 는 계속 뜬다
- GODO(dev 서버)를 끄면 함께 시작한 변환기도 정리된다

두 폴더는 **다른 인스턴스**다. 원본 폴더에 쌓인 지난 변환 결과(`D:\변환기\work`)는 사용본에 보이지 않는다.
