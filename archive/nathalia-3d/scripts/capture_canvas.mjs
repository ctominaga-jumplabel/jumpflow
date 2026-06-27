import { chromium } from "playwright";
const BASE="http://localhost:3000";
const OUT="C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/app";
const b=await chromium.launch({channel:"chrome",headless:true,args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]});
const c=await b.newContext({viewport:{width:1440,height:900},reducedMotion:"no-preference"});
const p=await c.newPage();
await p.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"}).catch(()=>{});
await p.getByRole("button",{name:/desenvolvimento/i}).click();
await p.waitForTimeout(1500);
await p.goto(`${BASE}/app/dev/nathalia`,{waitUntil:"domcontentloaded"});
await p.waitForTimeout(9000); // generous: GLB fetch + draco + WebGL frames
const n=await p.locator("canvas").count();
console.log("canvas count:",n);
for(let i=0;i<n;i++){
  const el=p.locator("canvas").nth(i);
  const box=await el.boundingBox();
  console.log("canvas",i,JSON.stringify(box));
  await el.screenshot({path:`${OUT}/lab-canvas-${i}.png`}).catch(e=>console.log("  shot err",e.message));
}
// also the lab preview container (bigger) by zooming the page
await p.evaluate(()=>{document.body.style.zoom="1"});
console.log("DONE");
await b.close();
