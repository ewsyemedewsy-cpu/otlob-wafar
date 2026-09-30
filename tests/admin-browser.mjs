import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';import {supplierRecord} from '../services/api/src/suppliers.js';
const browser=await chromium.launch({args:['--no-sandbox']});fs.mkdirSync('qa',{recursive:true});
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let suppliers=[];let support=[{id:'request-test',order_id:'order-test',kind:'return',message:'طلب إرجاع منتج تجريبي للمراجعة',status:'pending',customer_reply:''}];
 await page.route('https://store-api.example.invalid/**',async route=>{
  const req=route.request(),url=new URL(req.url());let body,status=200;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-admin-key,authorization','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'}});
  if(url.pathname.startsWith('/admin/')&&req.headers()['x-admin-key']!=='test-only-key'){body={error:'unauthorized'};status=401;}
  else if(url.pathname==='/admin/suppliers'){
   if(req.method()==='POST'){try{const row={id:'supplier-test',...supplierRecord(req.postDataJSON())};suppliers.push(row);body=row;status=201;}catch{body={error:'invalid_supplier_record'};status=400;}}
   else body=suppliers;
  }else if(url.pathname==='/admin/kpis')body={grossSales:100,totalOrders:1};
  else if(url.pathname==='/admin/alerts')body={alerts:[{id:'order:sample',title:'طلب جديد يحتاج متابعة',detail:'طلب تجريبي',at:new Date().toISOString()}]};
  else if(url.pathname==='/admin/support')body=support;
  else if(url.pathname==='/admin/support/request-test'&&req.method()==='PATCH'){Object.assign(support[0],req.postDataJSON());body=support[0];}
  else if(url.pathname.startsWith('/orders/order-test/')){
   if(req.headers().authorization!=='Bearer invoice:test-invoice-token'){status=403;body={error:'forbidden'};}
   else if(url.pathname.endsWith('/status'))body={id:'order-test',order_number:'TEST-ORDER',status:'delivered',payment_status:'paid',payment_method:'wallet',total:100,shipment:null};
   else if(url.pathname.endsWith('/support')){if(req.method()==='POST'){const data=req.postDataJSON();const row={id:'customer-request',order_id:'order-test',kind:data.kind,message:data.message,status:'pending',customer_reply:''};support.push(row);body={id:row.id,status:row.status};status=201;}else body=support;}
  }
  else if(url.pathname==='/products'||url.pathname==='/categories'||url.pathname==='/admin/products')body=[];
  else if(url.pathname==='/capabilities')body={onlinePayment:false};else body=null;
  await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 });
 await page.goto(process.env.TEST_WEB_URL||'http://127.0.0.1:4173/');await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.getByRole('button',{name:'دخول الإدارة'}).click();await page.getByPlaceholder('Admin API Key').fill('test-only-key');await page.getByRole('button',{name:'دخول آمن'}).click();const bounds=await page.locator('.admin-workspace').boundingBox();assert.ok(Math.abs(bounds.x)<=1);assert.ok(Math.abs(bounds.y)<=1);assert.ok(bounds.width>=width-2);assert.ok(bounds.height>=998);await page.getByRole('button',{name:'الموردون'}).click();await page.getByRole('button',{name:'إضافة مورد أو تاجر'}).click();
 await page.getByLabel('اسم المورد أو المتجر',{exact:true}).fill('مورد التجربة');await page.getByLabel('الهاتف',{exact:true}).fill('01012345678');await page.getByLabel('طريقة إتمام الشراء').selectOption('visit');await page.getByLabel('عنوان الزيارة أو الاستلام').fill('عنوان تجريبي');await page.getByLabel('الحد الأدنى للشراء').fill('10');await page.getByLabel('تأكدت أن المورد يبيع قطعة واحدة').check();await page.getByRole('button',{name:'حفظ المورد',exact:true}).click();await page.getByText('تعذر الحفظ.',{exact:false}).waitFor();assert.equal(suppliers.length,0);
 await page.getByLabel('الحد الأدنى للشراء').fill('1');await page.getByRole('button',{name:'حفظ المورد',exact:true}).click();await page.getByText('تم حفظ المورد',{exact:true}).waitFor();assert.equal(suppliers.length,1);assert.equal(suppliers[0].order_method,'visit');assert.equal(suppliers[0].allows_single_units,true);
 await page.getByRole('button',{name:'التنبيهات',exact:true}).click();await page.getByText('طلب جديد يحتاج متابعة',{exact:true}).waitFor();await page.getByRole('button',{name:'تمت المراجعة',exact:true}).click();assert.equal(await page.getByRole('button',{name:'تمت المراجعة',exact:true}).count(),0);
 await page.getByRole('button',{name:'الإرجاع والشكاوى',exact:true}).click();await page.getByText('طلب إرجاع منتج تجريبي للمراجعة',{exact:true}).waitFor();await page.getByLabel('الحالة',{exact:true}).selectOption('reviewing');await page.getByLabel('رد يظهر للعميل').fill('نراجع الطلب مع المورد');await page.getByRole('button',{name:'حفظ الرد والحالة',exact:true}).click();await page.getByText('حُفظ الرد؛ يراه العميل عند تحديث صفحة المتابعة.',{exact:true}).waitFor();assert.equal(support[0].status,'reviewing');assert.equal(support[0].customer_reply,'نراجع الطلب مع المورد');await page.screenshot({path:`qa/support-admin-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'مراجعة الربح',exact:true}).click();await page.getByLabel('الشحن المحصل من العميل').fill('50');await page.getByLabel('تكلفة الشحن الفعلية علينا').fill('50');await page.getByRole('button',{name:'احسب نتائج السيناريو',exact:true}).click();await page.getByText('المنتجات المفحوصة: 0',{exact:false}).waitFor();
 await page.getByRole('button',{name:'الأصناف'}).click();await page.getByRole('button',{name:'إضافة صنف'}).click();assert.equal(await page.getByLabel('مصدر المنتج').locator('option').count(),2);await page.getByLabel('مصدر المنتج').selectOption('supplier-test');
 await page.locator('.adminmodal .modalhead button').click();
 await page.evaluate(()=>sessionStorage.setItem('emad_last_invoice',JSON.stringify({id:'order-test',token:'test-invoice-token'})));
 await page.getByRole('button',{name:'متابعة طلبي والدفع',exact:true}).click();await page.getByText('رد المتجر: نراجع الطلب مع المورد',{exact:true}).waitFor();
 await page.getByLabel('نوع المساعدة').selectOption('complaint');await page.getByLabel('سبب الطلب والتفاصيل').fill('شكوى تجريبية عن تغليف المنتج');await page.getByRole('button',{name:'أرسل للمراجعة',exact:true}).click();await page.getByText('تم تسجيل طلب المساعدة للمراجعة؛ لم يتم إلغاء الطلب أو رد المال تلقائيًا.',{exact:true}).waitFor();assert.equal(support.length,2);assert.equal(support[1].kind,'complaint');await page.getByText('تم التسليم',{exact:true}).waitFor();await page.getByText('تم تأكيد الدفع',{exact:true}).waitFor();await page.screenshot({path:`qa/support-customer-${width}.png`,fullPage:true});await page.getByRole('button',{name:'إغلاق المتابعة',exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.screenshot({path:`qa/supplier-admin-${width}.png`,fullPage:true});await context.close();
}console.log('Supplier directory UI passed on desktop and mobile');}finally{await browser.close();}
