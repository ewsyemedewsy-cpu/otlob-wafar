import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
fs.mkdirSync('qa',{recursive:true});const results=[];
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.TEST_WEB_URL||'http://127.0.0.1:4173/'));await page.getByRole('heading',{name:'اكتشف ما يناسبك'}).waitFor();
 assert.equal(await page.locator('.product').count(),4);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const fullScreen=async selector=>{const bounds=await page.locator(selector).boundingBox();assert.ok(bounds&&Math.abs(bounds.x)<=1&&Math.abs(bounds.y)<=1,selector+' starts at viewport origin');assert.ok(bounds.width>=viewport.width-2&&bounds.height>=viewport.height-2,selector+' fills viewport');};
 assert.equal(await page.locator('header').evaluate(el=>getComputedStyle(el).position),'relative');
 await page.getByRole('button',{name:/أدوات ومستلزمات مدرسية/}).click();await page.getByText('هذا القسم موجود بالمتجر؛ لم تُضف له منتجات متاحة بعد.',{exact:true}).waitFor();
 await page.locator('.main-categories button').first().click();assert.equal(await page.locator('.product').count(),4);
 for(const name of ['عن المتجر','التواصل والاستلام','التوصيل والاستبدال','الخصوصية']){await page.getByRole('navigation',{name:'معلومات المتجر'}).getByRole('button',{name,exact:true}).click();await fullScreen('.info-page');await page.getByRole('button',{name:'العودة للمتجر',exact:true}).click();assert.equal(await page.locator('.info-page').count(),0);}
 await page.getByRole('button',{name:'حفظ في المفضلة: خلاط كهربائي 1000 وات',exact:true}).click();await page.reload();await page.getByRole('button',{name:'المفضلة (1)',exact:true}).click();assert.equal(await page.locator('.product').count(),1);await page.getByRole('button',{name:'إزالة من المفضلة: خلاط كهربائي 1000 وات',exact:true}).click();assert.equal(await page.locator('.product').count(),0);await page.getByRole('button',{name:'عرض كل المنتجات (0)',exact:true}).click();assert.equal(await page.locator('.product').count(),4);
 await page.getByRole('button',{name:'تبديل السمة'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.getByRole('button',{name:'أضف للسلة'}).first().click();await page.reload();assert.equal(await page.locator('.cartbtn span').textContent(),'1');
 await page.locator('.cartbtn').click();await page.locator('#cart').waitFor({state:'visible'});assert.equal(await page.locator('#cart .cartrow').count(),1);
 await fullScreen('#cart');
 assert.equal(await page.locator('#cart .checkout').isDisabled(),true);await page.locator('#cart .modalhead button').click();
 await page.getByRole('textbox',{name:'البحث عن منتج'}).fill('سماعة');assert.equal(await page.locator('.product').count(),1);await page.getByRole('textbox',{name:'البحث عن منتج'}).fill('');
 assert.ok(await page.locator('header .brand-mark').evaluate(img=>img.complete&&img.naturalWidth>0));
 await page.getByRole('textbox',{name:'البحث عن منتج'}).fill('منتج غير موجود');await page.getByRole('button',{name:'ابحث خارج المتجر'}).click();await page.getByText('البحث الخارجي غير متاح الآن؛ يحتاج ربط مصادر الأسعار والموردين.').waitFor();await page.getByRole('textbox',{name:'البحث عن منتج'}).fill('');
 await page.getByRole('button',{name:'فحص ومقارنة'}).first().click();const detailBounds=await page.locator('.product-page').boundingBox();assert.ok(Math.abs(detailBounds.y)<=1);assert.ok(detailBounds.height>=viewport.height-2);assert.ok(detailBounds.width>=viewport.width-2);await page.getByText('المقارنة تحتاج اتصال المتجر؛ المنتجات المعروضة للتجربة.').waitFor();await page.locator('.product-page .modalhead button').click();
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`qa/store-light-${viewport.width}.png`,fullPage:true});await page.getByRole('button',{name:'تبديل السمة'}).click();await page.screenshot({path:`qa/store-dark-${viewport.width}.png`,fullPage:true});
 assert.deepEqual(errors,[]);results.push({viewport,themePersistence:true,cartPersistence:true,search:true,comparison:true,noOverflow:true,noRuntimeErrors:true});await context.close();
}fs.writeFileSync('qa/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close()}
