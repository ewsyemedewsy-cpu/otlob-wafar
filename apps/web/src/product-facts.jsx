import React from 'react';
const fields={brand:'العلامة التجارية',model:'الموديل',color:'اللون',size:'المقاس',condition:'حالة المنتج',warranty:'الضمان',contents:'محتويات العبوة'};
export function ProductFacts({product}) {
 const specs=product.specifications||{};
 return <section className="product-facts" aria-label="بيانات المنتج"><h3>قبل ما تطلب</h3><dl><dt>كود المنتج</dt><dd>{product.sku}</dd>{Object.entries(fields).map(([key,label])=>typeof specs[key]==='string'||typeof specs[key]==='number'?<React.Fragment key={key}><dt>{label}</dt><dd>{String(specs[key])}</dd></React.Fragment>:null)}<dt>التوفر</dt><dd>{product.stock_quantity===0?'نفد المخزون':product.stock_quantity==null?(product.fulfillment_source==='owned'?'مخزون المتجر — يحتاج حصرًا وتأكيدًا':'توريد عند الطلب — يحتاج تأكيد التوفر'):'متاح: '+product.stock_quantity+' قطعة لهذا الاختيار'}</dd></dl>{!specs.warranty&&<p>بيانات الضمان غير مذكورة؛ تحقق منها قبل الشراء.</p>}<p>الشحن يُحسب حسب المحافظة داخل السلة. موعد التسليم يحتاج تأكيدًا؛ لا يوجد موعد مؤكد لهذا المنتج حاليًا.</p></section>;
}
