export type HeroClass = 'Guerreiro' | 'Mago' | 'Arqueiro';

export type ItemEquipType = 'weapon_1h' | 'weapon_2h' | 'shield' | 'armor' | 'accessory' | 'weapon';

export interface User {
  id: number;
  name: string;
  email: string;
  xp: number;
  coins: number;
  level: number;
  streak: number;
  hero_class?: HeroClass;
  progress: TopicProgress[];
  achievements: Achievement[];
  inventory: InventoryItem[];
  quests: UserQuest[];
}

export interface UserQuest {
  id: number;
  title: string;
  description: string;
  target_value: number;
  current_value: number;
  reward_xp: number;
  reward_coins: number;
  completed: boolean;
  type: 'exercises' | 'xp' | 'coins';
}

export interface InventoryItem {
  id: number;
  inventory_id: number;
  name: string;
  description: string;
  type: ItemEquipType;
  equip_type?: ItemEquipType;
  rarity: Rarity;
  equipped: boolean;
  bonus_xp: number;
  bonus_damage?: number;
  bonus_hp?: number;
}

export interface ShopItem {
  id: number;
  name: string;
  description: string;
  type: ItemEquipType;
  equip_type?: ItemEquipType;
  rarity: Rarity;
  bonus_xp: number;
  bonus_damage: number;
  bonus_hp: number;
  price: number;
}

export interface Enemy {
  name: string;
  hp: number;
  maxHp: number;
  type: 'Normal' | 'Boss' | 'Elite';
  attack: number;
}

export interface TopicProgress {
  id: number;
  topic: string;
  mastery: number;
}

export type Rarity = 'Comum' | 'Raro' | 'Épico' | 'Lendário';

export type GradeLevel = 'Fundamental I' | 'Fundamental II' | 'Médio' | 'Superior';

export interface Achievement {
  id: number;
  title: string;
  description: string;
  unlocked_at: string;
  rarity: Rarity;
}

export interface Topic {
  id: string;
  title: string;
  grade: GradeLevel;
  description: string;
  icon: string;
  x: number; // Posição X no mapa (0-100)
  y: number; // Posição Y no mapa (0-100)
}

// x/y sao percentuais dentro do mapa da jornada (JourneyMap) e tambem alimentam
// o minimapa lateral. O traçado do caminho e derivado destas mesmas coordenadas,
// entao node e trilha nunca saem de sincronia.
// Regras de layout: x entre 26 e 74 (evita que os rotulos vazem nas bordas) e
// y com espacamento uniforme (o bloco de rotulo ocupa ~125px abaixo do icone).
export const TOPICS: Topic[] = [
  { id: 'ops-basicas', title: 'Operações Básicas', grade: 'Fundamental I', description: 'Soma, subtração, multiplicação e divisão.', icon: 'Plus', x: 50, y: 8 },
  { id: 'fracoes', title: 'Frações', grade: 'Fundamental I', description: 'Entenda partes de um todo.', icon: 'PieChart', x: 72, y: 21 },
  { id: 'equacoes-1', title: 'Equações de 1º Grau', grade: 'Fundamental II', description: 'Encontre o valor de x.', icon: 'Variable', x: 28, y: 34 },
  { id: 'geometria-basica', title: 'Geometria Básica', grade: 'Fundamental II', description: 'Áreas e perímetros.', icon: 'Square', x: 66, y: 47 },
  { id: 'funcoes', title: 'Funções', grade: 'Médio', description: 'Gráficos e relações.', icon: 'TrendingUp', x: 34, y: 60 },
  { id: 'trigonometria', title: 'Trigonometria', grade: 'Médio', description: 'Seno, cosseno e triângulos.', icon: 'Triangle', x: 70, y: 73 },
  { id: 'calculo-intro', title: 'Cálculo Introdutório', grade: 'Superior', description: 'Limites e derivadas.', icon: 'Zap', x: 46, y: 86 },
];
