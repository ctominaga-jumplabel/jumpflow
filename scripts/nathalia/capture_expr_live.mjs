import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE=process.env.SHOT_BASE_URL||"http://localhost:3000";
const OUT="C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/2d/live";
mkdirSync(OUT,{recursive:true});
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await (await b.newContext({viewport:{width:1440,height:900},reducedMotion:"no-preference"})).newPage();
await p.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"}).catch(()=>{});
await p.getByRole("button",{name:/desenvolvimento/i}).click();
await p.waitForTimeout(1500);

// --- Lab: expression per STATE ---
try{
  await p.goto(`${BASE}/app/dev/nathalia`,{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(2500);
  const states=["welcome","thinking","searching","happy","success","warning","celebrate","pointing"];
  for(const st of states){
    const chip=p.getByRole("button",{name:new RegExp(`^${st}$`,"i")}).first();
    if(await chip.count()){ await chip.click().catch(()=>{}); await p.waitForTimeout(700); }
    const ava=p.locator('[data-nathalia-variant="2d-expr"]').first();
    if(await ava.count()){
      const expr=await ava.getAttribute("data-nathalia-expression");
      await ava.screenshot({path:`${OUT}/state-${st}__${expr}.png`}).catch(()=>{});
      console.log(`state ${st} -> ${expr}`);
    }
  }
}catch(e){console.log("lab err",e.message);}

// --- Routes: expression per SCREEN (launcher) ---
const routes=[["horas","/app/horas"],["projetos","/app/projetos"],["aprovacoes","/app/aprovacoes"],["relatorios","/app/relatorios"]];
for(const [name,path] of routes){
  try{
    await p.goto(`${BASE}${path}`,{waitUntil:"domcontentloaded",timeout:15000});
    await p.waitForTimeout(2200);
    const launcher=p.locator("[data-nathalia-launcher]").first();
    if(await launcher.count()){
      const ava=launcher.locator('[data-nathalia-expression]').first();
      const expr=await ava.getAttribute("data-nathalia-expression").catch(()=>null);
      const box=await launcher.boundingBox();
      if(box) await p.screenshot({path:`${OUT}/route-${name}__${expr}.png`, clip:{x:box.x-10,y:box.y-10,width:box.width+20,height:box.height+20}}).catch(()=>{});
      console.log(`route ${name} -> ${expr} box=${box?Math.round(box.x)+','+Math.round(box.y):'none'}`);
    } else console.log(`route ${name}: no launcher`);
  }catch(e){console.log(`route ${name} err`,e.message);}
}
await b.close(); console.log("DONE");
