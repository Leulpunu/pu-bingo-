import { timingSafeEqual } from 'node:crypto';

export class TelegramWebhook {
  constructor(secret,handle){
    if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret||''))throw Error('BOT_WEBHOOK_SECRET must contain 32–256 letters, digits, hyphens or underscores.');
    this.secret=secret;this.handle=handle;this.queue=Promise.resolve();this.completed=new Set();
  }
  async deliver(provided,update){
    if(typeof provided!=='string'||Buffer.byteLength(provided)!==Buffer.byteLength(this.secret)||!timingSafeEqual(Buffer.from(provided),Buffer.from(this.secret))){const error=Error('Unauthorized webhook.');error.status=401;throw error;}
    if(!update||!Number.isSafeInteger(update.update_id)||update.update_id<0){const error=Error('Invalid update.');error.status=400;throw error;}
    const result=this.queue.then(async()=>{
      if(this.completed.has(update.update_id))return {ok:true,duplicate:true};
      await this.handle(update);this.completed.add(update.update_id);
      if(this.completed.size>1000)this.completed.delete(this.completed.values().next().value);
      return {ok:true};
    });
    this.queue=result.catch(()=>{});return result;
  }
}
