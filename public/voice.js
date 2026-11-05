export function createNumberCaller(synthesis, Utterance) {
  let enabled=false, lastKey='';
  const supported=!!synthesis&&typeof Utterance==='function';
  function voiceFor(language){
    const voices=synthesis?.getVoices()||[];
    return voices.find(v=>v.lang.toLowerCase().startsWith(language==='am'?'am':'en'))
      ||voices.find(v=>v.lang.toLowerCase().startsWith('en'));
  }
  return {
    get supported(){return supported;},
    get enabled(){return enabled;},
    language(language){return voiceFor(language)?.lang||'en-US';},
    toggle(){if(!supported)return false;enabled=!enabled;lastKey='';if(!enabled)synthesis.cancel();return enabled;},
    stop(){synthesis?.cancel();},
    announce(room,language='en'){
      const number=room.drawn.at(-1);
      if(!number||room.status!=='playing')return;
      const key=room.id+':'+room.round+':'+room.drawn.length;
      if(key===lastKey)return;lastKey=key;
      if(!enabled||!supported)return;
      const voice=voiceFor(language),am=voice?.lang.toLowerCase().startsWith('am');
      const letters=am?['ቢ','አይ','ኤን','ጂ','ኦ']:['B','I','N','G','O'];
      const utterance=new Utterance(letters[Math.floor((number-1)/15)]+', '+number);
      utterance.lang=voice?.lang||'en-US';if(voice)utterance.voice=voice;
      utterance.rate=.85;
      synthesis.cancel();synthesis.speak(utterance);
    }
  };
}
