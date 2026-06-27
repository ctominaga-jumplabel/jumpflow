import { chromium } from "playwright";
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await (await b.newContext({viewport:{width:1480,height:560},deviceScaleFactor:2})).newPage();
await p.goto("file:///C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/2d/rig.html");
await p.waitForTimeout(1500);
await p.screenshot({path:"C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/2d/rig-states.png", fullPage:true});
console.log("DONE");
await b.close();
