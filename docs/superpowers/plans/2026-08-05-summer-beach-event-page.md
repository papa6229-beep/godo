# Summer Beach Event Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one fully editable Canva event page that follows the approved A horizontal-horizon layout and preserves all supplied text and image originals.

**Architecture:** Upload the six supplied PNG files as independent Canva assets, generate a one-page poster scaffold with those assets, resize the resulting editable design to the required custom canvas, and use one Canva editing transaction to correct text, asset placement, scale, and hierarchy. Verify the saved design through its metadata, text content, page thumbnail, and direct Canva edit link.

**Tech Stack:** Canva connector asset upload, Canva design generation, Canva custom resize, Canva editing transactions, Canva metadata/content/thumbnail inspection.

## Global Constraints

- The final canvas is exactly **840 × 1498px** and contains exactly one page.
- Visual direction is the user-approved **A horizontal-horizon layout**: clear sky, blue sea, white surf, and pale sand in blue-and-white summer colors.
- Main copy must remain exactly `신제품 20% OFF 출시기념`.
- Supporting copy 1 must remain exactly `08.01 ~ 08.31` and sit at the upper-left of the main copy.
- Supporting copy 2 must remain exactly `가장 먼저 만나는 새로운 경험! 장인의 손으로 한땀한땀 빚어낸` and sit below the main copy.
- Use the supplied `1.png` through `6.png` only for logos and products; do not crop, distort, recolor, regenerate, rewrite, or replace them.
- Permitted original-asset changes are proportional scaling and positioning only.
- Image 1 is top-center; image 2 is top-right; images 3, 4, and 5 are below supporting copy 2; image 6 is bottom-center.
- Products must not overlap any copy.
- Text and images remain independently selectable and editable in Canva.
- Do not commit draft editing-transaction changes until the user has seen the returned thumbnail and explicitly approved saving.

---

### Task 1: Upload and identify the six original Canva assets

**Files:**
- Read: `C:/Users/BNN/Desktop/가격표 작업파일/1.png`
- Read: `C:/Users/BNN/Desktop/가격표 작업파일/2.png`
- Read: `C:/Users/BNN/Desktop/가격표 작업파일/3.png`
- Read: `C:/Users/BNN/Desktop/가격표 작업파일/4.png`
- Read: `C:/Users/BNN/Desktop/가격표 작업파일/5.png`
- Read: `C:/Users/BNN/Desktop/가격표 작업파일/6.png`
- Reference: `docs/superpowers/specs/2026-08-04-summer-beach-event-page-design.md`

**Interfaces:**
- Consumes: six user-supplied local PNG file paths.
- Produces: ordered Canva asset IDs `[asset1, asset2, asset3, asset4, asset5, asset6]`, one ID per source file.

- [ ] **Step 1: Upload each original as a separate Canva asset**

  Call `canva_upload_asset_from_url` six times with `asset_file` set to the exact local path and names `event-original-1.png` through `event-original-6.png`. Do not use the public URL parameter.

- [ ] **Step 2: Verify upload identity**

  Record the returned asset ID beside its source number. The six IDs must be distinct and the order must remain 1→6. If any upload fails, retry only that source file; do not substitute or generate an image.

- [ ] **Step 3: Confirm originals are unchanged**

  Compare each upload response thumbnail or metadata with the already inspected source proportions: images 1 and 6 are white assets intended for dark-blue backgrounds; image 2 is the Banana mall logo; images 3–5 are the three black product originals.

### Task 2: Generate and select the editable A-layout scaffold

**Files:**
- Reference: `docs/superpowers/specs/2026-08-04-summer-beach-event-page-design.md`

**Interfaces:**
- Consumes: ordered asset IDs from Task 1.
- Produces: one editable Canva `design_id` created from the A-layout generation candidate.

- [ ] **Step 1: Generate the poster candidate**

  Call `canva_generate_design` with `design_type: "poster"`, the six asset IDs in numeric order, and this complete query:

  ```text
  Create one portrait Korean summer beach event poster using all six supplied assets as-is. Use a clear-sky, bright-blue-sea, white-surf, pale-sand composition with a strong horizontal horizon. Keep every supplied asset uncropped, undistorted, unrecolored, and with all embedded lettering unchanged. Place asset 1 centered at the top on deep blue, asset 2 at the extreme top-right, the exact date "08.01 ~ 08.31" at the upper-left of the main headline, the exact headline "신제품 20% OFF 출시기념" as the largest text, and the exact supporting sentence "가장 먼저 만나는 새로운 경험! 장인의 손으로 한땀한땀 빚어낸" below it. Place assets 3, 4, and 5 below the supporting sentence without touching any text; asset 4 is centered and dominant, asset 3 is left, asset 5 is right. Place asset 6 centered at the absolute bottom on a deep-blue band. Blue and white are primary; only "20% OFF" may use a sunny yellow accent. Keep all text and images as independent editable Canva elements. Make only one page.
  ```

- [ ] **Step 2: Review returned candidate thumbnails**

  Show every candidate preview returned by the generation call. Use the candidate that most closely matches the already approved A horizontal-horizon layout. If more than one candidate is plausibly A, ask the user to choose before creating a design.

- [ ] **Step 3: Create the editable design**

  Call `canva_create_design_from_candidate` with the selected `job_id` and `candidate_id`. Record the returned `design_id` and Canva edit URL.

### Task 3: Set the exact canvas size and inspect editable elements

**Files:**
- Reference: `docs/superpowers/specs/2026-08-04-summer-beach-event-page-design.md`

**Interfaces:**
- Consumes: scaffold `design_id` from Task 2.
- Produces: resized design ID, page-1 element IDs, rich-text values, media-fill asset IDs, and an editing `transaction_id`.

- [ ] **Step 1: Resize to the exact custom dimensions**

  Call `canva_resize_design` with `design_type: { "type": "custom", "width": 840, "height": 1498 }`. If Canva returns a new design ID, use that ID for every later call.

- [ ] **Step 2: Verify one-page metadata**

  Call `canva_get_design` and `canva_get_design_pages` for the resized design. Require exactly one page and confirm the metadata reports 840×1498px. Stop and correct the resize if either check differs.

- [ ] **Step 3: Start the editing transaction**

  Call `canva_start_editing_transaction` with the resized design ID. Record the exact `transaction_id`, page ID, rich-text element IDs, text values, fill element IDs, and fill asset IDs returned for page 1.

- [ ] **Step 4: Identify all media before replacement or insertion**

  If the scaffold contains multiple images and any existing media must be replaced, call `canva_get_assets` once with every existing page asset ID and show every returned thumbnail. Map each existing element to its visible content before issuing replacement operations.

### Task 4: Correct text, layer order, asset position, and scale in one draft transaction

**Files:**
- Reference: `docs/superpowers/specs/2026-08-04-summer-beach-event-page-design.md`

**Interfaces:**
- Consumes: Task 1 original asset IDs and Task 3 transaction/page/element IDs.
- Produces: a draft page whose text is exact and whose six originals follow the approved layout.

- [ ] **Step 1: Prepare exact text operations**

  Use `replace_text` on the three corresponding non-responsive rich-text elements so their complete values are exactly:

  ```text
  08.01 ~ 08.31
  신제품 20% OFF 출시기념
  가장 먼저 만나는 새로운 경험! 장인의 손으로 한땀한땀 빚어낸
  ```

  Use `find_and_replace_text` instead if the page is marked responsive. Do not add or remove any character.

- [ ] **Step 2: Prepare original-asset operations**

  For each missing or incorrect media element, use `update_fill` with the matching original asset ID. If a required original has no existing element, use `insert_fill` on page 1. Use `position_element` and `resize_element` to enforce this order and hierarchy: 1 top-center; 2 top-right; date upper-left of headline; headline; supporting sentence; 3 left, 4 center-dominant, 5 right; 6 absolute bottom-center.

- [ ] **Step 3: Preserve source proportions**

  Set `preserve_aspect_ratio: true` for every resize. Do not use rotations. Keep opacity at 1. Do not place masks or color overlays on the six originals.

- [ ] **Step 4: Format the three text layers**

  Use `format_text` so the headline is the largest bold white layer, `20% OFF` has the strongest scale and may be sunny yellow, the date is compact and bold, and supporting copy 2 remains readable. Formatting must not alter the text strings.

- [ ] **Step 5: Apply all draft edits in bulk**

  Call `canva_perform_editing_operations` once with the complete page-1 operation array and the Task 3 transaction ID. Do not commit yet.

- [ ] **Step 6: Show the returned draft thumbnail**

  Render the full returned page-1 thumbnail. Check that all three products are below supporting copy 2, no text is covered, and white assets 1 and 6 are visible against deep blue.

### Task 5: User approval, commit, and independent verification

**Files:**
- Reference: `docs/superpowers/specs/2026-08-04-summer-beach-event-page-design.md`

**Interfaces:**
- Consumes: Task 4 draft transaction and preview.
- Produces: one saved Canva design, final verification evidence, and a direct edit link.

- [ ] **Step 1: Request explicit save approval**

  Ask the user whether the shown draft should be saved. If the user requests a revision, keep the same transaction active and perform the requested edit operations before asking again. If the user rejects the draft, call `canva_cancel_editing_transaction`.

- [ ] **Step 2: Commit only after approval**

  Call `canva_commit_editing_transaction` with the exact Task 3 transaction ID only after explicit approval. Do not claim the design is saved before this succeeds.

- [ ] **Step 3: Verify saved design metadata and text**

  Call `canva_get_design` and `canva_get_design_content` for page 1. Require one page, 840×1498px, and exact presence of all three strings with no substitutions:

  ```text
  08.01 ~ 08.31
  신제품 20% OFF 출시기념
  가장 먼저 만나는 새로운 경험! 장인의 손으로 한땀한땀 빚어낸
  ```

- [ ] **Step 4: Verify final visual placement**

  Use the saved design thumbnail or page thumbnail to confirm: image 1 top-center; image 2 top-right; images 3–5 below supporting copy 2; image 6 bottom-center; no product/copy overlap; blue-white beach direction; visible white assets on blue.

- [ ] **Step 5: Hand off the Canva edit link**

  Provide the direct Canva edit URL and report separately: what is complete, what the user will notice, any remaining limitations, and whether another user decision is needed.

---

## Plan Self-Review

- Spec coverage: Tasks 1–5 cover all nine sections of the approved design specification, including asset fidelity, text fidelity, exact canvas size, placement, editability, draft approval, and final verification.
- Placeholder scan: every action, parameter, expected result, and failure response is specified.
- Interface consistency: the ordered original asset IDs flow from Task 1 to Tasks 2 and 4; the selected design ID flows from Task 2 through resize; the resized design ID creates the single transaction used by Tasks 3–5.
