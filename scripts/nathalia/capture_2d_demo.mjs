import { chromium } from "playwright";
const b=await chromium.launch({channel:"chrome",headless:true});
const p=await (await b.newContext({viewport:{width:1180,height:760},deviceScaleFactor:2})).newPage();
await p.goto("file:///C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/2d/demo.html");
await p.waitForTimeout(1200);
await p.screenshot({path:"C:/Code/jumpflow/docs/nathalia/audit-screenshots/v03-eval/2d/2d-demo.png"});
console.log("DONE");
await b.close();
