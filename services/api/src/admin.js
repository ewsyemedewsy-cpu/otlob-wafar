import crypto from 'crypto';
import {Buffer} from 'node:buffer';

export function requireAdmin(req,res,next){
  const digest=process.env.ADMIN_API_KEY_SHA256;
  const expected=process.env.ADMIN_API_KEY||'';
  const supplied=req.get('x-admin-key')||'';
  res.set('Cache-Control','no-store');
  if(!supplied||supplied.length>1024||(!digest&&!expected)) return res.status(401).json({error:'unauthorized'});
  // A configured digest takes precedence: malformed configuration never falls back.
  if(digest&&!/^[a-f0-9]{64}$/i.test(digest))return res.status(401).json({error:'unauthorized'});
  const a=crypto.createHash('sha256').update(supplied).digest();
  const b=digest?Buffer.from(digest,'hex'):crypto.createHash('sha256').update(expected).digest();
  if(!crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'unauthorized'});
  next();
}
