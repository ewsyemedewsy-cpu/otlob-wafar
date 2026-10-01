# متطلبات إطلاق الفيوم

هذه القائمة تفصل بين نجاح فحص البرمجيات وجاهزية قبول طلبات حقيقية. ليست إعلانًا بأن المتجر منشور.

| المتطلب | الحالة الحالية | ما يغلقه |
|---|---|---|
| الواجهة والإدارة على الكمبيوتر والموبايل | نجحت اختبارات CI رقم 54 | إعادة الفحص عند تعديل الواجهة |
| التسعير وحجز المخزون والإلغاء والسجل | اختبارات Node وقاعدة التجارب ناجحة | طلب كامل من واجهة منشورة إلى الخادم والقاعدة |
| محوّل Cloudflare | بناء ومحاكاة ناجحان | نشر فعلي وفحص حدود الخطة وعنوان العميل والحماية بين النسخ |
| استضافة فعلية | لم تُنشأ بعد | حساب استضافة يمكن الوصول إليه بأمان |
| Paymob | الحساب تحت مراجعة المزود؛ متوقف | قبول الحساب وتأكيد التعرفة واختبارات الدفع قبل تفعيله |
| الدفع عند الاستلام | مسار التجارب الحالي | تحديد مسؤول التحصيل وتسوية كل مبلغ؛ التسليم لا يؤكد التحصيل تلقائيًا |
| مخزون المحل | مسودات وتقديرات | تأكيد الموديلات واللون والمقاس والعدد الفعلي قبل إتاحتها للشراء |
| بيانات المتجر والتوصيل | تحتاج تأكيدًا | هاتف وعنوان وساعات عمل ونطاق الفيوم ورسوم ومدة التوصيل |
| الموردون والبحث الآلي | الدليل ومسار المصادر جاهزان؛ لا مصادر معتمدة متصلة | عروض حديثة للقطعة وتوافر واتفاق تواصل/شراء موثوق |
| سياسة الاستبدال والرفض | تحتاج اعتماد النص التشغيلي | عرض نص واضح متسق في المتجر والطلب والفاتورة قبل أول بيع |
| تنبيهات خارجية وشحن حي | لم يُختبرا فعليًا | اختبار ببيانات مصرح بها واعتماد جهة الإرسال والتنفيذ |

## ترتيب التنفيذ

إعداد نسخة التجارب `ORDER_GOVERNORATES=FAYOUM` يقصر استقبال الطلبات على الفيوم في الخادم واختيار التوصيل بالواجهة. يبقى التصفح متاحًا من أي مكان. يمكن توسيع القائمة لاحقًا مثل `FAYOUM,CAIRO`، دون حذف الأقسام أو دعم المحافظات الأخرى. يجب تأكيد أن العنوان الفعلي يقع داخل نطاق التوصيل عند متابعة الطلب؛ اختيار المحافظة ليس تحققًا آليًا من الموقع الجغرافي.

1. إنهاء الاختبارات والإعداد دون بطاقة أو تغيير بيانات الإنتاج.
2. حل الوصول للاستضافة ونشر نسخة التجارب فقط.
3. تنفيذ طلب تجريبي كامل ثم الإلغاء والتسليم والتحصيل، والتحقق من المخزون والسجل.
4. إدخال منتجات مؤكدة وبيانات المتجر والتوصيل واعتماد السياسة.
5. بدء إطلاق محدود في الفيوم بالدفع عند الاستلام بعد غلق متطلبات الطلب والتشغيل. تبقى الأقسام العامة محفوظة؛ لا تُعرض منتجات غير مؤهلة للتسعير أو غير متاحة للشراء.
6. تفعيل Paymob والشراء الآلي والإرسال والشحن تدريجيًا بعد قبول الحسابات والاتفاقات والاختبارات، دون ربطها بوعد موعد غير متحقق.

## Demand beyond the initial delivery area
Visitors can explicitly record anonymous interest in currently unsupported delivery regions. Valid blocked checkout attempts also record a separate signal while remaining rejected. The administration alert center shows a 30-day regional breakdown; counts represent signals, not unique customers or accepted orders. No names, phones, addresses or IPs are stored in these signals. A request key is hashed and deduplicated per region/source/Cairo calendar day. Direct client access is revoked, and only the server can record or summarize signals. Recording outages show an error and never permit an unsupported order. The feature is installed in staging; public availability still requires hosting.


Trial deployments now set ORDER_DELIVERY_SCOPE=fayoum_cities. Checkout requires one of Fayoum city, Senouris city, Tamiya city, Itsa city or Abshway city. Youssef El Seddik is not offered and explicitly named addresses are rejected before order creation. Selected city is prefixed to the existing stored address for invoices/admin; no legacy column or data is removed. This is not geolocation: staff must confirm the address is within the selected city rather than an uncovered village. Existing unrestricted configurations remain unchanged. Owner confirmed customer-facing delivery charge of EGP35, contact and opening hours; actual courier expense still needs confirmation.
