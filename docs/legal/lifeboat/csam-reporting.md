# CSAM Reporting Flow
**Decentralflix Lifeboat — Legal Basics** | Prepared 2026-09-28 | **NOT LEGAL ADVICE. Needs a lawyer's read before launch.**

> This document is for internal prep only. It is not legal advice. The duties described here are legal obligations — counsel must review and approve this flow before the store accepts uploads.

## The duty

Federal law requires electronic service providers to report apparent child sexual abuse material (CSAM) to the National Center for Missing & Exploited Children (NCMEC) **CyberTipline**. Per the strategy doc: *"Keep a DMCA agent, a takedown flow and CSAM reporting; those duties apply whatever the architecture."* CDN delivery, P2P seeding, or a hybrid — the reporting duty does not change with the delivery mechanism. (Verify the precise statutory citation and current reporting requirements with counsel.)

## Preserve — do NOT distribute

- **Preserve** the material, the uploader's account records, upload metadata, IP/timestamps, and any related reports. Do not delete anything related to the incident.
- **Do NOT forward, copy, or distribute the material to anyone** except as required by the reporting process and law enforcement. Do not download it to personal devices, do not share it in chat, do not "verify" it by sending it to a colleague. Viewing must be limited to the minimum necessary to confirm the report, by the designated responder only.
- Staff who encounter apparent CSAM: stop, do not investigate further on your own, and escalate immediately per the steps below.

## Internal escalation steps

1. **Discoverer** (staff, filmmaker report, user report, automated flag): immediately notify the designated CSAM responder (see role assignment below) and the DMCA agent. Do not notify the uploader.
2. **Designated responder**: makes the initial assessment with the minimum viewing necessary, preserves all records, and files the NCMEC CyberTipline report. Target: report filed within 24 hours of discovery (internal target — counsel to confirm; federal law sets its own timing, verify with counsel).
3. **Disable access** to the material on the store immediately, independent of the NCMEC report. Terminate the uploader's account pending review.
4. **Notify Dino** (or the designated executive) the same day. Notify counsel before responding to any law-enforcement contact.
5. **Law enforcement contact**: cooperate, but route all communication through counsel. Do not volunteer material beyond what the report requires without counsel's direction.
6. **Log the incident** in the incident log (template below). The log records the *handling*, not the content — never describe the material in the log.

## Role assignment (fill in before launch)

| Role | Person | Contact |
|---|---|---|
| Designated CSAM responder | [name] | [phone/email] |
| Backup responder | [name] | [phone/email] |
| DMCA agent (takedown coordination) | [name] | [dmca@domain] |
| Counsel of record | [firm/name] | [phone/email] |

## NCMEC CyberTipline report

- Filed through NCMEC's CyberTipline (online portal — verify the current reporting portal and required data fields with counsel; the report typically includes the material or its identifiers, uploader account data, and upload metadata).
- Keep the report confirmation/reference number in the incident log.
- **Test the flow before launch**: walk a simulated report end-to-end (using synthetic test data only — never real CSAM) so the responder, the portal access, and the log all work on day one. The strategy doc's 90-day plan lists CSAM reporting flows as required legal basics; a tested flow is part of that.

## Related risk note

The strategy doc's risk table: a payment processor dropping the account is a top risk, and "written content policy, DMCA and CSAM flows" are the mitigation. A storefront that cannot show processors it handles abuse reports will lose its ability to take payments. Keep this flow, the content policy, and the takedown SOP demonstrably operational — not just documented.

## Incident log template

| Incident ID | Date/time discovered | Discovered by | Material location (internal ref only — no description) | NCMEC report filed (Y/N) | NCMEC ref # | Access disabled (date) | Account action | Counsel notified (date) | LE contact (Y/N, via counsel) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| C-0001 | | | | | | | | | | |

**Rule for the log:** reference numbers and dates only. Never describe or characterize the content of the material in any written record.
