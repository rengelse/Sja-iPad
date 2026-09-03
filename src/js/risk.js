export const RISK_MODEL_VERSION='4x4-v2-5level';
export const probabilityScale={
  no:[
    {value:1,label:'Sjelden',description:'Kan skje, men normalt bare under spesielle eller uvanlige forhold.'},
    {value:2,label:'Av og til',description:'Kan realistisk skje under denne typen arbeid.'},
    {value:3,label:'Ofte',description:'Forholdet oppstår regelmessig, eller hendelsen er sannsynlig under arbeidet.'},
    {value:4,label:'Svært ofte',description:'Forholdet er til stede store deler av arbeidet, eller hendelsen forventes dersom forholdene fortsetter.'}
  ],
  en:[
    {value:1,label:'Rare',description:'Can occur, but normally only under special or unusual conditions.'},
    {value:2,label:'Occasional',description:'Can realistically occur during this type of work.'},
    {value:3,label:'Frequent',description:'The condition occurs regularly, or the event is likely during the work.'},
    {value:4,label:'Very frequent',description:'The condition is present for much of the work, or the event is expected if conditions continue.'}
  ]
};
export const consequenceScale={
  no:[
    {value:1,label:'Ubetydelig',description:'Ingen eller helt mindre personskade uten varige følger.'},
    {value:2,label:'Mindre alvorlig',description:'Personskade som kan kreve behandling eller gi kortvarig fravær.'},
    {value:3,label:'Alvorlig',description:'Alvorlig skade, lengre fravær eller mulig varig helseskade.'},
    {value:4,label:'Svært alvorlig',description:'Dødsfall eller svært alvorlig / varig personskade.'}
  ],
  en:[
    {value:1,label:'Insignificant',description:'No injury or only minor injury without lasting effects.'},
    {value:2,label:'Less serious',description:'Injury that may require treatment or cause short-term absence.'},
    {value:3,label:'Serious',description:'Serious injury, longer absence or possible permanent health damage.'},
    {value:4,label:'Very serious',description:'Fatality or very serious / permanent injury.'}
  ]
};
// SJA Generator default 4x4 classification. Arbeidstilsynet does not mandate one matrix;
// this explicit matrix must be understood as the application's documented method.
const LEVEL_MATRIX_V1={
  1:{1:'low',2:'low',3:'low',4:'medium'},
  2:{1:'low',2:'low',3:'medium',4:'medium'},
  3:{1:'low',2:'medium',3:'medium',4:'high'},
  4:{1:'medium',2:'medium',3:'high',4:'high'}
};
// v2 keeps the established 4x4 cell boundaries, but gives the matrix five clearer levels.
// Former low/high cells are split into Very Low/Low and High/Very High respectively.
const LEVEL_MATRIX_V2={
  1:{1:'veryLow',2:'veryLow',3:'low',4:'medium'},
  2:{1:'veryLow',2:'low',3:'medium',4:'medium'},
  3:{1:'low',2:'medium',3:'high',4:'veryHigh'},
  4:{1:'medium',2:'medium',3:'veryHigh',4:'veryHigh'}
};
function levelMatrix(modelVersion=RISK_MODEL_VERSION){return modelVersion==='4x4-v1'?LEVEL_MATRIX_V1:LEVEL_MATRIX_V2;}
export function riskScore(risk){const p=Number(risk?.probability||0),c=Number(risk?.consequence||0);return p>=1&&p<=4&&c>=1&&c<=4?p*c:0;}
export function riskLevel(risk,modelVersion=RISK_MODEL_VERSION){const p=Number(risk?.probability||0),c=Number(risk?.consequence||0);return levelMatrix(modelVersion)[c]?.[p]||'none';}
export function riskLabel(lang,risk,modelVersion=RISK_MODEL_VERSION){const labels={no:{none:'Ikke vurdert',veryLow:'Svært Lav',low:'Lav',medium:'Medium',high:'Høy',veryHigh:'Svært Høy'},en:{none:'Not assessed',veryLow:'Very Low',low:'Low',medium:'Medium',high:'High',veryHigh:'Very High'}};const level=riskLevel(risk,modelVersion);return labels[lang]?.[level]||labels.en[level];}
export function riskClass(risk,modelVersion=RISK_MODEL_VERSION){return `risk-${riskLevel(risk,modelVersion)}`;}
export function scaleItem(kind,lang,value){const scale=kind==='probability'?probabilityScale:consequenceScale;return (scale[lang]||scale.en).find(x=>x.value===Number(value))||null;}
export function riskMatrixRows(lang='no',modelVersion=RISK_MODEL_VERSION){const ps=probabilityScale[lang]||probabilityScale.en,cs=consequenceScale[lang]||consequenceScale.en,matrix=levelMatrix(modelVersion);return cs.map(c=>({consequence:c,cells:ps.map(p=>({probability:p,score:p.value*c.value,level:matrix[c.value][p.value]}))}));}
