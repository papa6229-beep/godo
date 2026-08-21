"""단순형 정본 변환 — Vercel 함수 어댑터.

이 파일은 **얇다.** 변환 규칙·Excel 읽기·HTML 렌더·게이트 판정은 전부
`tools/detail-page-converter`(정본 사용본, GitHub `papa6229-beep/detail-page-converter`
`8fe84e5`)의 모듈이 한다. 여기서 다시 흉내 내지 않는다.

정본 서버(`app/server.py`)는 요청 사이에 `JOBS`·`SHEETS`(모듈 전역 dict)와 작업
폴더 파일을 들고 간다. 서버리스에서는 그 전제가 서지 않으므로 **여기서는 요청
하나가 끝까지 처리하고 아무것도 남기지 않는다** — 엑셀 바이트와 행 번호를 함께
받아 그 요청 안에서 읽고·변환하고·렌더하고, 임시 폴더를 지우고 끝낸다.

    POST {action:"list",    xlsx:<base64>}          → 상품 목록 + 사전 게이트
    POST {action:"convert", xlsx:<base64>, row:N}   → 완성 HTML + 판정
    GET                                              → 자기점검(정본 모듈 import 확인)

이번 P1 범위 밖(붙이지 않았다): 자동 문구 채우기(AI) · 사람 캡션 편집 · 지난 회차
보관함 · 복수 상품 일괄 ZIP. 따라서 이 함수는 **유료 AI 호출을 하지 않는다.**
"""

from __future__ import annotations

import base64
import json
import shutil
import sys
import tempfile
import time
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path

# 정본 사용본을 import 경로에 올린다. 파일은 읽기만 한다(수정·복제 없음).
_HERE = Path(__file__).resolve()
CANONICAL = next(
    (p / "tools" / "detail-page-converter" for p in _HERE.parents if (p / "tools" / "detail-page-converter" / "app" / "excel.py").exists()),
    None,
)
if CANONICAL and str(CANONICAL) not in sys.path:
    sys.path.insert(0, str(CANONICAL))

#: Vercel 응답 본문 상한 4.5MB. 실측 표본(53건)은 최대 2.17MB 였지만 표본 밖은 모른다.
MAX_HTML_BYTES = 4_000_000


def _canonical():
    """정본 모듈. import 실패를 감추지 않는다."""
    from app import convert, excel, gate, render, source  # noqa: F401
    from app.product import apply_tags

    return convert, excel, gate, render, source, apply_tags


def list_rows(xlsx: bytes) -> dict:
    """엑셀 한 장 → 상품 목록 + 행별 사전 게이트.

    정본 `app/server.py:102-113`(`/api/excel`)의 목록 구성과 같은 순서로 같은 정본
    함수를 부른다: `excel.load` → `source.parse`/`source.classify` → `gate.pre_gate`.
    """
    _, excel, gate, _, source, _ = _canonical()

    sheet = excel.load(xlsx)
    rows = []
    for i, r in enumerate(sheet.rows):
        body = source.parse(r.body)
        keep = [p for p in body.pieces if source.classify(p.url) != "drop"]
        captions = sum(1 for p in keep if p.caption)
        verdict = gate.pre_gate([p.url for p in keep], captions, len(r.option_values))
        rows.append({
            "i": i,
            "code": r.code,
            "name": r.name,
            "brand": r.brand,
            "images": len(keep),
            "captions": captions,
            "options": len(r.option_values),
            "adapter": "조각형" if len(keep) >= 2 else ("통이미지형" if keep else "—"),
            "ok": verdict.ok,
            "reason": verdict.text,
        })
    return {"ok": True, "headers": sheet.headers, "missing": sheet.missing, "rows": rows}


def _risk(ok: bool, reason_text: str, units: list, options: int, ink):
    """초록·노랑·빨강.

    **정본의 판정을 그대로 옮긴 것이다** — 원본은 정본 화면의 `risk()`
    (`tools/detail-page-converter/app/static/index.html:261-288`). 그 함수는 브라우저
    JS 안에 있어 파이썬에서 부를 수 없으므로, 조건과 순서를 1:1로 옮겼다.
    **정본의 `risk()` 가 바뀌면 이 함수도 같이 바꿔야 한다** — 이 파일에서 유일하게
    정본 규칙을 복제한 지점이다.

    빨강 = 사후 게이트 보류(`gate.post_check`) · 노랑 = 아래 네 신호 중 하나라도 · 초록 = 그 외
    """
    why: list[str] = []
    if not ok:
        why.append(reason_text or "사후 점검 보류")
    # 원본에 글이 있었는데 못 채운 칸만 센다(증거 = 잘라둔 캡션 조각).
    empty = sum(1 for u in units if u.caption_crop and not (u.caption or "").strip())
    if empty:
        why.append(f"읽어야 할 문구 빈 칸 {empty}개")
    # 못 붙인 옵션 말머리. 세트 상품(엑셀 옵션 0)은 `options` 조건에서 걸러진다.
    leftover = sum(1 for u in units if not u.option_tag and (u.caption or "").lstrip()[:1] in ("[", "("))
    if options and leftover:
        why.append(f"옵션 {options}종 중 못 붙인 말머리 {leftover}칸")
    # 유닛이 적은 것은 원본에 글자리가 있었을 때만 이상하다.
    crops = sum(1 for u in units if u.caption_crop)
    if crops and len(units) <= 1:
        why.append(f"유닛 {len(units)}개 — 안 쪼개졌을 수 있음")
    if ink is not None and ink < 0.9:
        why.append(f"잉크 보존 {ink * 100:.1f}%")
    return ("bad" if not ok else ("no" if why else "ok")), why


def convert_row(xlsx: bytes, row_index: int) -> dict:
    """엑셀 + 행 번호 → 완성 HTML 한 장. 요청이 끝나면 아무것도 남기지 않는다.

    정본 `/api/convert`(`server.py:124-141`) + `/api/render`(`:155-183`) 가 하는 일을
    한 번에 한다. 사람이 고친 캡션·태그가 없으므로 정본의 "손대지 않은" 분기와 같다:
    태그가 하나도 없으면 `apply_tags`, 손으로 적은 스펙이 없으면 `render.guess_specs`.
    """
    convert, excel, _, render, _, apply_tags = _canonical()

    sheet = excel.load(xlsx)
    if not (0 <= row_index < len(sheet.rows)):
        return {"ok": False, "error": f"그 행이 없습니다(0~{len(sheet.rows) - 1})."}
    row = sheet.rows[row_index]

    workdir = Path(tempfile.mkdtemp(prefix="flow-"))
    started = time.perf_counter()
    try:
        work = convert.convert(row, workdir, workdir / "_cache")
        product = work.product
        # 정본 `/api/render` 와 같은 조건(`server.py:166-168`) — 사람이 준 태그가 없다.
        apply_tags(product.units, product.meta.options if product.meta.options_known else None)
        # 손으로 적은 스펙이 없으므로 정본과 같이 추정에 맡긴다(`server.py:176-177`).
        product.meta.specs = render.guess_specs(product)
        html = render.render(product, workdir)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    level, why = _risk(work.verdict.ok, work.verdict.text, product.units, len(product.meta.options), work.ink_coverage)
    size = len(html.encode("utf-8"))
    if size > MAX_HTML_BYTES:
        return {
            "ok": False,
            "error": f"결과 HTML 이 {size / 1048576:.1f}MB 로 이 경로의 응답 상한(4.5MB)을 넘습니다. 이 상품은 데스크톱 변환기에서 처리해 주세요.",
        }

    return {
        "ok": True,
        "code": row.code,
        "name": product.meta.name,
        "adapter": product.adapter,
        "level": level,
        "why": why,
        "gate_ok": work.verdict.ok,
        "reasons": work.verdict.reasons,
        "reason_text": work.verdict.text,
        "notes": work.verdict.notes,
        "ink": work.ink_coverage,
        "units": len(product.units),
        "ad": len(product.ad),
        "bytes": size,
        "ms": elapsed_ms,
        "html": html,
    }


def handle(payload: dict) -> dict:
    action = str(payload.get("action") or "")
    raw = payload.get("xlsx")
    if not isinstance(raw, str) or not raw:
        return {"ok": False, "error": "엑셀 파일이 없습니다."}
    try:
        xlsx = base64.b64decode(raw, validate=False)
    except Exception:
        return {"ok": False, "error": "엑셀 파일을 읽지 못했습니다."}

    if action == "list":
        return list_rows(xlsx)
    if action == "convert":
        try:
            row_index = int(payload.get("row"))
        except (TypeError, ValueError):
            return {"ok": False, "error": "변환할 상품을 고르지 않았습니다."}
        return convert_row(xlsx, row_index)
    return {"ok": False, "error": f"알 수 없는 요청입니다: {action or '(없음)'}"}


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # 자기점검: 정본 모듈이 번들에 들어왔는지만 본다(변환 안 함)
        try:
            self._canonical_check()
            self._send(200, {"ok": True, "canonical": str(CANONICAL), "ready": True})
        except Exception as e:
            self._send(500, {"ok": False, "error": f"정본 모듈을 불러오지 못했습니다: {e}", "canonical": str(CANONICAL)})

    def _canonical_check(self) -> None:
        _canonical()

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            self._send(400, {"ok": False, "error": "요청을 읽지 못했습니다."})
            return
        try:
            result = handle(payload)
        except Exception as e:
            # 무엇이 막혔는지 감추지 않는다. 화면에는 첫 줄만 보이고 로그에 전문이 남는다.
            print(traceback.format_exc())
            self._send(500, {"ok": False, "error": f"변환 실패: {e}"})
            return
        self._send(200 if result.get("ok") else 400, result)
