# "Buy" Label Rule — California AB 2426 Compliance
**Decentralflix Lifeboat — Legal Basics** | Prepared 2026-09-28 | **NOT LEGAL ADVICE. Needs a lawyer's read before launch.**

> This document is for internal prep only. It is not legal advice. Counsel must confirm the AB 2426 interpretation and the exact disclosure wording before launch copy ships.

## The rule (per the strategy doc's summary of the Morrison Foerster analysis)

California AB 2426 requires sellers of digital goods to disclose when a "purchase" is actually a **revocable license** — unless the buyer gets a **permanent offline download**, which is the exemption. The strategy doc's formulation: *"California now makes sellers disclose revocable licenses unless the buyer gets a permanent offline download (Morrison Foerster, Media Play News)"* and, on product design: *"a DRM-free download option for filmmakers who opt in. That meets California's permanent-download exemption, so 'Buy' is literally true."*

Operational rule for this store:

- The words **"Buy" / "Purchase"** may be used **only** where the buyer receives a **permanent, DRM-free offline download** they keep regardless of the platform's future.
- Everywhere else — streaming-only access, time-limited access, platform-hosted playback that can be revoked — use **"License"**, **"Rent"**, or **"Stream"**. Never "Buy".

## Mapping to the product's `download_allowed` flag

Each title carries a per-title flag set at upload (filmmaker opts in to DRM-free download; verify flag name/shape with engineering):

| `download_allowed` | What the buyer gets | Permitted button/label copy |
|---|---|---|
| `true` | Permanent DRM-free offline download + streaming | **"Buy — yours to keep"** |
| `false` | Streaming access only (revocable license) | **"License to stream"** (or "Rent" for time-limited, per title settings) |

The flag must be **source of truth at render time** — the checkout button, the title page, the cart, the confirmation email, and the library page must all read the same flag. A title with `download_allowed=false` must never display "Buy" anywhere, including marketing emails and filmmaker-generated share links.

Additional constraints:
- If a title's flag changes after launch (filmmaker withdraws the download option), **existing buyers keep their download rights** — "buy means buy" is the store's promise and the legal basis for having used the word. New buyers see the new label.
- Receipts must record which label was shown at purchase (this is what the signed portable receipt should attest).
- The store's own marketing copy ("buy once, own forever") is only lawful if it describes `download_allowed=true` titles. Audit site-wide copy, not just buttons.

## UI copy examples

**Title page, `download_allowed=true`:**
> **Buy — yours to keep** · $4.00
> *Includes a permanent DRM-free download. This film stays yours even if DecentralFlix shuts down.*

**Title page, `download_allowed=false`:**
> **License to stream** · $4.00
> *Streaming access on DecentralFlix. This is a license, not a purchase — no offline download is included.*

**Cart / checkout, mixed cart:**
> You're buying 1 film to keep and licensing 1 film to stream. [shows per-item labels]

**Confirmation email:** repeat the per-item label. The receipt is the record of what was promised.

**Library page, `download_allowed=true` title:**
> Owned · Download available · Receipt #…

## QA checklist (run before every release touching purchase UI)

- [ ] Every checkout button's label is derived from the live `download_allowed` flag — no hardcoded "Buy".
- [ ] No occurrence of "buy"/"purchase" on pages for `download_allowed=false` titles (grep the rendered pages, not just the source templates).
- [ ] Filmmaker upload flow makes the download opt-in explicit and explains the labeling consequence.
- [ ] Receipts/email templates render the correct per-item label.
- [ ] Flag-change path tested: label updates for new buyers; prior buyers' rights preserved.
- [ ] Site-wide marketing copy audited for "buy"/"own" claims (homepage, demo page, metadata descriptions — the current frontend still carries "buy once, own forever" copy that must be gated on this rule).
- [ ] Counsel has reviewed the final label wording.

**Known gap (flagged, not fixed here):** the current frontend copy (homepage, mint page, demo page, meta descriptions) uses "Buy once. Own forever." unconditionally. Until the label rule is implemented in the UI, that copy is a liability. Counsel should review the interim copy plan.
