import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';import {supplierRecord} from '../services/api/src/suppliers.js';
const browser=await chromium.launch({args:['--no-sandbox']});fs.mkdirSync('qa',{recursive:true});
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let suppliers=[];
 await page.route('https://store-api.example.invalid/**',async route=>{
  const req=route.request(),url=new URL(req.url());let body,status=200;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-admin-key','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}});
  if(url.pathname.startsWith('/admin/')&&req.headers()['x-admin-key']!=='test-only-key'){body={error:'unauthorized'};status=401;}
  else if(url.pathname==='/admin/suppliers'){
   if(req.method()==='POST'){try{const row={id:'supplier-test',...supplierRecord(req.postDataJSON())};suppliers.push(row);body=row;status=201;}catch{body={error:'invalid_supplier_record'};status=400;}}
   else body=suppliers;
  }else if(url.pathname==='/admin/kpis')body={grossSales:100,totalOrders:1};
  else if(url.pathname==='/products'||url.pathname==='/categories'||url.pathname==='/admin/products')body=[];
  else if(url.pathname==='/capabilities')body={onlinePayment:false};else body=null;
  await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 });
 await page.goto(process.env.TEST_WEB_URL||'http://127.0.0.1:4173/');await page.getByRole('button',{name:'دخول الإدارة'}).click();await page.getByPlaceholder('Admin API Key').fill('test-only-key');await page.getByRole('button',{name:'دخول آمن'}).click();await page.getByRole('button',{name:'الموردون'}).click();await page.getByRole('button',{name:'إضافة مورد أو تاجر'}).click();
 await page.getByLabel('اسم المورد أو المتجر',{exact:true}).fill('مورد التجربة');await page.getByLabel('الهاتف',{exact:true}).fill('01012345678');await page.getByLabel('طريقة إتمام الشراء').selectOption('visit');await page.getByLabel('عنوان الزيارة أو الاستلام').fill('عنوان تجريبي');await page.getByLabel('الحد الأدنى للشراء').fill('10');await page.getByLabel('تأكدت أن المورد يبيع قطعة واحدة').check();await page.getByRole('button',{name:'حفظ المورد',exact:true}).click();await page.getByText('تعذر الحفظ.',{exact:false}).waitFor();assert.equal(suppliers.length,0);
 await page.getByLabel('الحد الأدنى للشراء').fill('1');await page.getByRole('button',{name:'حفظ المورد',exact:true}).click();await page.getByText('تم حفظ المورد',{exact:true}).waitFor();assert.equal(suppliers.length,1);assert.equal(suppliers[0].order_method,'visit');assert.equal(suppliers[0].allows_single_units,true);
 await page.getByRole('button',{name:'الأصناف'}).click();await page.getByRole('button',{name:'إضافة صنف'}).click();assert.equal(await page.getByLabel('مصدر المنتج').locator('option').count(),2);await page.getByLabel('مصدر المنتج').selectOption('supplier-test');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.screenshot({path:`qa/supplier-admin-${width}.png`,fullPage:true});await context.close();
}console.log('Supplier directory UI passed on desktop and mobile');}finally{await browser.close();}
