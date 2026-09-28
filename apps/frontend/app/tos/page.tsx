'use client';

import Link from 'next/link';

const TOS_CONTENT = `# DecentralFlix Terms of Service  
Last Updated: May 29, 2026  

**1. Acceptance of Terms**  
By accessing or using DecentralFlix (the “Platform”), you agree to these Terms of Service (“Terms”). If you do not agree, do not use the Platform.

**2. Non-Custodial Decentralized Platform**  
DecentralFlix is a non-custodial software interface that connects users directly to blockchain networks. We do not hold, control, custody, or have access to any user funds, NFTs, credits, or assets. All transactions (minting, sales, crowdfunding, escrow, P2P credits) occur solely on-chain via user-controlled wallets and smart contracts. The Platform provides no financial services, money transmission, or custodial functions.

**3. User-Generated Content & Zero-Censorship Policy**  
Users retain ownership of their content. You grant us a worldwide, royalty-free license to host, display, and make your content available on the Platform. We do not curate, endorse, or moderate content except as required by law (e.g., DMCA). We support a zero-censorship policy to the maximum extent permitted by Section 230 of the Communications Decency Act. You are solely responsible for your content.

**4. NFTs, Minting, Sales, Access Gating, Crowdfunding, Escrow & P2P Credits**  
All NFTs are utility/access tokens only. Producer-tier crowdfunding, milestone escrows, and P2P credits are facilitated solely through decentralized smart contracts. We make no representations regarding value, completion of milestones, repayment, or any returns. These are not investment contracts, securities, or financial products.

**5. Crypto/NFT Volatility & Risk Disclaimers**  
Cryptocurrencies and NFTs are highly volatile. You may lose all value. The Platform is provided “AS IS” with no guarantees of liquidity, functionality, or future value. We provide no financial, investment, tax, or legal advice. You assume all risk.

**6. No Financial or Investment Advice**  
Nothing on the Platform constitutes financial, investment, or trading advice. Any information is for entertainment/educational purposes only.

**7. Disclaimers of Warranties**  
THE PLATFORM IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT ANY WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, OR NON-INFRINGEMENT.

**8. Limitation of Liability**  
TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE AND OUR OPERATORS, AFFILIATES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR ASSETS ARISING OUT OF OR RELATED TO THE PLATFORM, EVEN IF ADVISED OF THE POSSIBILITY.

**9. Indemnification**  
You agree to indemnify, defend, and hold harmless DecentralFlix, its operator (Dino), affiliates, and agents from any claims, damages, losses, liabilities, costs, and expenses (including attorneys’ fees) arising from your use of the Platform, your content, your transactions, or your violation of these Terms or any law.

**10. DMCA Safe-Harbor Policy**  
We respect copyright. Designated Copyright Agent: [INSERT REGISTERED AGENT NAME/EMAIL/ADDRESS — register at copyright.gov first]. We will respond to valid DMCA notices with expeditious takedown of access links. Repeat infringers will have their accounts terminated. See full DMCA policy [link].

**11. Arbitration & Class-Action Waiver**  
Any dispute arising out of or related to these Terms or the Platform shall be resolved by binding individual arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, conducted in Cleveland, Ohio (or another mutually agreed location). You waive any right to a jury trial or class action. Governing law: Delaware (internal affairs) and Ohio (other matters), without regard to conflict of laws principles.

**12. Miscellaneous**  
These Terms constitute the entire agreement. If any provision is unenforceable, the remainder remains in effect. We may update these Terms; continued use constitutes acceptance. Contact: [your chosen contact, non-custodial notice only].`;

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-10">
          <Link href="/" className="text-sm text-white/60 hover:text-white">← Back to Decentralflix</Link>
          <div className="mt-6 flex items-center gap-3">
            <div className="inline-block px-4 py-1 text-xs tracking-[3px] border border-white/30 rounded-full">
              LEGALLY BINDING • NON-CUSTODIAL • UTILITY ONLY
            </div>
            <div className="text-xs text-white/40">Last Updated: May 29, 2026</div>
          </div>
          <h1 className="text-6xl font-semibold tracking-[-2.5px] mt-4">Terms of Service</h1>
          <p className="mt-3 text-xl text-white/70 max-w-2xl">
            This is the full, binding agreement for using Decentralflix — a fully non-custodial, censorship-resistant platform for permanent film ownership.
          </p>
        </div>

        <article className="prose prose-invert prose-white max-w-none text-[15px] leading-relaxed">
          {TOS_CONTENT.split('\n\n').map((para, idx) => {
            if (para.startsWith('**') && para.includes('**  ')) {
              // Section header
              return <h2 key={idx} className="text-2xl font-semibold tracking-tight mt-10 mb-3 text-white">{para.replace(/\*\*/g, '')}</h2>;
            }
            if (para.startsWith('**')) {
              return <p key={idx} className="font-medium text-emerald-400 mt-6">{para.replace(/\*\*/g, '')}</p>;
            }
            return <p key={idx} className="text-white/90">{para}</p>;
          })}
        </article>

        <div className="mt-16 pt-8 border-t border-white/10 text-xs text-white/50 flex flex-col md:flex-row gap-2 md:items-center justify-between">
          <div>Decentralflix is a non-custodial interface only. All transactions are executed directly by you on public blockchains via smart contracts.</div>
          <Link href="/privacy" className="hover:text-white underline">View Privacy Policy →</Link>
        </div>
      </div>
    </div>
  );
}
