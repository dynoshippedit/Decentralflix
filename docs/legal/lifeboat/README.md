# Decentralflix Lifeboat — Legal Basics (index)
**Prepared 2026-09-28**

> **NOT LEGAL ADVICE.** These documents are internal preparation for the DecentralFlix Lifeboat launch (target Nov 20, 2026, per the strategy doc "DecentralFlix: How to Corner a Market in 2026"). They are not legal advice, they do not create an attorney–client relationship, and nothing here authorizes filing anything with any government office. **Every document in this set needs a lawyer's read before launch** — especially anywhere money changes hands or liability attaches.

## The documents

1. [`dmca-agent-checklist.md`](dmca-agent-checklist.md) — Registering a DMCA designated agent with the U.S. Copyright Office (safe harbor under 17 U.S.C. § 512): what's needed, the renewal requirement, and publishing the agent's contact on the site. Includes a template for the site's DMCA contact page.
2. [`takedown-sop.md`](takedown-sop.md) — Notice-and-takedown SOP: how rights-holders submit notices, intake triage, when to disable a title, counter-notice handling, the repeat-infringer policy, and response-time targets. Includes acknowledgement and filmmaker-notification email templates plus a takedown log.
3. [`csam-reporting.md`](csam-reporting.md) — CSAM reporting flow: report to the NCMEC CyberTipline, preserve-but-don't-distribute rule, internal escalation, and the note that the duty applies regardless of architecture (CDN, P2P, or otherwise). Includes role assignments and an incident log template.
4. [`buy-label-rule.md`](buy-label-rule.md) — California AB 2426 compliance for purchase UI: "Buy"/"Purchase" only where the buyer gets a permanent offline download (per the strategy doc's summary of the Morrison Foerster analysis); otherwise "License", "Rent", or "Stream". Mapped to the product's `download_allowed` flag, with UI copy examples and a QA checklist.
5. [`trademark-clearance-prep.md`](trademark-clearance-prep.md) — Trademark clearance **search prep** for "DecentralFlix" (prep only — nothing filed): search strategy, USPTO TESS plus common-law sources, classes 041/038/009 as starting points for counsel to confirm, and the strategy doc's recommendation to consider a benefit-led consumer brand. Ends with the keep-or-rebrand decision for Dino.

## Pre-launch legal gate checklist

None of these gates are satisfied by documentation alone — each needs to be operational and, where noted, reviewed by counsel.

- [ ] **DMCA agent registered** with the Copyright Office; agent contact published on the site; renewal tracked.
- [ ] **Takedown SOP staffed** — the designated agent's inbox is live, the intake log exists, and someone owns each response-time target.
- [ ] **CSAM flow tested** — end-to-end walkthrough with synthetic data completed; responder roles assigned; NCMEC reporting access confirmed.
- [ ] **AB 2426 copy QA'd** — every purchase label derives from the live `download_allowed` flag; no unconditional "buy"/"own" copy anywhere (note: current frontend still carries "buy once, own forever" copy — see `buy-label-rule.md`).
- [ ] **Trademark search reviewed by counsel** — keep-or-rebrand decision made before any brand spend.
- [ ] **Money-transmission opinion obtained** — the strategy doc flags that wallet top-ups later paid out to filmmakers "can raise money-transmission questions" and requires a lawyer's read before launch. Do not enable stored balances without it.

Related strategy-doc risk mitigations these gates support: written content policy + DMCA/CSAM flows as the defense against a payment processor dropping the account; cleared-music attestation at upload for the music-films lane.
