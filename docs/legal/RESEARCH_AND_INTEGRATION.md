# DecentralFlix — Legal Research Summary, Integration Plan & Formation Steps

## 1. Research Summary with Sources
**Platform liability (decentralized NFT streaming sites + UGC):**  
Section 230 of the Communications Decency Act (47 U.S.C. § 230) provides strong immunity for “interactive computer services” against liability for third-party user-generated content. DecentralFlix qualifies as long as the platform does not create or materially contribute to the content. Exceptions exist for intellectual property (handled via DMCA) and certain federal crimes.  

**DMCA safe harbor (17 U.S.C. § 512):**  
Available for copyright claims on streamed or NFT-gated content if the platform designates a registered Copyright Agent, maintains a repeat-infringer policy, and responds expeditiously to valid takedown notices. Blockchain immutability means “takedown” = delisting/removal of access links.  

**NFT sales, crowdfunding via NFTs, milestone escrow, P2P credits:**  
- **Securities risk (Howey test):** NFT minting/sales and access gating are generally treated as utility/consumptive (not securities) per 2026 SEC guidance on digital collectibles. Producer-tier crowdfunding, milestone escrow contracts, and any profit-like expectations tied to platform/creator efforts create high risk of being deemed an “investment contract.”  
- **Money transmission risk:** FinCEN and Ohio Money Transmitters Act (R.C. 1315) treat transmission of value/crypto broadly. Purely non-custodial, on-chain, wallet-to-wallet smart-contract structures significantly reduce or eliminate MSB/MTL licensing requirements. Any custody, centralized facilitation, or platform-held funds triggers licensing (Ohio DFI license + federal MSB registration).  

**Sources (current as of May 2026):** Cornell LII (47 U.S.C. § 230 & 17 U.S.C. § 512), U.S. Copyright Office (DMCA agent directory), SEC Howey framework & 2026 crypto/NFT interpretive guidance, FinCEN CVC Guidance, Ohio Department of Commerce / Division of Financial Institutions (MTL guidance on virtual currency), EFF.org Section 230 resources.  

**Asset-protection structure recommendation:** Delaware LLC (or Wyoming LLC for maximum charging-order protection in single-member setups). Delaware offers business-friendly courts, strong veil protection, and credibility for web3 projects. For an Ohio resident (Cleveland), form the LLC in Delaware then foreign-qualify in Ohio if the platform has nexus. Strict separation of personal and business assets is required.

## 2. Analysis of Website Structure & Potential Regulatory Views
- **NFT minting/sales + access gating:** Low risk if framed purely as utility/access licenses.  
- **Producer-tier crowdfunding + milestone escrow contracts:** High risk of being viewed as securities (Howey) or money transmission if any expectation of profits or centralized control exists.  
- **P2P credit systems:** High risk of money-transmitter classification unless fully non-custodial and on-chain.  

**Maximum-protection strategy (already baked into the ToS):** Explicit non-custodial statements everywhere, utility-only framing, zero profit promises, on-chain-only transactions, and strong disclaimers shift the platform into the safest legal posture possible under current law. Zero-censorship UGC policy is protected by Section 230 but still requires DMCA compliance.

## 3. Step-by-Step Integration Plan (for Grok CLI)
1. Copy the ToS and Privacy Policy into `docs/legal/ToS.md` and `docs/legal/Privacy.md`.  
2. Add footer links, clickwrap acceptance on wallet connect / mint / crowdfunding pages, and embed disclaimers on all NFT/crowdfunding/escrow UI.  
3. Register DMCA agent at copyright.gov and insert real contact into ToS.  
4. Update all marketing/smart-contract comments and site copy to match non-custodial/utility-only language.  
5. Add this research summary and these instructions to local `GROK.md` so Grok CLI maintains hands-off autonomy and legal compliance going forward.  
6. Run local tests to confirm ToS appears correctly and non-custodial flows are enforced.

## 4. Recommended Next Steps for Legal Formation (Maximum Asset Protection)
1. Consult a licensed Ohio/web3 attorney immediately (do not launch without review).  
2. Form a Delaware LLC (recommended) or Wyoming LLC via a service such as Northwest Registered Agent or legal Zoom. Name it something like “DecentralFlix LLC”.  
3. Appoint a registered agent in Delaware.  
4. File foreign qualification in Ohio if nexus exists (Ohio Secretary of State Form 617).  
5. Draft operating agreement (emphasize non-custodial, hands-off operation, and separation of personal assets).  
6. Obtain EIN, open business bank/crypto accounts in LLC name.  
7. Consider D&O/cyber insurance and smart-contract audit.  
8. Update all contracts, ToS, and website to bind to the LLC entity.  

These steps, combined with the non-custodial design and bulletproof ToS, provide the strongest practical liability shield available under current US federal and Ohio law for a decentralized NFT streaming platform.

**Note:** This document is internal reference material derived from public US statutes and 2026 regulatory guidance. All production legal documents (ToS, Privacy, contracts) must be reviewed by licensed counsel prior to mainnet launch. DMCA agent registration and LLC formation are mandatory pre-launch human actions.