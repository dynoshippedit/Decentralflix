# Notice-and-Takedown Standard Operating Procedure
**Decentralflix Lifeboat — Legal Basics** | Prepared 2026-09-28 | **NOT LEGAL ADVICE. Needs a lawyer's read before launch.**

> This document is for internal prep only. It is not legal advice and does not create an attorney–client relationship. Counsel must review this SOP before the store handles its first notice.

## Scope

This SOP covers copyright infringement notices for films uploaded by filmmakers to the DecentralFlix store. It is the procedure the designated DMCA agent (see `dmca-agent-checklist.md`) follows. The strategy doc requires a "takedown flow" as part of Legal basics, and notes that duties apply "whatever the architecture" — CDN delivery, P2P seeding, or both.

## How a rights-holder submits a notice

Direct them to the DMCA contact page (`/dmca`) with the designated agent's email. A valid notice under 17 U.S.C. § 512(c)(3) must contain:

1. A physical or electronic signature of the complaining party (or their authorized agent).
2. Identification of the copyrighted work claimed to be infringed (or a representative list if multiple works).
3. Identification of the material claimed to be infringing and information reasonably sufficient to locate it (e.g. the film's store URL / title / catalog ID).
4. The complainant's contact information (address, phone, email).
5. A statement that the complainant has a good-faith belief the use is not authorized.
6. A statement, under penalty of perjury, that the information in the notice is accurate and that the complainant is authorized to act.

**Invalid notices** (missing elements, sent to the wrong address, or not plausibly identifying copyrighted material) are logged and replied to with a deficiency notice — they do not trigger takedown on their own. When in doubt, counsel decides.

## Intake triage (agent's steps)

1. **Log it.** Every notice, valid or not, gets a row in the takedown log: date/time received, complainant name + contact, work claimed, material identified, validity check result, action taken. Template at the bottom of this doc.
2. **Validate** against the six elements above. If invalid → send the deficiency template, log, done.
3. **Verify the material exists on the store** and note which copies exist (CDN objects, P2P-seeded copies the store tracks, preview thumbnails/trailers).
4. **Preserve evidence** before acting: snapshot the title's metadata, upload records, and the notice itself. Do not delete the record when you disable the title.
5. **Consult counsel** on any notice that is ambiguous, that targets a title with significant revenue, or that looks like a bad-faith or automated mass notice.

## When to disable access

- On a **valid** notice: disable public access to the identified title **expeditiously**. Internal target: acknowledge within 1 business day, disable within 2 business days of validation (proposed internal targets — counsel to confirm; the statute uses "expeditiously").
- Disabling means: title delisted from catalog/search, purchase and streaming disabled, CDN serving stopped for that title. If the architecture seeds P2P copies, stop serving them from store-controlled infrastructure and log what was done (verify with counsel what "disable access" requires for copies the store does not fully control).
- Buyers who already purchased a permanent download keep what they downloaded — takedown stops *new* distribution; do not remote-delete buyers' files. Flag this in the buyer's receipt history as "title removed from store — pending rights review."
- **Do not disable on an invalid notice.** Reply with the deficiency template instead.

## Counter-notice handling

If the uploading filmmaker submits a counter-notice (their own signature, identification of the removed material, a statement under penalty of perjury of good-faith belief the removal was a mistake/misidentification, name/address, and consent to jurisdiction — verify exact elements with counsel):

1. Log it and acknowledge receipt to the filmmaker.
2. Forward a copy to the original complainant.
3. Unless the complainant files suit and notifies the store within the statutory window (verify the current window with counsel — historically 10–14 business days), restore access after that window expires.
4. Any deviation from this sequence requires counsel's sign-off.

## Repeat-infringer policy

A § 512 safe harbor requires a policy for terminating, in appropriate circumstances, users who are **repeat infringers**. For this store:

- Each valid, uncontested takedown against a filmmaker's upload counts as one strike against that filmmaker's account. Strikes are logged per account, not per title.
- **Proposed policy (counsel to confirm):** two valid strikes within 12 months → written warning and mandatory rights-attestation for future uploads; three valid strikes within 12 months → account termination and catalog removal, with appeal to counsel. Counter-notices that result in restoration erase the strike.
- The music-films lane gets zero tolerance on upload attestation: per the strategy doc, only titles with cleared music, attested at upload, are accepted there — repeat claims against one filmmaker means their catalog is removed.
- Publish a short version of the repeat-infringer policy in the ToS.

## Response-time targets (internal, counsel to confirm)

| Step | Target |
|---|---|
| Acknowledge receipt of notice | 1 business day |
| Validity determination | 2 business days |
| Disable access on valid notice | 2 business days from validation |
| Notify uploading filmmaker | Same day as disable |
| Process counter-notice | 2 business days |

## Template: acknowledgement to complainant

```
Subject: Receipt of copyright notice — [Title / catalog ID]

[Name],

We received your notice of claimed infringement dated [date] regarding
"[Work claimed]" and the material at [store URL / catalog ID].

Our designated agent is reviewing it for completeness under 17 U.S.C.
§ 512(c)(3). If the notice is valid, we will disable access expeditiously
and notify the uploader. If information is missing, we will contact you.

Reference ID: [LOG-ID]

[Agent name], Designated DMCA Agent
[Legal entity name]
```

## Template: notice to uploading filmmaker

```
Subject: Your title "[Title]" has been removed pending a copyright review

[Filmmaker name],

We received a valid copyright infringement notice concerning your upload
"[Title]" ([catalog ID]). Access to the title has been disabled pending
review, per our takedown policy.

If you believe this removal was a mistake or misidentification, you may
submit a counter-notice to [dmca@domain] containing the elements
described at [store URL]/dmca. Making a false counter-notice under
penalty of perjury carries legal consequences — consult counsel before
submitting one.

Your account strike count is now [N]. Our repeat-infringer policy is at
[store URL]/terms.

[Agent name], Designated DMCA Agent
[Legal entity name]
```

## Takedown log template

| Log ID | Date received | Complainant | Work claimed | Store material (URL/ID) | Valid? | Action | Date disabled | Filmmaker notified | Counter-notice? | Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| T-0001 | | | | | | | | | | |
