
/* origin: original sprout mascot and motion system for 歌若思. */
(() => {
  document.documentElement.classList.toggle('electron-shell', /Electron/i.test(navigator.userAgent));
  if(document.documentElement.classList.contains('electron-shell')){
    const brand=document.createElement('div');
    brand.className='electron-window-brand';
    brand.innerHTML='<img src="./assets/growth-logo.png" alt=""><span>歌若思</span>';
    document.body.prepend(brand);
  }
  let nextId=0, pending=0, queued=false;
  const pets=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');

  function markup(id){
    const texture='<image href="./assets/origin-reference.png" x="0" y="0" width="1254" height="1254"/>';
    return '<svg class="origin-art origin-reference-art" viewBox="165 105 925 1000" aria-hidden="true"><defs>'+
      '<clipPath id="'+id+'body"><path d="M573 348L557 350L545 352L534 354L525 356L516 358L508 360L501 362L494 364L487 366L482 368L476 370L471 372L466 374L461 376L457 378L452 380L448 382L444 384L440 386L436 388L432 390L428 392L424 394L421 396L417 398L414 400L410 402L407 404L404 406L400 408L397 410L394 412L391 414L388 416L385 418L382 420L379 422L376 424L374 426L371 428L368 430L366 432L363 434L361 436L358 438L356 440L353 442L351 444L349 446L347 448L345 450L342 452L340 454L338 456L336 458L334 460L332 462L329 464L327 466L325 468L323 470L322 472L320 474L318 476L316 478L314 480L312 482L311 484L309 486L307 488L305 490L303 492L302 494L300 496L298 498L297 500L295 502L294 504L292 506L291 508L289 510L288 512L286 514L285 516L283 518L282 520L280 522L279 524L278 526L276 528L275 530L274 532L272 534L271 536L270 538L269 540L267 542L266 544L265 546L264 548L262 550L261 552L260 554L259 556L258 558L257 560L256 562L255 564L254 566L253 568L252 570L250 572L249 574L248 576L247 578L246 580L245 582L244 584L244 586L243 588L242 590L241 592L240 594L239 596L238 598L237 600L237 602L236 604L235 606L234 608L233 610L232 612L232 614L231 616L230 618L229 620L229 622L228 624L227 626L226 628L226 630L225 632L225 634L224 636L223 638L223 640L222 642L221 644L221 646L220 648L220 650L219 652L218 654L218 656L217 658L217 660L216 662L216 664L215 666L215 668L214 670L213 672L213 674L212 676L212 678L211 680L211 682L210 684L210 686L209 688L209 690L209 692L208 694L208 696L207 698L207 700L207 702L206 704L206 706L206 708L205 710L205 712L205 714L205 716L204 718L204 720L204 722L203 724L203 726L203 728L203 730L202 732L202 734L202 736L202 738L202 740L202 742L202 744L201 746L201 748L201 750L201 752L201 754L201 756L201 758L201 760L201 762L201 764L201 766L201 768L201 770L201 772L201 774L201 776L201 778L201 780L201 782L201 784L201 786L201 788L201 790L201 792L201 794L202 796L202 798L202 800L202 802L202 804L202 806L203 808L203 810L203 812L203 814L203 816L204 818L204 820L204 822L205 824L205 826L205 828L205 830L206 832L206 834L207 836L207 838L207 840L208 842L208 844L209 846L209 848L209 850L210 852L210 854L211 856L211 858L212 860L213 862L213 864L214 866L214 868L215 870L216 872L216 874L217 876L218 878L218 880L219 882L220 884L220 886L221 888L222 890L223 892L223 894L224 896L225 898L226 900L227 902L227 904L228 906L229 908L230 910L231 912L232 914L233 916L234 918L235 920L236 922L237 924L238 926L239 928L240 930L241 932L242 934L244 936L245 938L246 940L247 942L249 944L250 946L251 948L252 950L254 952L255 954L256 956L258 958L259 960L260 962L262 964L263 966L265 968L266 970L268 972L270 974L271 976L273 978L274 980L276 982L278 984L280 986L281 988L283 990L285 992L287 994L289 996L292 998L294 1000L296 1002L298 1004L301 1006L303 1008L306 1010L309 1012L311 1014L314 1016L317 1018L320 1020L323 1022L326 1024L330 1026L333 1028L336 1030L340 1032L344 1034L348 1036L352 1038L357 1040L362 1042L366 1044L372 1046L378 1048L385 1050L392 1052L401 1054L411 1056L421 1058L433 1060L446 1062L464 1064L489 1066L541 1068L691 1068L745 1066L775 1064L794 1062L808 1060L820 1058L832 1056L842 1054L852 1052L860 1050L867 1048L873 1046L879 1044L884 1042L890 1040L895 1038L900 1036L904 1034L909 1032L913 1030L917 1028L920 1026L924 1024L927 1022L931 1020L933 1018L936 1016L939 1014L942 1012L945 1010L948 1008L950 1006L953 1004L955 1002L958 1000L960 998L962 996L965 994L967 992L969 990L971 988L973 986L975 984L977 982L979 980L981 978L982 976L984 974L986 972L988 970L989 968L991 966L992 964L994 962L995 960L997 958L998 956L1000 954L1001 952L1002 950L1004 948L1005 946L1006 944L1007 942L1009 940L1010 938L1011 936L1012 934L1013 932L1015 930L1016 928L1017 926L1018 924L1019 922L1020 920L1021 918L1022 916L1023 914L1024 912L1025 910L1025 908L1026 906L1027 904L1028 902L1029 900L1030 898L1030 896L1031 894L1032 892L1033 890L1033 888L1034 886L1034 884L1035 882L1036 880L1036 878L1037 876L1038 874L1038 872L1039 870L1039 868L1040 866L1040 864L1041 862L1041 860L1042 858L1042 856L1043 854L1043 852L1044 850L1044 848L1045 846L1045 844L1046 842L1046 840L1047 838L1047 836L1047 834L1048 832L1048 830L1048 828L1049 826L1049 824L1049 822L1049 820L1050 818L1050 816L1050 814L1050 812L1051 810L1051 808L1051 806L1051 804L1051 802L1052 800L1052 798L1052 796L1052 794L1052 792L1052 790L1052 788L1052 786L1052 784L1052 782L1052 780L1052 778L1053 776L1053 774L1053 772L1053 770L1053 768L1052 766L1052 764L1052 762L1052 760L1052 758L1052 756L1052 754L1052 752L1052 750L1052 748L1051 746L1051 744L1051 742L1051 740L1050 738L1050 736L1050 734L1050 732L1049 730L1049 728L1049 726L1049 724L1048 722L1048 720L1048 718L1047 716L1047 714L1047 712L1046 710L1046 708L1046 706L1045 704L1045 702L1045 700L1044 698L1044 696L1043 694L1043 692L1042 690L1042 688L1042 686L1041 684L1041 682L1040 680L1040 678L1039 676L1039 674L1038 672L1038 670L1037 668L1036 666L1036 664L1035 662L1035 660L1034 658L1034 656L1033 654L1033 652L1032 650L1031 648L1031 646L1030 644L1029 642L1029 640L1028 638L1027 636L1027 634L1026 632L1025 630L1025 628L1024 626L1023 624L1022 622L1022 620L1021 618L1020 616L1019 614L1018 612L1018 610L1017 608L1016 606L1015 604L1014 602L1013 600L1012 598L1012 596L1011 594L1010 592L1009 590L1008 588L1007 586L1006 584L1005 582L1004 580L1003 578L1002 576L1001 574L1000 572L999 570L997 568L996 566L995 564L994 562L993 560L992 558L990 556L989 554L988 552L987 550L986 548L985 546L983 544L982 542L981 540L980 538L978 536L977 534L976 532L974 530L973 528L972 526L970 524L969 522L968 520L966 518L965 516L963 514L962 512L960 510L958 508L957 506L955 504L954 502L952 500L950 498L949 496L947 494L946 492L944 490L942 488L941 486L939 484L937 482L935 480L934 478L932 476L930 474L928 472L926 470L924 468L922 466L920 464L918 462L916 460L914 458L912 456L910 454L908 452L906 450L903 448L901 446L899 444L896 442L894 440L892 438L889 436L887 434L884 432L882 430L879 428L876 426L873 424L871 422L868 420L865 418L862 416L859 414L856 412L853 410L850 408L847 406L843 404L840 402L836 400L833 398L829 396L825 394L821 392L817 390L813 388L809 386L804 384L800 382L795 380L790 378L785 376L779 374L774 372L768 370L762 368L755 366L747 364L740 362L731 360L724 358L714 356L704 354L691 352L677 350L659 348Z"/></clipPath>'+
      '<clipPath id="'+id+'stem"><path d="M596 283L623 278L647 353L615 354Z"/></clipPath>'+
      '<clipPath id="'+id+'left"><path d="M440 238C438 219 482 211 515 213C559 213 596 238 615 281L628 298C554 358 431 319 440 238Z"/></clipPath>'+
      '<clipPath id="'+id+'right"><path d="M613 284C610 207 680 126 773 136C793 137 803 141 805 151C815 229 739 311 628 299Z"/></clipPath>'+
      '<clipPath id="'+id+'eyeL"><ellipse cx="515" cy="624" rx="44" ry="85"/></clipPath><clipPath id="'+id+'eyeR"><ellipse cx="740" cy="624" rx="44" ry="85"/></clipPath><radialGradient id="'+id+'cover"><stop offset=".84" stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient><mask id="'+id+'patch"><ellipse cx="515" cy="624" rx="55" ry="99" fill="url(#'+id+'cover)"/><ellipse cx="740" cy="624" rx="55" ry="99" fill="url(#'+id+'cover)"/></mask></defs><g class="origin-body"><g class="origin-sprout"><g clip-path="url(#'+id+'stem)">'+texture+'</g><g class="origin-leaf-left"><g clip-path="url(#'+id+'left)">'+texture+'</g></g><g class="origin-leaf-right"><g clip-path="url(#'+id+'right)">'+texture+'</g></g></g><g clip-path="url(#'+id+'body)">'+texture+'</g><g class="origin-eye-cover" opacity="0" mask="url(#'+id+'patch)"><image href="./assets/origin-reference.png" x="105" y="0" width="1254" height="1254"/></g><g class="origin-face" opacity="0"><g class="origin-eye origin-eye-left"><g clip-path="url(#'+id+'eyeL)">'+texture+'</g></g><g class="origin-eye origin-eye-right"><g clip-path="url(#'+id+'eyeR)">'+texture+'</g></g></g></g></svg>';
  }
  function play(pet,kind='hop'){
    if(reduced.matches||document.hidden||!pet.isConnected)return;
    const body=pet.querySelector('.origin-body'),eyes=pet.querySelectorAll('.origin-eye'),sprout=pet.querySelector('.origin-sprout'),leftLeaf=pet.querySelector('.origin-leaf-left'),rightLeaf=pet.querySelector('.origin-leaf-right');
    const timing=pets.get(pet);
    if(kind==='blink'&&performance.now()<(timing.faceUntil||0))return;
    clearTimeout(timing.faceTimer);
    timing.faceUntil=performance.now()+(kind==='blink'?240:kind==='wink'?500:1750);
    pet.querySelector('.origin-eye-cover').setAttribute('opacity','1');
    pet.querySelector('.origin-face').setAttribute('opacity','1');
    pet.querySelector('.origin-reaction-effect')?.remove();
    if(['wave','surprise','cheer','sleepy','shiver'].includes(kind)){
      const effect=document.createElement('span');effect.className='origin-reaction-effect '+kind;effect.setAttribute('aria-hidden','true');
      effect.innerHTML='<i></i><i></i><i></i>';pet.append(effect);setTimeout(()=>effect.remove(),1500);
    }
    timing.faceTimer=setTimeout(()=>{pet.querySelector('.origin-eye-cover').setAttribute('opacity','0');pet.querySelector('.origin-face').setAttribute('opacity','0');},timing.faceUntil-performance.now());
    if(kind==='blink'||kind==='wink'){
      (kind==='wink'?[eyes[0]]:[...eyes]).forEach(e=>e.animate([{transform:'scaleY(1)'},{transform:'scaleY(.08)',offset:.45},{transform:'scaleY(1)'}],{duration:kind==='wink'?480:220,easing:'ease-in-out'}));return;
    }

    const frames={
      sway:['rotate(0deg)','translateX(-5px) rotate(-7deg)','translateX(5px) rotate(7deg)','translateX(-2px) rotate(-3deg)','rotate(0deg)'],
      turn:['scaleX(1)','translateX(12px) scaleX(.90) rotate(2deg)','translateX(12px) scaleX(.90) rotate(2deg)','scaleX(1)'],
      wiggle:['rotate(0deg)','rotate(-4deg)','rotate(4deg)','rotate(-4deg)','rotate(4deg)','rotate(0deg)'],
      happy:['scale(1)','translateY(2px) scale(1.025,.97)','translateY(-3px) scale(1)','translateY(1px) scale(1.02,.98)','scale(1)'],
      curious:['rotate(0deg)','rotate(-8deg)','rotate(-8deg)','rotate(0deg)'],
      sleepy:['scale(1)','translateY(3px) scale(1.02,.96)','translateY(3px) scale(1.02,.96)','scale(1)'],

      hop:['translateY(0) scale(1)','translateY(2px) scale(1.035,.965)','translateY(-5px) scale(.995,1.005)','translateY(1px) scale(1.025,.975)','translateY(0) scale(1)'],
      tilt:['rotate(0deg)','rotate(-5deg)','rotate(4deg)','rotate(-1deg)','rotate(0deg)'],
      nod:['scale(1)','translateY(2px) scale(1.015,.975)','scale(1)','translateY(1px) scale(1.01,.985)','scale(1)'],
      peek:['rotate(0deg)','translateX(3px) rotate(4deg)','translateX(3px) rotate(4deg)','rotate(-1deg)','rotate(0deg)'],
      settle:['scale(1)','scale(1.035,.96)','scale(1.035,.96)','scale(1.01,.985)','scale(1)'],
      bounce:['translateY(0) scale(1)','translateY(2px) scale(1.04,.96)','translateY(-12px) scale(.99,1.01)','translateY(1px) scale(1.035,.965)','translateY(0) scale(1)'],
      stretch:['scale(1)','translateY(-2px) scale(.96,1.08)','translateY(-2px) scale(.96,1.08)','scale(1.025,.98)','scale(1)'],
      squish:['scale(1)','translateY(3px) scale(1.08,.91)','translateY(3px) scale(1.08,.91)','scale(.985,1.02)','scale(1)'],
      dance:['translateX(0) rotate(0deg)','translateX(-7px) rotate(-5deg)','translateX(7px) rotate(5deg)','translateX(-5px) rotate(-3deg)','translateX(5px) rotate(3deg)','translateX(0) rotate(0deg)'],
      surprise:['scale(1)','translateY(2px) scale(1.04,.96)','translateY(-7px) scale(.97,1.05)','translateY(-7px) scale(.97,1.05)','scale(1)'],
      shiver:['translateX(0)','translateX(-2px) rotate(-1deg)','translateX(2px) rotate(1deg)','translateX(-2px) rotate(-1deg)','translateX(2px) rotate(1deg)','translateX(0)'],
      wave:['rotate(0deg)','translateX(-3px) rotate(-4deg)','translateX(4px) rotate(5deg)','translateX(-2px) rotate(-3deg)','translateX(2px) rotate(2deg)','rotate(0deg)'],
      bow:['scale(1)','translateY(5px) scale(1.035,.94)','translateY(5px) scale(1.035,.94)','translateY(1px) scale(1.01,.985)','scale(1)'],
      breathe:['scale(1)','translateY(-1px) scale(1.018,1.025)','translateY(-1px) scale(1.018,1.025)','scale(1)'],
      sideStep:['translateX(0)','translateX(-10px) rotate(-3deg)','translateX(-10px) rotate(-3deg)','translateX(8px) rotate(2deg)','translateX(0)'],
      cheer:['scale(1)','translateY(-6px) scale(.985,1.025)','translateX(-4px) rotate(-4deg)','translateX(4px) rotate(4deg)','translateY(0) scale(1)']
    };
    if(kind==='look'){
      const face=pet.querySelector('.origin-face');
      face.animate([{transform:'translateX(0)'},{transform:'translateX(-42px)'},{transform:'translateX(42px)'},{transform:'translateX(0)'}],{duration:1700,easing:'ease-in-out'});return;
    }

    if(['happy','sleepy','curious','surprise','cheer'].includes(kind)){
      eyes.forEach((eye,i)=>eye.animate([{transform:'scale(1)'},{transform:kind==='happy'||kind==='cheer'?'scaleY(.25)':kind==='sleepy'?'scaleY(.12)':kind==='surprise'?'scale(1.16)':i?'scale(1.12)':'scaleY(.65)'},{transform:kind==='sleepy'?'scaleY(.12)':'scale(1)'},{transform:'scale(1)'}],{duration:1600,easing:'ease-in-out'}));
    }

    const face=pet.querySelector('.origin-face');
    const gaze={turn:[100,4],peek:[45,-12],curious:[-30,-20],nod:[0,15],happy:[0,-10],sleepy:[0,20],sway:[25,0],wiggle:[-20,0]}[kind];
    if(gaze){
      face.animate([{transform:'translate(0,0) scaleX(1)'},{transform:'translate('+gaze[0]+'px,'+gaze[1]+'px) scaleX('+(kind==='turn'?.9:1)+')',offset:.4},{transform:'translate('+gaze[0]+'px,'+gaze[1]+'px)',offset:.65},{transform:'translate(0,0) scaleX(1)'}],{duration:1500,easing:'ease-in-out'});
      if(kind==='turn'||kind==='peek')eyes[1].animate([{transform:'scaleX(1)'},{transform:'scaleX(.72)',offset:.45},{transform:'scaleX(1)'}],{duration:1500,easing:'ease-in-out'});
    }

    if(kind==='wave')rightLeaf.animate([{transform:'rotate(0deg)'},{transform:'rotate(28deg)'},{transform:'rotate(-13deg)'},{transform:'rotate(25deg)'},{transform:'rotate(0deg)'}],{duration:1450,easing:'ease-in-out'});
    if(kind==='cheer'){
      leftLeaf.animate([{transform:'rotate(0deg)'},{transform:'rotate(-30deg)'},{transform:'rotate(-18deg)'},{transform:'rotate(0deg)'}],{duration:1400,easing:'ease-out'});
      rightLeaf.animate([{transform:'rotate(0deg)'},{transform:'rotate(30deg)'},{transform:'rotate(18deg)'},{transform:'rotate(0deg)'}],{duration:1400,easing:'ease-out'});
    }
    if(kind==='dance')sprout.animate([{transform:'rotate(0deg)'},{transform:'rotate(-15deg)'},{transform:'rotate(13deg)'},{transform:'rotate(-10deg)'},{transform:'rotate(0deg)'}],{duration:1650,easing:'ease-in-out'});
    if(kind==='surprise')sprout.animate([{transform:'scale(1)'},{transform:'translateY(-7px) scale(1.13)'},{transform:'translateY(-7px) scale(1.13)'},{transform:'scale(1)'}],{duration:1250,easing:'ease-out'});
    if(kind==='bow')sprout.animate([{transform:'rotate(0deg)'},{transform:'translateY(4px) rotate(10deg)'},{transform:'translateY(4px) rotate(10deg)'},{transform:'rotate(0deg)'}],{duration:1450,easing:'ease-in-out'});
    if(kind==='stretch')face.animate([{transform:'translateY(0)'},{transform:'translateY(-28px)'},{transform:'translateY(-28px)'},{transform:'translateY(0)'}],{duration:1350,easing:'ease-in-out'});
    if(kind==='squish')face.animate([{transform:'translateY(0)'},{transform:'translateY(24px) scaleY(.9)'},{transform:'translateY(24px) scaleY(.9)'},{transform:'translateY(0)'}],{duration:1200,easing:'ease-in-out'});
    if(kind==='sideStep')face.animate([{transform:'translateX(0)'},{transform:'translateX(-55px)'},{transform:'translateX(-55px)'},{transform:'translateX(38px)'},{transform:'translateX(0)'}],{duration:1550,easing:'ease-in-out'});
    if(kind==='breathe')sprout.animate([{transform:'rotate(0deg)'},{transform:'rotate(-4deg)'},{transform:'rotate(3deg)'},{transform:'rotate(0deg)'}],{duration:1900,easing:'ease-in-out'});

    body.getAnimations().forEach(a=>a.cancel());

    if(kind==='hop'){
      // Ballistic flight between grounded anticipation and landing.
      const jump=[{transform:'translateY(0) scale(1)',offset:0},{transform:'translateY(0) scale(1.035,.966)',offset:.18},{transform:'translateY(0) scale(.99,1.01)',offset:.25}];
      for(let i=1;i<=16;i++){const t=i/16;jump.push({transform:'translateY('+(-4*48*t*(1-t))+'px) scale(1)',offset:.25+t*.48});}
      jump.push({transform:'scale(1.045,.957)',offset:.80},{transform:'scale(1.012,.988)',offset:.90},{transform:'scale(1)',offset:1});
      body.animate(jump,{duration:1150,easing:'linear'});
    }else{
      const duration={bounce:1050,stretch:1350,squish:1200,dance:1650,surprise:1300,shiver:1050,wave:1600,bow:1450,breathe:1900,sideStep:1550,cheer:1450}[kind]||1500;
      body.animate((frames[kind]||frames.settle).map(transform=>({transform})),{duration,easing:'ease-in-out'});
    }
    if(kind==='nod')play(pet,'blink');
  }


  const clickMoves=['look','turn','hop','peek','wink','sway','happy','nod','curious','sleepy','wiggle','settle','bounce','stretch','squish','dance','surprise','shiver','wave','bow','breathe','sideStep','cheer'];
  function nextReaction(pet,preferred=''){
    const timing=pets.get(pet);if(!timing)return;
    pet.querySelectorAll('.origin-body,.origin-eye,.origin-face').forEach(e=>e.getAnimations().forEach(a=>a.cancel()));
    const choices=clickMoves.filter(kind=>kind!==timing.lastReaction);
    const kind=preferred&&clickMoves.includes(preferred)?preferred:choices[Math.floor(Math.random()*choices.length)];
    timing.lastReaction=kind;
    timing.next=performance.now()+8500;timing.blink=performance.now()+2500;
    pet.dataset.reaction=kind;play(pet,kind);
  }

  function mount(target,hero=false){
    if(!target||target.querySelector(':scope > .origin-pet'))return;
    const pet=document.createElement('button');pet.type='button';pet.className='origin-pet'+(hero?' origin-hero':' origin-inline');
    pet.setAttribute('aria-label','origin，你的 AI 小伙伴，点击打个招呼');pet.title='origin · 你的 AI 小伙伴';
    pet.innerHTML=markup('origin'+(++nextId))+'<span class="origin-caption"><b>origin</b><small>你的 AI 小伙伴</small></span>';
    target.append(pet);pets.set(pet,{next:performance.now()+1800+Math.random()*3500,blink:performance.now()+900+Math.random()*2800});
    pet.onclick=()=>nextReaction(pet);
    pet.onpointermove=e=>{if(reduced.matches)return;const r=pet.getBoundingClientRect();pet.querySelector('.origin-face').style.transform='translate('+((e.clientX-r.left)/r.width-.5)*6+'px,'+((e.clientY-r.top)/r.height-.5)*4+'px)';};
    pet.onpointerleave=()=>pet.querySelector('.origin-face').style.transform='';
    setStatus(pet,pending?'thinking':'idle');
  }
  function setStatus(pet,status){
    if(pet.dataset.state===status)return;
    pet.dataset.state=status;
    pet.querySelector('small').textContent=status==='thinking'?'正在思考…':status==='error'?'再试一次吧':'你的 AI 小伙伴';
    if(status==='ready')play(pet,'hop');
  }

  const prefKey='geruosi-origin-preferences-v1';
  let prefs={visible:true,x:null,y:null};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem(prefKey)||'{}')};}catch{}
  function savePrefs(){localStorage.setItem(prefKey,JSON.stringify(prefs));}
  function closePetMenu(){document.querySelector('.origin-context-menu')?.remove();}
  function openAiConsultation(){
    if(window.GeruosiAIConsultation?.open)window.GeruosiAIConsultation.open();
    else document.querySelector('.rail-icon[data-view="ai"]')?.click();
  }
  function petMenuIcon(type){
    const icons={
      hello:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 10.5c.8.9 1.8 1.4 3 1.4s2.2-.5 3-1.4M8.5 7.5h.01M14.5 7.5h.01"/><path d="M4.5 15.2c1.8 2 4 3 6.7 3 4.4 0 8-3.2 8-7.2s-3.6-7.2-8-7.2-8 3.2-8 7.2c0 1.2.3 2.3.9 3.3L3.3 18l3.8-1.3"/></svg>',
      chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v10H9l-4 3v-13Z"/><path d="M8.5 9h7M8.5 12h4.5"/></svg>',
      hide:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"/><path d="m4 4 16 16M9.8 9.8a3 3 0 0 0 4.3 4.3"/></svg>'
    };return icons[type];
  }
  function openPetMenu(pet,event){
    closePetMenu();
    const menu=document.createElement('div');menu.className='origin-context-menu';menu.setAttribute('role','menu');
    const actions=[
      {type:'hello',label:'你好',run:()=>nextReaction(pet,'wave')},
      {type:'chat',label:'聊天',run:openAiConsultation},
      {type:'hide',label:'隐藏宠物',run:()=>{prefs.visible=false;savePrefs();const input=document.querySelector('#originVisibleInput');if(input)input.checked=false;floatingPet();}}
    ];
    actions.forEach(action=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.innerHTML=petMenuIcon(action.type)+'<span>'+action.label+'</span>';button.onclick=()=>{closePetMenu();action.run();};menu.append(button);});
    document.body.append(menu);
    const rect=menu.getBoundingClientRect(),gap=8;
    menu.style.left=Math.max(gap,Math.min(event.clientX,innerWidth-rect.width-gap))+'px';
    menu.style.top=Math.max(gap,Math.min(event.clientY,innerHeight-rect.height-gap))+'px';
    menu.querySelector('button')?.focus({preventScroll:true});
  }
  function positionPet(pet){
    const x=Math.max(8,Math.min(Number.isFinite(prefs.x)?prefs.x:innerWidth-125,innerWidth-108));
    const y=Math.max(8,Math.min(Number.isFinite(prefs.y)?prefs.y:innerHeight-145,innerHeight-120));
    pet.style.setProperty('left',x+'px','important');pet.style.setProperty('top',y+'px','important');
  }
  function floatingPet(){
    let pet=document.querySelector('body>.origin-floating');
    if(!pet){mount(document.body);pet=document.body.querySelector(':scope>.origin-pet');pet.classList.add('origin-floating');
      let drag=null,suppress=false;
      pet.onpointerdown=e=>{if(e.button!==0)return;const r=pet.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};suppress=false;pet.setPointerCapture(e.pointerId);};
      pet.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)suppress=true;if(suppress){prefs.x=drag.left+dx;prefs.y=drag.top+dy;positionPet(pet);}};
      const end=e=>{if(!drag)return;drag=null;if(pet.hasPointerCapture(e.pointerId))pet.releasePointerCapture(e.pointerId);if(suppress)savePrefs();};
      pet.onpointerup=end;pet.onpointercancel=end;
      pet.onclick=e=>{if(suppress){suppress=false;e.preventDefault();return;}nextReaction(pet);};
      pet.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();openPetMenu(pet,e);};
      pet.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const r=pet.getBoundingClientRect();prefs.x=r.left+({ArrowLeft:-16,ArrowRight:16}[e.key]||0);prefs.y=r.top+({ArrowUp:-16,ArrowDown:16}[e.key]||0);positionPet(pet);savePrefs();}};
      pet.setAttribute('aria-label','origin 悬浮精灵，可拖动或用方向键移动');
    }
    pet.style.setProperty('display',prefs.visible&&typeof window.isUserAuthenticated==='function'&&window.isUserAuthenticated()?'inline-flex':'none','important');positionPet(pet);
  }
  window.addEventListener('resize',()=>{closePetMenu();const pet=document.querySelector('.origin-floating');if(pet)positionPet(pet);});
  window.addEventListener('scroll',closePetMenu,true);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.origin-context-menu')&&!event.target.closest('.origin-floating'))closePetMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closePetMenu();});

  function scan(){
    queued=false;
    for(const pet of pets.keys())if(!pet.isConnected)pets.delete(pet);
    floatingPet();
  }

  function schedule(){if(!queued){queued=true;requestAnimationFrame(scan);}}
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  setInterval(()=>{
    if(document.hidden||reduced.matches)return;
    const now=performance.now();
    for(const [pet,timing] of pets){
      if(!pet.isConnected){pets.delete(pet);continue;}
      const r=pet.getBoundingClientRect();if(!r.width||r.bottom<0||r.top>innerHeight)continue;
      if(now>timing.blink){play(pet,'blink');timing.blink=now+2800+Math.random()*4200;}
      if(now>timing.next){play(pet,pending?'tilt':['tilt','wink','nod','peek','look','settle','breathe','curious'][Math.floor(Math.random()*8)]);timing.next=now+6500+Math.random()*4000;}
    }
  },500);

  let lastFrame=0;
  function animateSprouts(now){
    const dt=Math.min((now-lastFrame)/1000||.016,.032);lastFrame=now;
    if(!document.hidden&&!reduced.matches)for(const [pet,timing] of pets){
      const rect=pet.getBoundingClientRect();if(!pet.isConnected||!rect.width||rect.bottom<0||rect.top>innerHeight)continue;
      const transform=new DOMMatrixReadOnly(getComputedStyle(pet.querySelector('.origin-body')).transform);
      const p=timing.physics||(timing.physics={angle:0,velocity:0,y:transform.m42,vy:0,left:0,right:0,lv:0,rv:0});
      const vy=(transform.m42-p.y)/dt,acceleration=Math.max(-2400,Math.min(2400,(vy-p.vy)/dt));
      p.y=transform.m42;p.vy=vy;
      const tilt=Math.atan2(transform.b,transform.a)*180/Math.PI;
      const target=Math.sin(now/1500)*2.2-tilt*.65+acceleration*.006;
      p.velocity+=(85*(target-p.angle)-11*p.velocity)*dt;p.angle+=p.velocity*dt;
      p.lv+=(65*(p.angle*.65-p.left)-8*p.lv)*dt;p.left+=p.lv*dt;
      p.rv+=(100*(-p.angle*.45-p.right)-10*p.rv)*dt;p.right+=p.rv*dt;
      pet.querySelector('.origin-sprout').style.transform='rotate('+p.angle+'deg)';
      pet.querySelector('.origin-leaf-left').style.transform='rotate('+p.left+'deg)';
      pet.querySelector('.origin-leaf-right').style.transform='rotate('+p.right+'deg)';
    }
    requestAnimationFrame(animateSprouts);
  }
  requestAnimationFrame(animateSprouts);

  window.originRequest=async operation=>{
    pending++;pets.forEach((_,pet)=>setStatus(pet,'thinking'));
    let failed=false;try{const result=await operation();return result;}
    catch(error){failed=true;pets.forEach((_,pet)=>setStatus(pet,'error'));throw error;}
    finally{pending--;pets.forEach((_,pet)=>setStatus(pet,pending?'thinking':failed?'error':'ready'));}
  };
  window.originAI=payload=>window.originRequest(()=>window.geruosiDesktop.askConfiguredAi(payload));
  window.OriginPet={mount,refresh:schedule,getPreferences:()=>({...prefs}),setVisible:value=>{prefs.visible=Boolean(value);savePrefs();if(!prefs.visible)closePetMenu();floatingPet();}};
  scan();
})();
