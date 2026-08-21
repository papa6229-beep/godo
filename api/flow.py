"""단순형 정본 변환기 — 정본 앱을 GODO 배포 안에서 **그대로** 띄운다.

축소판을 만들지 않는다. 화면도 라우트도 정본(`tools/detail-page-converter`,
GitHub `papa6229-beep/detail-page-converter` `8fe84e5`)의 것을 그대로 쓴다:
엑셀 업로드 · 상품 목록 · 변환 · 캡션 손수정 · 자동 문구 채우기(API 키) ·
초록/노랑/빨강 판정 · 미리보기 · HTML 저장 · 지난 회차 · 일괄 zip.

이 파일이 하는 일은 **경로를 되돌려 주는 것 하나뿐**이다.

정본 UI 는 `/api/excel`·`/preview/{jid}` 처럼 **절대 경로**로 서버를 부른다. 그런데
Vercel 파일 기반 함수는 `/api/flow` 한 자리에만 붙으므로, `vercel.json` 의 rewrite 가
정본 경로를 `/api/flow?p=<원래 경로>` 로 넘겨 주고 여기서 그 `p` 를 다시 `scope.path`
로 돌려놓는다. 그래야 정본 라우트가 자기 경로를 그대로 본다.

**정본 파일은 한 글자도 고치지 않는다.** 정본이 import 시점에 정하는 작업 폴더만
쓰기 가능한 곳으로 미리 돌려놓는다(배포 번들은 읽기 전용).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

_HERE = Path(__file__).resolve()
CANONICAL = next(
    (
        parent / "tools" / "detail-page-converter"
        for parent in _HERE.parents
        if (parent / "tools" / "detail-page-converter" / "app" / "server.py").exists()
    ),
    None,
)
if CANONICAL and str(CANONICAL) not in sys.path:
    sys.path.insert(0, str(CANONICAL))

# 정본 `app/server.py:29` 은 import 시점에 `CONVERTER_WORK` 를 읽어 작업 폴더를 정한다.
# 서버리스 인스턴스에서 쓸 수 있는 곳은 /tmp 뿐이다. import 보다 먼저 정해야 한다.
os.environ.setdefault("CONVERTER_WORK", "/tmp/converter-work")

from app.server import app as canonical_app  # noqa: E402  (경로·환경 설정 뒤에 와야 한다)

#: rewrite 가 실어 보내는 원래 경로의 이름.
PATH_PARAM = "p"


async def app(scope, receive, send):
    """정본 ASGI 앱 앞에 서서 경로만 되돌려 준다."""
    if scope.get("type") == "http":
        pairs = parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
        target = next((value for key, value in pairs if key == PATH_PARAM), None)
        if target is None and scope.get("path", "").rstrip("/").endswith("/api/flow"):
            # rewrite 없이 함수 주소로 바로 들어온 경우: 정본 첫 화면을 준다.
            target = "/"
        if target:
            if not target.startswith("/"):
                target = "/" + target
            rest = [(key, value) for key, value in pairs if key != PATH_PARAM]
            scope = dict(scope)
            scope["path"] = target
            scope["raw_path"] = target.encode("utf-8")
            scope["query_string"] = urlencode(rest).encode("utf-8")
    await canonical_app(scope, receive, send)
