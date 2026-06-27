import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.SHOT_BASE_URL || "http://localhost:3000";
const OUT = "C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/app";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true,
  args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
const page = await ctx.newPage();
const errs=[]; page.on("console", m=>{ if(m.type()==="error") errs.push(m.text()); });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" }).catch(()=>{});
await page.getByRole("button", { name: /desenvolvimento/i }).click();
await page.waitForTimeout(1500);
async function widgetShot(path, tag){
  const launcher = page.locator("[data-nathalia-launcher]").first();
  await launcher.waitFor({ state:"attached", timeout:8000 }).catch(()=>{});
  await page.waitForTimeout(5000); // GLB+draco decode & first WebGL frames
  const info = await page.evaluate(()=>{const el=document.querySelector("[data-nathalia-launcher]");if(!el)return{found:false};const r=el.getBoundingClientRect();return{found:true,x:Math.round(r.x),y:Math.round(r.y),inVp:r.top>=0&&r.bottom<=innerHeight};});
  console.log(tag,"launcher",JSON.stringify(info));
  if(info.found){ await launcher.screenshot({ path:`${OUT}/${tag}-bubble.png` }).catch(()=>{});
    await launcher.evaluate(el=>el.click()); await page.waitForTimeout(5000);
    await page.screenshot({ path:`${OUT}/${tag}-panel-full.png` });
    const d=page.getByRole("dialog"); if(await d.count()) await d.first().screenshot({ path:`${OUT}/${tag}-panel.png` }).catch(()=>{});
  }
}
try{ await page.goto(`${BASE}/app/dev/nathalia`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(7000);
     await page.screenshot({ path:`${OUT}/lab-fullpage.png`, fullPage:true }); console.log("lab ok"); }catch(e){console.log("lab err",e.message);}
try{ await page.goto(`${BASE}/app`,{waitUntil:"domcontentloaded"}); await page.waitForTimeout(3000); await widgetShot(null,"home"); }catch(e){console.log("home err",e.message);}
console.log("CONSOLE_ERRORS", errs.slice(0,4).join(" || ")||"none");
await browser.close(); console.log("DONE");
