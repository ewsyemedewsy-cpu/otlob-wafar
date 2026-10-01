EMAD STORE V17 - EDGE FUNCTIONS

Functions: payment-create, payment-webhook, bosta-create-shipment, bosta-webhook, fulfillment-worker, whatsapp-dispatch.

لا تضع Secret Key داخل HTML أو JavaScript. ضع الأسرار في Supabase Edge Function Secrets.

Paymob:
- Secret Key + HMAC Secret + Integration IDs يجب أن تكون من نفس Test/Live mode.
- Public Key فقط يظهر في رابط Unified Checkout.
- الـ webhook هو مصدر الحقيقة للدفع، وليس redirect.

Bosta:
- أنشئ webhook في لوحة Bosta على /functions/v1/bosta-webhook.
- يمكن حماية الـ webhook بـ custom header.
- استخدم API Key بصلاحية Read/Write إذا كانت كافية.

WhatsApp:
- قد تتطلب بعض الرسائل Templates حسب قواعد Meta الحالية؛ الكود النصي مناسب فقط عندما تسمح نافذة المحادثة/الحساب.

بعد النشر اضبط:
Paymob notification_url = https://PROJECT-REF.supabase.co/functions/v1/payment-webhook
Bosta webhook URL = https://PROJECT-REF.supabase.co/functions/v1/bosta-webhook
ثم شغّل fulfillment-worker وwhatsapp-dispatch بشكل دوري.
