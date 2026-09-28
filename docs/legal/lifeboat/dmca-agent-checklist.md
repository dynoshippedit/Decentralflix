# DMCA Designated-Agent Registration Checklist
**Decentralflix Lifeboat — Legal Basics** | Prepared 2026-09-28 | **NOT LEGAL ADVICE. Needs a lawyer's read before launch.**

> This document is for internal prep only. It is not legal advice and does not create an attorney–client relationship. Every step below should be reviewed by counsel before you rely on it.

## Why this exists

The strategy doc (plan of record, "DecentralFlix: How to Corner a Market in 2026") lists a **DMCA agent registered with the U.S. Copyright Office** as part of the "Legal basics" required in the first 14 days of the build. The point of registering a designated agent is to preserve the platform's ability to claim the safe harbor under **17 U.S.C. § 512** for material uploaded by users (here: filmmakers) — the statute's notice-and-takedown framework only works for a service provider that has a designated agent on file with the Copyright Office and publishes that agent's contact information on the site.

## Checklist

- [ ] **Confirm the legal entity name of the service provider.** Registration is filed in the name of the business operating the store (the company, not the product). Decide now whether DecentralFlix operates as a company or whether a separate operating entity will be formed — counsel should confirm before filing.
- [ ] **Appoint the designated agent.** A person or role who will receive and triage infringement notices. Must be reliably reachable during business operations; a role-based address (e.g. a `dmca@` inbox) is safer than one person's name, but the registration requires a **named contact**. Decide: name a specific person with a role inbox as the contact address.
- [ ] **Collect the registration details.** Have ready before filing: the service provider's legal name and any alternate names the store operates under; the designated agent's name, physical mailing address, phone number (verify whether required on the current form with counsel), and email address. *(Do not guess at the form's fields — verify the current Copyright Office form with counsel.)*
- [ ] **Verify the current filing fee with counsel.** The Copyright Office charges a fee for designated-agent registration. Do not file until the current fee is confirmed.
- [ ] **File with the U.S. Copyright Office's designated-agent directory** (online system — verify the current portal URL and filing procedure with counsel; portal details change).
- [ ] **Publish the agent's contact information on the site** (see template below). This is a statutory requirement — the agent is only "designated" if rights-holders can actually find them on your site.
- [ ] **Set a calendar reminder for renewal.** Designated-agent registrations must be **renewed periodically** to stay valid — **verify the current renewal period with counsel** — and the registration must be amended promptly if the agent or contact details change. Track the registration in `docs/legal/lifeboat/README.md` gate checklist.
- [ ] **Wire the `dmca@` inbox into the takedown SOP.** The agent's inbox is the intake point for `takedown-sop.md`. Do not register before the SOP is staffed.

## Template: site DMCA contact page (`/dmca`)

```markdown
# DMCA — Copyright Complaints

If you believe material available through DecentralFlix infringes your
copyright, you may submit a notice of claimed infringement to our
designated agent:

**Designated Agent:** [Agent Name]
**Service Provider:** [Legal entity name]
**Address:** [Mailing address]
**Email:** [dmca@domain]
**Phone:** [optional]

Your notice must include the elements required for a valid DMCA notice
(see 17 U.S.C. § 512(c)(3)). Incomplete notices may not be acted on.

We process valid notices under our [takedown policy](/dmca-takedown-policy).
If you believe your material was removed by mistake, you may submit a
counter-notice to the same contact.

© [Legal entity name], [year]. All rights reserved.
```

**Open items for counsel:** filing fee, current portal procedure, whether the company structure requires separate registrations, and the renewal period. Do not launch the store publicly with uploads enabled until this checklist is complete and counsel has signed off.
