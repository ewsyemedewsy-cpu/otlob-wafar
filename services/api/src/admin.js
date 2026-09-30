import crypto from 'crypto';

export function requireAdmin(req,res,next){
  const expected=process.env.ADMIN_API_KEY||'';
  const supplied=req.get('x-admin-key')||'';
  if(!expected||!supplied) return res.status(401).json({error:'unauthorized'});
  const a=Buffer.from(supplied); const b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'unauthorized'});
  next();
}
