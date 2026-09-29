# S5 — fixes applied (smallest coherent change)

DF-1: footnote rewritten to "Platform fee is a fixed 25%, split at payment
time — the creator receives 75% plus any rounding remainder. The owner cannot
change the split or withdraw funds."

DF-2: economics card "30%" changed to "25%"; descriptive text unchanged.

DF-3: constructorArguments: [INITIAL_PLATFORM_FEE_BPS] changed to
constructorArguments: []. The symbol is referenced nowhere else; nothing
else to remove.

Full diff of the three files:

diff --git a/apps/frontend/app/dashboard/page.tsx b/apps/frontend/app/dashboard/page.tsx
index f42332b..c722391 100644
--- a/apps/frontend/app/dashboard/page.tsx
+++ b/apps/frontend/app/dashboard/page.tsx
@@ -491,7 +491,7 @@ export default function DashboardPage() {
                     </div>
                   ))}
                 </div>
-                <div className="text-[10px] text-white/40 mt-2">Platform fee (currently 25%, adjustable by the owner, hard-capped at 25%) stays in the contract for the owner to withdraw.</div>
+                <div className="text-[10px] text-white/40 mt-2">Platform fee is a fixed 25%, split at payment time — the creator receives 75% plus any rounding remainder. The owner cannot change the split or withdraw funds.</div>
               </div>
             </div>
 
diff --git a/apps/frontend/app/demo/page.tsx b/apps/frontend/app/demo/page.tsx
index ce6f937..7684222 100644
--- a/apps/frontend/app/demo/page.tsx
+++ b/apps/frontend/app/demo/page.tsx
@@ -167,7 +167,7 @@ export default function DemoPage() {
               <div className="text-white/50 text-sm">To the creator's wallet, on-chain. No invoices.</div>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
-              <div className="text-3xl font-semibold mb-2">30%</div>
+              <div className="text-3xl font-semibold mb-2">25%</div>
               <div className="text-white/50 text-sm">Platform fee. Covers Cloudflare, Livepeer, Arbitrum gas, backend ops.</div>
             </div>
             <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
diff --git a/packages/contracts/scripts/deploy.ts b/packages/contracts/scripts/deploy.ts
index 96ca58d..e55b69a 100644
--- a/packages/contracts/scripts/deploy.ts
+++ b/packages/contracts/scripts/deploy.ts
@@ -86,7 +86,7 @@ async function main() {
     try {
       await run("verify:verify", {
         address: movieTicketAddress,
-        constructorArguments: [INITIAL_PLATFORM_FEE_BPS],
+        constructorArguments: [],
       });
       console.log("✅ Contract verified successfully!");
     } catch (verifyError: any) {
