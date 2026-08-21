"""올려 둔 엑셀이 서버에서 사라져도 변환이 이어지는가.

서버를 여러 실행 공간에 나눠 띄우면(서버리스) 요청 사이에 `SHEETS` 가 비어 있을 수
있다. 실제로 그렇게 됐다 — 같은 엑셀로 10건을 변환한 뒤, 이어서 고른 7건이 전부
`/api/convert` 에서 "먼저 엑셀을 올려야 한다"(400) 로 죽었다.

여기서 확인하는 것은 **배관**이다: 화면이 들고 있던 상품 자료로 같은 `Row` 가
되살아나 같은 변환 입력이 되는가. 그림을 자르고 붙이는 변환 자체는 바꾸지 않았고
이 검사에서 부르지 않는다(원본 이미지를 받아야 하므로).
"""

import io
import os
import tempfile

os.environ.setdefault("CONVERTER_WORK", tempfile.mkdtemp(prefix="rowdata-test-"))

from app import excel, gate, server  # noqa: E402


def _xlsx(rows, headers) -> bytes:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _sheet():
    data = _xlsx(
        [[
            "2439903", "텐가 에그 2018 6종", "TENGA", "바나나", "12900", "19000", "성인용품",
            "https://cdn-banana.bizhost.kr/files/goodsm/2439903/thumb.jpg",
            '<p>설명 한 줄</p><img src="/banana_img/product_image/man/2439903_detail.jpg">',
            "https://x.example/goods/2439903",
            "타입=1. 웨이비,2. 보쿠",
        ]],
        ["상품번호", "상품명", "브랜드", "거래처", "판매가", "정가", "카테고리",
         "대표이미지url", "상세설명", "상품url", "옵션1"],
    )
    return excel.load(data)


class _StubWork:
    """변환 결과 자리만 채운다 — 이 검사는 변환이 아니라 배관을 본다."""

    def __init__(self, row):
        from app.product import Meta, Product

        self.row = row
        self.product = Product(meta=Meta(name=row.name, brand=row.brand), units=[], ad=[])
        self.verdict = gate.Verdict()
        self.ink_coverage = None


def _capture(monkeypatch):
    """`convert.convert` 가 받은 `Row` 를 가로채 돌려준다."""
    seen = {}

    def fake_convert(row, workdir, cache):
        seen["row"] = row
        return _StubWork(row)

    monkeypatch.setattr(server.convert, "convert", fake_convert)
    return seen


def _essentials(row):
    """변환이 실제로 읽는 값들(`app/convert.py:337-352`)."""
    return {
        "code": row.code, "name": row.name, "brand": row.brand, "category": row.category,
        "price": row.price, "body": row.body,
        "option_values": row.option_values, "option_numbers": row.option_numbers,
    }


def test_엑셀이_사라져도_화면이_들고_있던_자료로_변환이_이어진다(monkeypatch):
    sheet = _sheet()
    server.SHEETS["k1"] = sheet
    row_data = server._row_data(sheet.rows[0])

    # ① 지금까지의 경로 — 올려 둔 엑셀이 그대로 있다.
    seen = _capture(monkeypatch)
    memory_payload = server.api_convert(server.ConvertReq(sheet="k1", row=0, row_data=row_data))
    memory_row = seen["row"]

    # ② 실행 공간이 바뀐 상태를 그대로 만든다.
    server.SHEETS.clear()

    seen = _capture(monkeypatch)
    restored_payload = server.api_convert(server.ConvertReq(sheet="k1", row=0, row_data=row_data))
    restored_row = seen["row"]

    # 400 이 아니라 정상 응답이 나온다.
    assert restored_payload["job"]
    assert restored_payload["ok"] is True
    # 그리고 변환에 들어간 값이 기존 경로와 같다.
    assert _essentials(restored_row) == _essentials(memory_row)
    # 정본 파서가 값과 번호를 갈라 두는 것도 그대로 살아 온다(`app/excel.py:101-141`).
    assert _essentials(restored_row)["option_values"] == ["웨이비", "보쿠"]
    assert _essentials(restored_row)["option_numbers"] == ["1", "2"]


def test_엑셀도_자료도_없으면_예전_그대로_거절한다():
    from fastapi import HTTPException

    server.SHEETS.clear()
    try:
        server.api_convert(server.ConvertReq(sheet="없는키", row=0))
    except HTTPException as e:
        assert e.status_code == 400
        assert e.detail == "먼저 엑셀을 올려야 한다"
    else:
        raise AssertionError("엑셀도 자료도 없는데 통과했다")


def test_상품_자료는_담았다_되살려도_그대로다():
    sheet = _sheet()
    original = sheet.rows[0]
    restored = server._row_from_data(server._row_data(original))
    assert _essentials(restored) == _essentials(original)
    # 옵션 묶음도 이름·값·번호가 그대로 산다.
    assert [(o.name, o.values, o.numbers) for o in restored.options] == \
           [(o.name, o.values, o.numbers) for o in original.options]
    # 변환이 쓰지 않는 `raw` 는 보내지 않는다.
    assert "raw" not in server._row_data(original)
