import { getUserAuthHeaders } from "../auth";
import { apiUrl } from "../config";

type Exercise = {  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
};

export type AiStatus = {
  configured: boolean;
  provider: "auto" | "gemini" | "ollama";
  runtimeMode: "gemini" | "ollama" | "offline";
  geminiConfigured: boolean;
  ollamaConfigured: boolean;
  ollamaBaseUrl: string;
  ollamaModel: string | null;
  modelDetected: string | null;
};

type CachedTutorResponse = {
  text: string;
  ts: number;
};

const TUTOR_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const TUTOR_CACHE_MAX_ITEMS = 120;
const TUTOR_CACHE_STORAGE_KEY = "growing-math:tutor-cache:v1";
const tutorCache = new Map<string, CachedTutorResponse>();

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]): T[] {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function pickOne<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

function formatExercise(question: string, correct: number, distractors: number[], explanation: string): Exercise {
  const allOptions = shuffle([correct, ...distractors]).map(String);
  return {
    question,
    options: allOptions,
    correctAnswerIndex: allOptions.indexOf(String(correct)),
    explanation,
  };
}

function createNumericDistractors(correct: number, candidates: number[]): number[] {
  const unique: number[] = [];
  for (const raw of candidates) {
    const value = Math.max(0, Math.round(raw));
    if (value === correct || unique.includes(value)) continue;
    unique.push(value);
    if (unique.length === 3) break;
  }

  let delta = 1;
  while (unique.length < 3) {
    const candidate = Math.max(0, correct + (delta % 2 === 0 ? delta : -delta));
    if (candidate !== correct && !unique.includes(candidate)) {
      unique.push(candidate);
    }
    delta += 1;
  }

  return unique;
}

function getComplexityGuide(level: number): string {
  if (level <= 3) return "Nivel iniciante: 1 etapa de calculo, numeros pequenos e linguagem simples.";
  if (level <= 7) return "Nivel intermediario: 2 etapas de calculo, possivel uso de porcentagem ou proporcao simples.";
  if (level <= 12) return "Nivel avancado: 2-3 etapas, combinando conceitos e exigindo interpretacao do contexto.";
  return "Nivel especialista: problema multi-etapas com validacao de unidade e analise de resultado.";
}

function generateFallbackExercise(topic: string, level: number): Exercise {
  const normalizedTopic = topic.toLowerCase();
  const difficultyBoost = Math.max(0, Math.min(level, 12));
  const progressionLevel = Math.max(1, Math.min(10, level));
  const isAdvanced = level >= 8;
  const isGeometryTopic = /(geometr|triang|retang|perimet|area|angulo|circul|poligon)/.test(normalizedTopic);
  const isFractionTopic = /(fraca|fracoes|fracao)/.test(normalizedTopic);
  const isFunctionsTopic = /(func|funcao|funcoes|afim|graf|coeficiente\s*angular|coeficiente\s*linear)/.test(normalizedTopic);
  const isCalculusTopic = /(calculo|derivad|limite|taxa\s*de\s*variac|taxa\s*media|reta\s*tangente)/.test(normalizedTopic);
  const isEquationTopic = /(equac|1o\s*grau|1º\s*grau|incogn|x\s*=)/.test(normalizedTopic);
  const isTrigonometryTopic = /(trigon|seno|coss|cosseno|tang|triangulo\s*retang|cateto|hipotenusa)/.test(normalizedTopic);
  const isPercentageTopic = /(porcent|percent|desconto|acrescimo|juros)/.test(normalizedTopic);
  const isProportionTopic = /(regra\s*de\s*3|proporc|escala|taxa|razao)/.test(normalizedTopic);
  const isTimeTopic = /(tempo|hora|minut|veloc|distanc)/.test(normalizedTopic);

  const arithmeticTemplates: Array<() => Exercise> = [
    () => {
      const notebooks = randInt(8 + difficultyBoost, 20 + difficultyBoost * 2);
      const pens = randInt(4 + difficultyBoost, 14 + difficultyBoost);
      const correct = notebooks + pens;
      return formatExercise(
        `Na papelaria, Ana comprou ${notebooks} cadernos e ${pens} canetas. Quantos itens ela comprou ao todo?`,
        correct,
        createNumericDistractors(correct, [correct + pens, correct - pens, notebooks - pens]),
        'Somamos as quantidades dos dois grupos para obter o total.'
      );
    },
    () => {
      const totalSeats = randInt(40, 90);
      const occupied = randInt(10, totalSeats - 8);
      const correct = totalSeats - occupied;
      return formatExercise(
        `Um teatro tem ${totalSeats} lugares e ${occupied} estao ocupados. Quantos lugares estao livres?`,
        correct,
        createNumericDistractors(correct, [totalSeats + occupied, occupied - 2, correct + 6]),
        'Para saber os lugares livres, fazemos total - ocupados.'
      );
    },
    () => {
      const boxes = randInt(5, 14 + Math.floor(difficultyBoost / 2));
      const ballsPerBox = randInt(3, 9 + Math.floor(difficultyBoost / 3));
      const correct = boxes * ballsPerBox;
      return formatExercise(
        `Em uma gincana, ha ${boxes} caixas com ${ballsPerBox} bolinhas em cada uma. Quantas bolinhas ha no total?`,
        correct,
        createNumericDistractors(correct, [boxes + ballsPerBox, correct - boxes, correct + ballsPerBox]),
        'Quando ha grupos iguais, usamos multiplicacao: quantidade de grupos x itens por grupo.'
      );
    },
    () => {
      const totalBudget = randInt(90, 260 + difficultyBoost * 4);
      const spentMorning = randInt(25, Math.floor(totalBudget * 0.45));
      const spentAfternoon = randInt(15, Math.floor(totalBudget * 0.35));
      const correct = totalBudget - spentMorning - spentAfternoon;
      return formatExercise(
        `Para organizar uma feira escolar, a turma tinha R$ ${totalBudget}. Foram gastos R$ ${spentMorning} pela manha e R$ ${spentAfternoon} a tarde. Quanto sobrou?`,
        correct,
        createNumericDistractors(correct, [totalBudget - spentMorning, spentMorning + spentAfternoon, correct + randInt(8, 20)]),
        'Quando ha dois gastos, somamos os gastos e subtraimos do valor inicial.'
      );
    },
    () => {
      const laps = randInt(4, 10);
      const meters = randInt(180, 450);
      const extra = randInt(60, 180);
      const correct = laps * meters + extra;
      return formatExercise(
        `Em um treino, Beatriz correu ${laps} voltas de ${meters} m e depois mais ${extra} m. Quantos metros ela percorreu no total?`,
        correct,
        createNumericDistractors(correct, [laps * meters, meters + extra, correct - meters]),
        'Primeiro calculamos a distancia das voltas e depois somamos a distancia extra.'
      );
    },
  ];

  if (isTrigonometryTopic) {
    const trigFoundationalTemplates: Array<() => Exercise> = [
      () => {
        const triples = pickOne([
          { opp: 3, adj: 4, hyp: 5 },
          { opp: 5, adj: 12, hyp: 13 },
          { opp: 6, adj: 8, hyp: 10 },
        ]);
        const k = randInt(1, 3);
        const hyp = triples.hyp * k;
        const correct = triples.opp * k;
        return formatExercise(
          `Em um triangulo retangulo, para o angulo theta vale sen(theta) = ${triples.opp}/${triples.hyp}. Se a hipotenusa mede ${hyp} cm, qual e o cateto oposto?`,
          correct,
          createNumericDistractors(correct, [triples.adj * k, hyp - correct, correct + triples.opp]),
          'Usamos sen(theta) = cateto oposto / hipotenusa. Entao cateto oposto = sen(theta) x hipotenusa.'
        );
      },
      () => {
        const triples = pickOne([
          { opp: 3, adj: 4, hyp: 5 },
          { opp: 5, adj: 12, hyp: 13 },
          { opp: 6, adj: 8, hyp: 10 },
        ]);
        const k = randInt(1, 3);
        const hyp = triples.hyp * k;
        const correct = triples.adj * k;
        return formatExercise(
          `Num triangulo retangulo, cos(theta) = ${triples.adj}/${triples.hyp}. Se a hipotenusa vale ${hyp} m, quanto mede o cateto adjacente?`,
          correct,
          createNumericDistractors(correct, [triples.opp * k, hyp - correct, correct + triples.opp]),
          'Aplicamos cos(theta) = cateto adjacente / hipotenusa.'
        );
      },
      () => {
        const pairs = pickOne([
          { opp: 3, adj: 4 },
          { opp: 5, adj: 2 },
          { opp: 4, adj: 3 },
        ]);
        const k = randInt(1, 3);
        const adj = pairs.adj * k;
        const correct = pairs.opp * k;
        return formatExercise(
          `Para um angulo theta, tg(theta) = ${pairs.opp}/${pairs.adj}. Se o cateto adjacente mede ${adj} m, qual e o cateto oposto?`,
          correct,
          createNumericDistractors(correct, [adj, correct + pairs.adj, Math.max(1, correct - pairs.opp)]),
          'Como tg(theta) = oposto/adjacente, temos oposto = tg(theta) x adjacente.'
        );
      },
    ];

    const trigIntermediateTemplates: Array<() => Exercise> = [
      () => {
        const base = randInt(6, 18);
        const ratio = pickOne([
          { num: 3, den: 4 },
          { num: 2, den: 3 },
          { num: 4, den: 5 },
        ]);
        const correct = Math.round((base * ratio.num) / ratio.den);
        return formatExercise(
          `Uma rampa forma um angulo theta com o solo e vale tg(theta) = ${ratio.num}/${ratio.den}. Se a base horizontal mede ${base} m, qual altura aproximada a rampa alcanca?`,
          correct,
          createNumericDistractors(correct, [base, base + correct, Math.max(1, correct - ratio.num)]),
          'A tangente relaciona altura e base: tg(theta) = altura/base.'
        );
      },
      () => {
        const adj = randInt(9, 24);
        const ratio = pickOne([
          { num: 4, den: 5 },
          { num: 3, den: 5 },
          { num: 5, den: 13 },
        ]);
        const correct = Math.round((adj * ratio.den) / ratio.num);
        return formatExercise(
          `Em um triangulo retangulo, cos(theta) = ${ratio.num}/${ratio.den}. Se o cateto adjacente vale ${adj} cm, qual e a hipotenusa?`,
          correct,
          createNumericDistractors(correct, [adj, correct - ratio.num, correct + ratio.den]),
          'Reorganizamos cos(theta) = adjacente/hipotenusa para hipotenusa = adjacente/cos(theta).'
        );
      },
      () => {
        const opp = randInt(8, 22);
        const ratio = pickOne([
          { num: 3, den: 5 },
          { num: 5, den: 13 },
          { num: 8, den: 17 },
        ]);
        const correct = Math.round((opp * ratio.den) / ratio.num);
        return formatExercise(
          `Para um angulo theta em triangulo retangulo, sen(theta) = ${ratio.num}/${ratio.den}. Se o cateto oposto mede ${opp} m, qual e a hipotenusa?`,
          correct,
          createNumericDistractors(correct, [opp, correct + ratio.num, Math.max(1, correct - ratio.den)]),
          'Usamos sen(theta) = oposto/hipotenusa e isolamos a hipotenusa.'
        );
      },
    ];

    const trigAdvancedTemplates: Array<() => Exercise> = [
      () => {
        const opposite = randInt(6, 18);
        const adjacent = randInt(8, 20);
        const hypotenuse = Math.round(Math.sqrt(opposite * opposite + adjacent * adjacent));
        const correct = hypotenuse;
        return formatExercise(
          `Em um triangulo retangulo, os catetos medem ${opposite} cm e ${adjacent} cm. Qual e a hipotenusa aproximada?`,
          correct,
          createNumericDistractors(correct, [opposite + adjacent, Math.abs(adjacent - opposite), correct + 2]),
          'Aplicamos o teorema de Pitagoras para obter a hipotenusa.'
        );
      },
      () => {
        const base = randInt(10, 35);
        const angleTan = pickOne([
          { num: 1, den: 1, label: '45' },
          { num: 3, den: 4, label: 'aprox. 37' },
          { num: 4, den: 3, label: 'aprox. 53' },
        ]);
        const height = Math.round((base * angleTan.num) / angleTan.den);
        return formatExercise(
          `Uma escada faz angulo de ${angleTan.label} graus com o chao (tg(theta) = ${angleTan.num}/${angleTan.den}). Se a base esta a ${base} m da parede, qual altura aproximada a escada alcanca?`,
          height,
          createNumericDistractors(height, [base, height + randInt(2, 6), Math.max(1, height - randInt(2, 5))]),
          'Usamos tg(theta) = altura/base e isolamos a altura.'
        );
      },
      () => {
        const hyp = randInt(20, 60);
        const cosRatio = pickOne([
          { num: 3, den: 5 },
          { num: 4, den: 5 },
          { num: 5, den: 13 },
        ]);
        const adj = Math.round((hyp * cosRatio.num) / cosRatio.den);
        const opp = Math.round(Math.sqrt(Math.max(1, hyp * hyp - adj * adj)));
        const correct = opp;
        return formatExercise(
          `Num triangulo retangulo, a hipotenusa mede ${hyp} cm e cos(theta) = ${cosRatio.num}/${cosRatio.den}. Qual e o cateto oposto aproximado a theta?`,
          correct,
          createNumericDistractors(correct, [adj, hyp - adj, correct + randInt(2, 5)]),
          'Primeiro achamos o adjacente com o cosseno e depois aplicamos Pitagoras para achar o oposto.'
        );
      },
    ];

    const trigTemplates = progressionLevel <= 3
      ? trigFoundationalTemplates
      : progressionLevel <= 6
        ? trigIntermediateTemplates
        : trigAdvancedTemplates;

    return pickOne(trigTemplates)();
  }

  if (isGeometryTopic) {
    const geometryFoundationalTemplates: Array<() => Exercise> = [
      () => {
        const width = randInt(3, 12 + Math.floor(difficultyBoost / 2));
        const height = randInt(2, 10 + Math.floor(difficultyBoost / 2));
        const area = width * height;
        return formatExercise(
          `Um jardim retangular mede ${width} m de largura e ${height} m de comprimento. Qual e a area do jardim em m2?`,
          area,
          createNumericDistractors(area, [2 * (width + height), width + height, area + width]),
          'Area do retangulo = base x altura.'
        );
      },
      () => {
        const side = randInt(4, 14 + Math.floor(difficultyBoost / 3));
        const perimeter = 4 * side;
        return formatExercise(
          `Uma praca em formato de quadrado tem lado de ${side} m. Qual e o perimetro dessa praca?`,
          perimeter,
          createNumericDistractors(perimeter, [side * side, side + 4, perimeter + side]),
          'Perimetro do quadrado = 4 x lado.'
        );
      },
      () => {
        const base = randInt(4 + Math.floor(difficultyBoost / 4), 12 + Math.floor(difficultyBoost / 2));
        const height = randInt(3 + Math.floor(difficultyBoost / 5), 10 + Math.floor(difficultyBoost / 3));
        const area = Math.round((base * height) / 2);
        return formatExercise(
          `Um telhado triangular tem base ${base} m e altura ${height} m. Qual e a area desse triangulo em m2?`,
          area,
          createNumericDistractors(area, [base * height, base + height, area + base]),
          'Area do triangulo = (base x altura) / 2.'
        );
      },
    ];

    const geometryIntermediateTemplates: Array<() => Exercise> = [
      () => {
        const width = randInt(5, 18);
        const height = randInt(4, 16);
        const perimeter = 2 * (width + height);

        return formatExercise(
          `Uma quadra retangular mede ${width} m por ${height} m. Quantos metros de tela sao necessarios para cercar todo o contorno?`,
          perimeter,
          createNumericDistractors(perimeter, [width * height, width + height, perimeter + height]),
          'Para cercar o contorno usamos o perimetro: 2 x (comprimento + largura).'
        );
      },
      () => {
        const side = randInt(6, 20);
        const tileArea = side * side;
        return formatExercise(
          `Um piso quadrado tem lado de ${side} cm. Qual area de UMA peca desse piso em cm2?`,
          tileArea,
          createNumericDistractors(tileArea, [4 * side, side + side, tileArea + side]),
          'Area do quadrado = lado x lado.'
        );
      },
      () => {
        const r = randInt(3, 10);
        const correct = Math.round(2 * 3.14 * r);
        return formatExercise(
          `Uma pista circular tem raio ${r} m. Qual e o comprimento aproximado da borda (use pi=3,14)?`,
          correct,
          createNumericDistractors(correct, [Math.round(3.14 * r * r), 2 * r, correct + randInt(3, 12)]),
          'Comprimento da circunferencia: C = 2*pi*r.'
        );
      },
    ];

    const geometryAdvancedTemplates: Array<() => Exercise> = [
      () => {
        const baseB = randInt(10, 26);
        const baseb = randInt(4, 12);
        const h = randInt(5, 14);
        const correct = Math.round(((baseB + baseb) * h) / 2);
        return formatExercise(
          `Um terreno em forma de trapezio tem bases ${baseB} m e ${baseb} m, com altura ${h} m. Qual e sua area?`,
          correct,
          createNumericDistractors(correct, [baseB * h, baseb * h, correct + randInt(8, 20)]),
          'Area do trapezio: A = (B+b)*h/2.'
        );
      },
      () => {
        const side = randInt(6, 16);
        const apothem = randInt(4, 11);
        const perimeter = 5 * side;
        const correct = Math.round((perimeter * apothem) / 2);
        return formatExercise(
          `Um pentagono regular tem lado ${side} cm e apotema ${apothem} cm. Qual e a area aproximada?`,
          correct,
          createNumericDistractors(correct, [perimeter * apothem, 5 * side * side, correct - randInt(5, 12)]),
          'Para poligono regular: A = perimetro*apotema/2.'
        );
      },
      () => {
        const l = randInt(3, 9);
        const w = randInt(2, 7);
        const h = randInt(2, 8);
        const correct = 2 * (l * w + l * h + w * h);
        return formatExercise(
          `Uma caixa retangular mede ${l} cm x ${w} cm x ${h} cm. Qual e a area total da superficie?`,
          correct,
          createNumericDistractors(correct, [l * w * h, 2 * (l + w + h), correct + randInt(6, 16)]),
          'Area total do paralelepipedo: 2(lw + lh + wh).'
        );
      },
    ];

    const geometryTemplates = progressionLevel <= 3
      ? geometryFoundationalTemplates
      : progressionLevel <= 6
        ? geometryIntermediateTemplates
        : geometryAdvancedTemplates;

    return pickOne(geometryTemplates)();
  }

  if (isCalculusTopic) {
    const calculusFoundationalTemplates: Array<() => Exercise> = [
      () => {
        const x1 = randInt(1, 4);
        const x2 = x1 + randInt(1, 4);
        const y1 = randInt(2, 10);
        const y2 = y1 + randInt(2, 12);
        const correct = Math.round((y2 - y1) / (x2 - x1));
        return formatExercise(
          `Uma funcao passa pelos pontos (${x1}, ${y1}) e (${x2}, ${y2}). Qual e a taxa media de variacao entre esses pontos?`,
          correct,
          createNumericDistractors(correct, [y2 - y1, x2 - x1, correct + 1]),
          'Taxa media = variacao de y dividida pela variacao de x.'
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 7);
        const correct = a;
        return formatExercise(
          `Para f(x) = ${a}x + ${b}, qual e a derivada f\'(x)?`,
          correct,
          createNumericDistractors(correct, [b, a + b, 1]),
          'A derivada de ax+b e a.'
        );
      },
      () => {
        const a = pickOne([2, 3, 5]);
        const point = randInt(1, 6);
        const correct = a;
        return formatExercise(
          `Se s(t) = ${a}t + 4 representa a posicao, qual e a velocidade instantanea em t=${point}?`,
          correct,
          createNumericDistractors(correct, [a * point + 4, point, correct + 2]),
          'Em funcao linear, a velocidade instantanea e constante e igual ao coeficiente angular.'
        );
      },
    ];

    const calculusIntermediateTemplates: Array<() => Exercise> = [
      () => {
        const a = pickOne([2, 3, 4]);
        const x = randInt(1, 5);
        const correct = 2 * a * x;
        return formatExercise(
          `Para f(x) = ${a}x^2, qual e o valor de f\'(${x})?`,
          correct,
          createNumericDistractors(correct, [a * x * x, 2 * a, correct + a]),
          'Derivada: f\'(x)=2ax. Substituimos x no final.'
        );
      },
      () => {
        const a = pickOne([1, 2, 3]);
        const b = pickOne([2, 3, 4]);
        const c = randInt(1, 7);
        const x = randInt(1, 4);
        const correct = 2 * a * x + b;
        return formatExercise(
          `Dada f(x) = ${a}x^2 + ${b}x + ${c}, qual e f\'(${x})?`,
          correct,
          createNumericDistractors(correct, [a * x * x + b * x + c, 2 * a + b, correct + 2]),
          'Derivamos termo a termo e avaliamos em x.'
        );
      },
      () => {
        const a = randInt(2, 6);
        return formatExercise(
          `Qual e o limite lim(x->2) de ${a}x + 1?`,
          2 * a + 1,
          createNumericDistractors(2 * a + 1, [a + 1, a * 2, 2 * a + 3]),
          'Em funcao polinomial, o limite em x=a e o proprio valor da funcao em a.'
        );
      },
    ];

    const calculusAdvancedTemplates: Array<() => Exercise> = [
      () => {
        const a = pickOne([1, 2, 3]);
        const b = pickOne([2, 3, 4]);
        const x = randInt(1, 4);
        const correct = 3 * a * x * x + b;
        return formatExercise(
          `Se f(x) = ${a}x^3 + ${b}x, qual e f\'(${x})?`,
          correct,
          createNumericDistractors(correct, [a * x * x * x + b * x, 3 * a * x + b, correct + randInt(2, 6)]),
          'Derivada: f\'(x)=3ax^2 + b.'
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const h = pickOne([1, 2]);
        return formatExercise(
          `Para f(x)=x^2, qual e a taxa media de variacao entre x=${a} e x=${a + h}?`,
          2 * a + h,
          createNumericDistractors(2 * a + h, [a * a, 2 * a, 2 * a + h + 1]),
          'Taxa media = [f(a+h)-f(a)]/h = 2a+h.'
        );
      },
      () => {
        const a = pickOne([3, 4, 5]);
        return formatExercise(
          `Uma particula segue s(t)=${a}t^2. Qual e a velocidade instantanea em t=2?`,
          4 * a,
          createNumericDistractors(4 * a, [2 * a, a * a, 4 * a + 2]),
          'v(t)=s\'(t)=2at. Em t=2, v=4a.'
        );
      },
    ];

    const calculusTemplates = progressionLevel <= 3
      ? calculusFoundationalTemplates
      : progressionLevel <= 6
        ? calculusIntermediateTemplates
        : calculusAdvancedTemplates;

    return pickOne(calculusTemplates)();
  }

  if (isFunctionsTopic) {
    const functionsFoundationalTemplates: Array<() => Exercise> = [
      () => {
        const a = pickOne([1, 2, 3]);
        const b = randInt(1, 8);
        const x = randInt(1, 7);
        const correct = a * x + b;
        return formatExercise(
          `Considere a funcao f(x) = ${a}x + ${b}. Qual e o valor de f(${x})?`,
          correct,
          createNumericDistractors(correct, [a + x + b, a * (x + b), correct + a]),
          'Substituimos x pelo valor dado e calculamos f(x).'
        );
      },
      () => {
        const b = randInt(2, 9);
        const correct = b;
        return formatExercise(
          `Na funcao afim f(x) = 3x + ${b}, qual e o valor de f(0)?`,
          correct,
          createNumericDistractors(correct, [3 + b, b + 1, Math.max(0, b - 2)]),
          'Em f(0), o termo com x zera e sobra apenas o coeficiente linear.'
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 6);
        const x1 = randInt(1, 4);
        const x2 = x1 + 1;
        const y1 = a * x1 + b;
        const y2 = a * x2 + b;
        const correct = y2 - y1;
        return formatExercise(
          `Para a funcao f(x) = ${a}x + ${b}, quanto f(x) aumenta quando x passa de ${x1} para ${x2}?`,
          correct,
          createNumericDistractors(correct, [a + b, y2, y1]),
          'Numa funcao afim, o crescimento por +1 em x e igual ao coeficiente angular a.'
        );
      },
    ];

    const functionsIntermediateTemplates: Array<() => Exercise> = [
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(3, 12);
        const y = randInt(20, 45);
        const correct = Math.round((y - b) / a);
        const adjustedY = a * correct + b;
        return formatExercise(
          `Na funcao f(x) = ${a}x + ${b}, para qual valor de x temos f(x) = ${adjustedY}?`,
          correct,
          createNumericDistractors(correct, [correct + 1, Math.max(0, correct - 2), correct + 3]),
          `Resolvemos ${a}x + ${b} = ${adjustedY} para encontrar x.`
        );
      },
      () => {
        const a = pickOne([2, 3, 5]);
        const b = randInt(-3, 5);
        const correct = a;
        return formatExercise(
          `Qual e o coeficiente angular da funcao g(x) = ${a}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}?`,
          correct,
          createNumericDistractors(correct, [b, a + b, Math.abs(b)]),
          'No modelo ax + b, o coeficiente angular e o numero que multiplica x.'
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 8);
        const target = randInt(2, 6);
        const correct = a * target + b;
        return formatExercise(
          `Uma maquina segue a regra y = ${a}x + ${b}. Quando x = ${target}, qual sera a saida y?`,
          correct,
          createNumericDistractors(correct, [a * target, correct + b, correct - a]),
          'Aplicamos diretamente a regra da funcao para o valor de entrada x.'
        );
      },
    ];

    const functionsAdvancedTemplates: Array<() => Exercise> = [
      () => {
        const a1 = pickOne([2, 3, 4]);
        const b1 = randInt(1, 8);
        const a2 = pickOne([1, 2]);
        const b2 = randInt(9, 18);
        const correct = Math.round((b2 - b1) / (a1 - a2));
        const adjustedB2 = (a1 - a2) * correct + b1;
        return formatExercise(
          `As funcoes f(x) = ${a1}x + ${b1} e g(x) = ${a2}x + ${adjustedB2}. Em qual x elas tem o mesmo valor?`,
          correct,
          createNumericDistractors(correct, [correct + 1, Math.max(0, correct - 1), correct + 3]),
          'Igualamos f(x) e g(x) e resolvemos a equacao resultante.'
        );
      },
      () => {
        const a = pickOne([2, 3, 5]);
        const b = randInt(-6, 4);
        const correct = Math.round(-b / a);
        const adjustedB = -a * correct;
        return formatExercise(
          `Para h(x) = ${a}x ${adjustedB >= 0 ? '+' : '-'} ${Math.abs(adjustedB)}, qual e a raiz da funcao (valor de x quando h(x)=0)?`,
          correct,
          createNumericDistractors(correct, [a, Math.abs(adjustedB), correct + 2]),
          'Na raiz, fazemos h(x)=0 e isolamos x.'
        );
      },
      () => {
        const a = pickOne([2, 3, 4]);
        const b = randInt(1, 7);
        const x1 = randInt(1, 4);
        const x2 = x1 + randInt(2, 4);
        const correct = a * (x2 - x1);
        return formatExercise(
          `Na funcao p(x) = ${a}x + ${b}, qual e a variacao de p(x) quando x vai de ${x1} para ${x2}?`,
          correct,
          createNumericDistractors(correct, [a + b, a * x2 + b, a * x1 + b]),
          'A variacao em funcao afim e a multiplicada pela variacao de x: a(x2-x1).'
        );
      },
    ];

    const functionsTemplates = progressionLevel <= 3
      ? functionsFoundationalTemplates
      : progressionLevel <= 6
        ? functionsIntermediateTemplates
        : functionsAdvancedTemplates;

    return pickOne(functionsTemplates)();
  }

  if (isEquationTopic) {
    const equationFoundationalTemplates: Array<() => Exercise> = [
      () => {
        const x = randInt(2, 12);
        const offset = randInt(3, 15);
        const right = 3 * x + offset;
        return formatExercise(
          `Resolva a equacao: 3x + ${offset} = ${right}. Qual e o valor de x?`,
          x,
          createNumericDistractors(x, [x + 1, x - 1, x + 3]),
          `Isole o termo com x: 3x = ${right - offset}, depois divida por 3.`
        );
      },
      () => {
        const x = randInt(3, 14);
        const packPrice = randInt(4, 12);
        const total = x * packPrice;
        return formatExercise(
          `Uma cantina vende pacotes por R$ ${packPrice} cada. Se o total pago foi R$ ${total}, quantos pacotes foram comprados?`,
          x,
          createNumericDistractors(x, [x + 2, x - 2, x + 1]),
          'A quantidade e total dividido pelo preco por pacote.'
        );
      },
      () => {
        const x = randInt(4, 16);
        const subtract = randInt(2, 9);
        const right = x - subtract;
        return formatExercise(
          `Encontre x na expressao: x - ${subtract} = ${right}.`,
          x,
          createNumericDistractors(x, [right, x + subtract, x - 2]),
          `Para desfazer a subtracao, somamos ${subtract} nos dois lados.`
        );
      },
      () => {
        const x = randInt(3, 12);
        const add = randInt(3, 10);
        const right = x + add;
        return formatExercise(
          `Encontre x em: x + ${add} = ${right}.`,
          x,
          createNumericDistractors(x, [x + 1, Math.max(1, x - 1), x + add]),
          `Subtraimos ${add} dos dois lados para isolar x.`
        );
      },
    ];

    const equationIntermediateTemplates: Array<() => Exercise> = [
      () => {
        const x = randInt(3, 14);
        const mul = pickOne([2, 3, 4]);
        const bonus = randInt(4, 15);
        const total = x * mul + bonus;
        return formatExercise(
          `Numa campanha, cada equipe fez ${mul} tarefas por rodada e recebeu ${bonus} pontos extras. Se o total foi ${total}, quantas rodadas (x) aconteceram?`,
          x,
          createNumericDistractors(x, [x + 2, x - 1, Math.max(1, x - 3)]),
          `Montamos a equacao ${mul}x + ${bonus} = ${total}; depois isolamos x.`
        );
      },
      () => {
        const x = randInt(2, 10);
        const left = 2 * (x + 3);
        return formatExercise(
          `Resolva: 2(x + 3) = ${left}. Qual e o valor de x?`,
          x,
          createNumericDistractors(x, [x + 3, x - 2, x + 1]),
          'Distribuimos o 2: 2x + 6 = valor da direita, depois isolamos x.'
        );
      },
      () => {
        const x = randInt(3, 14);
        const a = pickOne([2, 3, 4]);
        const b = randInt(2, 11);
        const c = pickOne([1, 2]);
        const d = a * x + b - c * x;
        return formatExercise(
          `Resolva a equacao: ${a}x + ${b} = ${c}x + ${d}. Qual e x?`,
          x,
          createNumericDistractors(x, [x + 1, Math.max(1, x - 2), x + 3]),
          'Passamos os termos com x para um lado e os numeros para o outro, depois dividimos pelo coeficiente final de x.'
        );
      },
    ];

    const equationAdvancedTemplates: Array<() => Exercise> = [
      () => {
        const x = randInt(4, 15);
        const a = pickOne([2, 3, 4]);
        const b = randInt(2, 9);
        const c = randInt(1, 7);
        const right = a * (x - b) + c;
        return formatExercise(
          `Resolva: ${a}(x - ${b}) + ${c} = ${right}. Qual o valor de x?`,
          x,
          createNumericDistractors(x, [x + b, x - 1, x + 2]),
          'Primeiro desfazemos soma/subtracao e depois dividimos pelo coeficiente de x.'
        );
      },
      () => {
        const x = randInt(5, 18);
        const total = x * 2 + randInt(6, 14);
        return formatExercise(
          `A soma de um numero com seu dobro e ${total}. Qual e esse numero?`,
          x,
          createNumericDistractors(x, [Math.floor(total / 2), Math.floor(total / 3), x + 2]),
          `Montamos x + 2x = ${total}, entao 3x = ${total} e x = ${x}.`
        );
      },
      () => {
        const x = randInt(3, 12);
        const denom = pickOne([2, 3, 4]);
        const right = randInt(5, 18);
        const leftConst = right + x / denom;
        return formatExercise(
          `Resolva a equacao: ${leftConst} - x/${denom} = ${right}. Qual e x?`,
          x,
          createNumericDistractors(x, [Math.max(1, x - 1), x + denom, Math.max(1, x - denom)]),
          'Passamos x/denominador para o outro lado e isolamos x.'
        );
      },
      () => {
        const x = randInt(2, 11);
        const a = pickOne([3, 4, 5]);
        const b = randInt(1, 5);
        const c = randInt(2, 7);
        const right = a * (x + b) - c;
        return formatExercise(
          `Resolva: ${a}(x + ${b}) - ${c} = ${right}.`,
          x,
          createNumericDistractors(x, [x + 1, Math.max(1, x - 2), x + b]),
          'Desfazemos a subtracao, depois dividimos por a e por fim retiramos b.'
        );
      },
      () => {
        const x = randInt(4, 14);
        const half = x / 2;
        const constant = randInt(3, 9);
        const right = half + constant;
        return formatExercise(
          `Resolva: x/2 + ${constant} = ${right}.`,
          x,
          createNumericDistractors(x, [x + 2, Math.max(1, x - 2), right]),
          'Subtraimos a constante e multiplicamos por 2 para achar x.'
        );
      },
    ];

    const equationTemplates = progressionLevel <= 3
      ? equationFoundationalTemplates
      : progressionLevel <= 6
        ? equationIntermediateTemplates
        : equationAdvancedTemplates;

    return pickOne(equationTemplates)();
  }

  if (isFractionTopic) {
    const fractionFoundationalTemplates: Array<() => Exercise> = [
      () => {
        const denominator = randInt(4, 10);
        const numeratorA = randInt(1, denominator - 2);
        const numeratorB = randInt(1, denominator - numeratorA - 1);
        const correct = numeratorA + numeratorB;
        return formatExercise(
          `Em uma pizza dividida em ${denominator} fatias iguais, Lara comeu ${numeratorA} fatias e Davi comeu ${numeratorB}. Quantas fatias foram comidas?`,
          correct,
          createNumericDistractors(correct, [Math.abs(numeratorA - numeratorB), numeratorA * numeratorB, correct + 1]),
          'Como as partes sao iguais, somamos as fatias consumidas.'
        );
      },
      () => {
        const denominator = randInt(5, 12);
        const numerator = randInt(2, denominator - 1);
        const quantity = randInt(12, 60);
        const correct = Math.round((quantity * numerator) / denominator);
        return formatExercise(
          `Uma caixa tem ${quantity} bombons. Se ${numerator}/${denominator} da caixa foi distribuida, quantos bombons foram entregues?`,
          correct,
          createNumericDistractors(correct, [quantity - correct, numerator + denominator, correct + randInt(2, 6)]),
          'Calculamos a fracao de uma quantidade: total x numerador / denominador.'
        );
      },
      () => {
        const denominator = randInt(4, 10);
        const start = randInt(2, denominator - 1);
        const consumed = randInt(1, start);
        const correct = start - consumed;
        return formatExercise(
          `Uma garrafa estava com ${start}/${denominator} de suco. Foram consumidos ${consumed}/${denominator}. Qual ficou sendo o numerador da parte restante?`,
          correct,
          createNumericDistractors(correct, [start + consumed, consumed, correct + 1]),
          'Com denominador igual, subtraimos os numeradores.'
        );
      },
    ];

    const fractionIntermediateTemplates: Array<() => Exercise> = [
      () => {
        const denominator = pickOne([6, 8, 10, 12]);
        const numerator = randInt(2, denominator - 2);
        const multiplier = randInt(2, 5);
        const correct = numerator * multiplier;
        return formatExercise(
          `Uma receita usa ${numerator}/${denominator} de xicara por porcao. Para ${multiplier} porcoes, qual deve ser o numerador da fracao equivalente?`,
          correct,
          createNumericDistractors(correct, [numerator + multiplier, numerator * multiplier + 1, denominator]),
          `Multiplicamos numerador e denominador pelo mesmo valor (${multiplier}).`
        );
      },
      () => {
        const denominator = pickOne([8, 10, 12]);
        const numA = randInt(1, denominator - 3);
        const numB = randInt(numA + 1, denominator - 1);
        const correct = numB - numA;
        return formatExercise(
          `Em uma corrida, Carla completou ${numA}/${denominator} na primeira parte e terminou com ${numB}/${denominator}. Qual fracao da pista ela percorreu na segunda parte (em numerador)?`,
          correct,
          createNumericDistractors(correct, [numA + numB, numB, Math.max(1, correct + 2)]),
          'A segunda parte e a diferenca entre o total final e a primeira parte.'
        );
      },
      () => {
        const denominator = pickOne([6, 8, 10]);
        const numerator = randInt(1, denominator - 1);
        const pieces = randInt(18, 48);
        const correct = Math.round((pieces * numerator) / denominator);
        return formatExercise(
          `Uma turma deve resolver ${pieces} exercicios. Se cada grupo ficou com ${numerator}/${denominator} do total, quantos exercicios cabem a um grupo?`,
          correct,
          createNumericDistractors(correct, [pieces - correct, numerator + denominator, correct + 3]),
          'Calculamos fracao de quantidade: total x numerador / denominador.'
        );
      },
    ];

    const fractionAdvancedTemplates: Array<() => Exercise> = [
      () => {
        const denominator = pickOne([12, 15, 18]);
        const n1 = randInt(2, 6);
        const n2 = randInt(2, 6);
        const sum = n1 + n2;
        return formatExercise(
          `Em um reservatorio, pela manha entrou ${n1}/${denominator} da capacidade e a tarde entrou ${n2}/${denominator}. Qual e o numerador total preenchido?`,
          sum,
          createNumericDistractors(sum, [Math.abs(n1 - n2), n1 * n2, sum + 2]),
          'Com denominadores iguais, somamos os numeradores.'
        );
      },
      () => {
        const denominator = pickOne([12, 16, 20]);
        const full = randInt(60, 140);
        const doneNum = randInt(3, Math.floor(denominator / 2));
        const leftNum = denominator - doneNum;
        const correct = Math.round((full * leftNum) / denominator);
        return formatExercise(
          `Uma tarefa tem ${full} etapas. Ja foram concluidas ${doneNum}/${denominator}. Quantas etapas faltam?`,
          correct,
          createNumericDistractors(correct, [Math.round((full * doneNum) / denominator), full - correct + 2, correct + 4]),
          'Primeiro achamos a fracao que falta e depois calculamos essa parte do total.'
        );
      },
      () => {
        const denominator = pickOne([9, 12, 15]);
        const numerator = randInt(2, denominator - 2);
        const scale = pickOne([2, 3, 4]);
        const correct = denominator * scale;
        return formatExercise(
          `Qual deve ser o novo denominador de ${numerator}/${denominator} para obter uma fracao equivalente com numerador ${numerator * scale}?`,
          correct,
          createNumericDistractors(correct, [denominator + scale, numerator * scale, correct - scale]),
          'Em fracoes equivalentes, numerador e denominador sao multiplicados pelo mesmo fator.'
        );
      },
    ];

    const fractionTemplates = progressionLevel <= 3
      ? fractionFoundationalTemplates
      : progressionLevel <= 6
        ? fractionIntermediateTemplates
        : fractionAdvancedTemplates;

    return pickOne(fractionTemplates)();
  }

  if (isPercentageTopic) {
    const percentageTemplates: Array<() => Exercise> = [
      () => {
        const original = randInt(80, 450);
        const pct = pickOne([10, 15, 20, 25]);
        const discount = Math.round((original * pct) / 100);
        return formatExercise(
          `Um tenis custa R$ ${original} e esta com desconto de ${pct}%. Qual e o valor do desconto em reais?`,
          discount,
          createNumericDistractors(discount, [original - discount, pct + discount, discount + randInt(4, 20)]),
          'Desconto em reais = preco x porcentagem / 100.'
        );
      },
      () => {
        const total = randInt(60, 200);
        const pct = pickOne([20, 25, 30, 40]);
        const correct = Math.round((total * pct) / 100);
        return formatExercise(
          `Em uma turma com ${total} alunos, ${pct}% escolheram futebol. Quantos alunos escolheram futebol?`,
          correct,
          createNumericDistractors(correct, [total - correct, pct, correct + randInt(3, 12)]),
          'Transformamos a porcentagem em fracao de 100 e multiplicamos pelo total.'
        );
      },
      () => {
        const price = randInt(120, 900);
        const increase = pickOne([5, 8, 10, 12]);
        const correct = Math.round(price * (1 + increase / 100));
        return formatExercise(
          `Um curso custava R$ ${price} e teve reajuste de ${increase}%. Qual e o novo preco aproximado?`,
          correct,
          createNumericDistractors(correct, [Math.round(price * (increase / 100)), price - Math.round(price * (increase / 100)), correct + randInt(10, 45)]),
          'Novo preco = preco antigo + percentual de aumento.'
        );
      },
      () => {
        const total = randInt(100, 360);
        const donePct = pickOne([15, 20, 35, 40]);
        const done = Math.round((total * donePct) / 100);
        const correct = total - done;
        return formatExercise(
          `Uma meta semanal e de ${total} pontos. Ja foram concluidos ${donePct}% da meta. Quantos pontos ainda faltam?`,
          correct,
          createNumericDistractors(correct, [done, total + done, Math.round(total * donePct / 100)]),
          'Primeiro calculamos a parte concluida; depois subtraimos do total.'
        );
      },
    ];

    return pickOne(percentageTemplates)();
  }

  if (isProportionTopic) {
    const proportionTemplates: Array<() => Exercise> = [
      () => {
        const peopleA = randInt(3, 7);
        const juiceA = peopleA * pickOne([2, 3]);
        const peopleB = peopleA + randInt(2, 6);
        const correct = Math.round((juiceA * peopleB) / peopleA);
        return formatExercise(
          `${peopleA} pessoas consomem ${juiceA} copos de suco em uma festa. Mantendo a mesma proporcao, quantos copos sao necessarios para ${peopleB} pessoas?`,
          correct,
          createNumericDistractors(correct, [juiceA + peopleB, correct - peopleA, correct + peopleA]),
          'Em proporcao direta, multiplicamos pela razao entre as quantidades de pessoas.'
        );
      },
      () => {
        const mapScale = pickOne([1000, 2000, 5000]);
        const mapCm = randInt(3, 12);
        const correct = mapCm * mapScale;
        return formatExercise(
          `Em um mapa na escala 1:${mapScale}, uma rua mede ${mapCm} cm. Qual e o comprimento real em cm?`,
          correct,
          createNumericDistractors(correct, [mapScale + mapCm, correct / 10, correct + mapScale]),
          'Na escala 1:n, 1 cm no mapa representa n cm reais.'
        );
      },
    ];

    return pickOne(proportionTemplates)();
  }

  if (isTimeTopic) {
    const timeTemplates: Array<() => Exercise> = [
      () => {
        const speed = randInt(40, 90);
        const hours = randInt(2, 6);
        const correct = speed * hours;
        return formatExercise(
          `Um onibus viaja a ${speed} km/h durante ${hours} horas. Qual distancia ele percorre?`,
          correct,
          createNumericDistractors(correct, [speed + hours, correct - speed, correct + hours]),
          'Distancia = velocidade x tempo.'
        );
      },
      () => {
        const minutes = randInt(20, 110);
        const task = randInt(3, 9);
        const correct = minutes + task;
        return formatExercise(
          `Uma atividade levou ${minutes} minutos e outra levou ${task} minutos a mais. Quantos minutos a segunda atividade levou?`,
          correct,
          createNumericDistractors(correct, [minutes - task, minutes * task, correct + task]),
          'Somamos os minutos extras ao tempo inicial.'
        );
      },
    ];

    return pickOne(timeTemplates)();
  }

  if (normalizedTopic.includes("mercado")) {
    const apples = randInt(6 + difficultyBoost, 18 + difficultyBoost * 2);
    const oranges = randInt(4 + difficultyBoost, 15 + difficultyBoost);
    const total = apples + oranges;
    return formatExercise(
      `No mercado, Joao comprou ${apples} macas e ${oranges} laranjas. Quantas frutas ele comprou no total?`,
      total,
      createNumericDistractors(total, [total - randInt(1, 3), total + randInt(1, 3), total - randInt(4, 6)]),
      "Somamos as macas e as laranjas para obter o total."
    );
  }

  if (isAdvanced) {
    return pickOne(arithmeticTemplates)();
  }

  return pickOne(arithmeticTemplates)();
}

function normalizeExercise(payload: unknown): Exercise {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload de exercicio invalido.");
  }

  const candidate = payload as Partial<Exercise>;
  if (typeof candidate.question !== "string") throw new Error("Pergunta invalida.");
  if (!Array.isArray(candidate.options) || candidate.options.length !== 4) throw new Error("Opcoes invalidas.");
  if (typeof candidate.correctAnswerIndex !== "number") throw new Error("Indice correto invalido.");
  if (typeof candidate.explanation !== "string") throw new Error("Explicacao invalida.");

  return {
    question: candidate.question,
    options: candidate.options.map(String),
    correctAnswerIndex: Math.max(0, Math.min(3, Math.floor(candidate.correctAnswerIndex))),
    explanation: candidate.explanation,
  };
}

async function postJson<T>(url: string, body: Record<string, unknown>, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl(url), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getUserAuthHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTutorKey(message: string): string {
  return String(message || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function pruneTutorCache() {
  const now = Date.now();
  for (const [key, value] of tutorCache.entries()) {
    if (now - value.ts > TUTOR_CACHE_TTL_MS) {
      tutorCache.delete(key);
    }
  }

  if (tutorCache.size <= TUTOR_CACHE_MAX_ITEMS) return;

  const sorted = [...tutorCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const removeCount = tutorCache.size - TUTOR_CACHE_MAX_ITEMS;
  for (let i = 0; i < removeCount; i += 1) {
    tutorCache.delete(sorted[i][0]);
  }
}

function loadTutorCacheFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(TUTOR_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, CachedTutorResponse]>;
    if (!Array.isArray(parsed)) return;

    for (const [key, value] of parsed) {
      if (!key || !value || typeof value.text !== "string" || typeof value.ts !== "number") continue;
      tutorCache.set(key, value);
    }
    pruneTutorCache();
  } catch {
    // Ignore cache parse errors.
  }
}

function persistTutorCacheToStorage() {
  if (typeof window === "undefined") return;
  try {
    const entries = [...tutorCache.entries()];
    window.localStorage.setItem(TUTOR_CACHE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors.
  }
}

loadTutorCacheFromStorage();

export async function getAiStatus(): Promise<AiStatus> {
  const response = await fetch(apiUrl("/api/ai/status"));
  if (!response.ok) {
    throw new Error(`Falha ao obter status da IA: ${response.status}`);
  }

  return (await response.json()) as AiStatus;
}

function buildLocalTutorFallback(message: string): string {
  const prompt = String(message || "").trim();
  if (!prompt) {
    return "Estou em modo offline agora. Envie sua duvida e eu explico passo a passo.";
  }

  const lower = prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/(fracao|fracoes)/.test(lower)) {
    return [
      "Modo offline ativo, mas posso te ajudar agora.",
      "1) Some/subtraia fracoes com mesmo denominador.",
      "2) Se o denominador for diferente, calcule o MMC.",
      "3) Reescreva as fracoes com o mesmo denominador.",
      "4) Resolva e simplifique o resultado.",
      "Exemplo: 1/3 + 1/6 = 2/6 + 1/6 = 3/6 = 1/2.",
    ].join("\n");
  }

  if (/(equacao|1o\s*grau|x\s*=)/.test(lower)) {
    return [
      "Modo offline ativo, vamos resolver.",
      "1) Separe termos com x de um lado e numeros do outro.",
      "2) Some/subtraia para simplificar.",
      "3) Divida pelo coeficiente de x.",
      "Exemplo: 3x + 5 = 17 -> 3x = 12 -> x = 4.",
    ].join("\n");
  }

  if (/(porcent|percent)/.test(lower)) {
    return [
      "Modo offline ativo.",
      "Regra: porcentagem = valor x taxa/100.",
      "Exemplo: 20% de 150 = 150 x 20/100 = 30.",
      "Me mande os numeros da sua questao que eu resolvo com voce.",
    ].join("\n");
  }

  return [
    "Estou em modo offline, mas continuo disponivel para te ensinar.",
    "Mande a questao completa e eu respondo com:",
    "1) o que o enunciado pede",
    "2) estrategia",
    "3) resolucao passo a passo",
    "4) conferencia final",
  ].join("\n");
}

export const generateExercise = async (topic: string, level: number) => {
  try {
    const payload = await postJson<Exercise>("/api/ai/exercise", { topic, level });
    return normalizeExercise(payload);
  } catch (error) {
    console.error("Backend AI unavailable, using local fallback.", error);
    return generateFallbackExercise(topic, level);
  }
};

export const getTutorResponse = async (history: { role: string, parts: { text: string }[] }[], message: string) => {
  void history;
  const cacheKey = normalizeTutorKey(message);
  if (cacheKey) {
    const cached = tutorCache.get(cacheKey);
    if (cached && Date.now() - cached.ts <= TUTOR_CACHE_TTL_MS) {
      return cached.text;
    }
  }

  try {
    const payload = await postJson<{ text?: string }>("/api/ai/tutor", { message }, 8000);
    const text = payload.text || buildLocalTutorFallback(message);
    if (cacheKey) {
      tutorCache.set(cacheKey, { text, ts: Date.now() });
      pruneTutorCache();
      persistTutorCacheToStorage();
    }
    return text;
  } catch (error) {
    console.error("Tutor endpoint unavailable, using local fallback.", error);
    const fallback = buildLocalTutorFallback(message);
    if (cacheKey) {
      tutorCache.set(cacheKey, { text: fallback, ts: Date.now() });
      pruneTutorCache();
      persistTutorCacheToStorage();
    }
    return fallback;
  }
};

export const explainConcept = async (concept: string) => {
  const payload = await postJson<{ text?: string }>("/api/ai/tutor", {
    message: `Explique o conceito de ${concept} de forma simples e visual para um estudante. Use markdown.`,
  });
  return payload.text || "Nao consegui explicar este conceito agora.";
};
