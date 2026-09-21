import { LOOP_COPIES, LOOP_WIDTH } from '../core/loop.ts'

export type Position = [number, number, number]

type CommonCategoryConfig = {
  id: string
  categoryKey: string
  name: string
  model: string
  url: string
  scale: number
  rotationY?: number
}

export type CategoryConfig = CommonCategoryConfig & {
  position: Position
}

export type BaseCategoryConfig = CommonCategoryConfig &
  (
    | {
        position: Position
        positions?: never
      }
    | {
        position?: never
        positions: Position[]
      }
  )

export const BASE_CATEGORIES: BaseCategoryConfig[] = [
  {
    id: 'category-01-bench',
    categoryKey: 'benches',
    name: 'Скамейки',
    model: '/models/skam.glb',
    url: 'https://new.hobbyka.ru/catalog/skameyki/',
    position: [-27.4, 0, 0.5],
    scale: 0.92,
    rotationY: -180,
  },
  {
    id: 'category-01-bench',
    categoryKey: 'benches',
    name: 'Скамейки',
    model: '/models/skam.glb',
    url: 'https://new.hobbyka.ru/catalog/skameyki/',
    position: [2.6, 0, 0],
    scale: 0.92,
    rotationY: -180,
  },
  {
    id: 'category-02-urn',
    categoryKey: 'urns',
    name: 'Уличные урны',
    model: '/models/urna.glb',
    url: 'https://new.hobbyka.ru/catalog/urny/',
    position: [-27.4, 0, 2],
    scale: 0.9,
    rotationY: -15,
  },
  {
    id: 'category-05-pergola',
    categoryKey: 'pergolas',
    name: 'Навесы, перголы и беседки',
    model: '/models/pergola.glb',
    url: 'https://new.hobbyka.ru/catalog/pavilony_i_navesy/',
    position: [15.3, 0, 0],
    scale: 0.88,
    rotationY: 0,
  },
  {
    id: 'category-05-pergola',
    categoryKey: 'pergolas',
    name: 'Навесы, перголы и беседки',
    model: '/models/pozitiv.glb',
    url: 'https://new.hobbyka.ru/catalog/pavilony_i_navesy/',
    position: [-34, 0, -2],
    scale: 0.88,
    rotationY: 0,
  },
  {
    id: 'category-06-playground-game',
    categoryKey: 'playground',
    name: 'Детское игровое оборудование',
    model: '/models/game.glb',
    url: 'https://new.hobbyka.ru/catalog/detskoe_igrovoe_oborudovanie/',
    position: [-15, 0, -1],
    scale: 0.8,
    rotationY: 180,
  },
  {
    id: 'category-22-pesok',
    categoryKey: 'pesok',
    name: 'Песочницы',
    model: '/models/pesok.glb',
    url: 'https://new.hobbyka.ru/catalog/pesochnitsy/',
    position: [-14, 0, 1],
    scale: 0.65,
    rotationY: 0,
  },
  {
    id: 'category-06-playground-home',
    categoryKey: 'playground',
    name: 'Детское игровое оборудование',
    model: '/models/home.glb',
    url: 'https://new.hobbyka.ru/catalog/detskoe_igrovoe_oborudovanie/',
    position: [-12.7, 0, 0.8],
    scale: 0.8,
    rotationY: 140,
  },
  {
    id: 'category-06-playground-slide',
    categoryKey: 'playground',
    name: 'Детское игровое оборудование',
    model: '/models/gorkakid.glb',
    url: 'https://new.hobbyka.ru/catalog/detskoe_igrovoe_oborudovanie/',
    position: [-16.7, 0, 1],
    scale: 0.58,
    rotationY: -30,
  },
  {
    id: 'category-07-garden-furniture',
    categoryKey: 'garden-furniture',
    name: 'Садовая и дачная мебель',
    model: '/models/garden-furniture.glb',
    url: 'https://new.hobbyka.ru/catalog/sadovaia_i_dachnaia_mebel/',
    position: [15, 0, 0.15],
    scale: 0.8,
    rotationY: 90,
  },
  {
    id: 'category-08-swings',
    categoryKey: 'swings',
    name: 'Качели парковые',
    model: '/models/kach.glb',
    url: 'https://new.hobbyka.ru/catalog/kacheli_parkovye/',
    position: [-6, 0, -3.5],
    scale: 0.9,
    rotationY: 0,
  },
  {
    id: 'category-09-planter-flora',
    categoryKey: 'planters',
    name: 'Цветочницы и вазоны',
    model: '/models/vazon.glb',
    url: 'https://new.hobbyka.ru/catalog/tsvetochnitsy_i_vazony_sadovoparkovye/',
    positions: [
      [-15.2, 0, 2.2],
      [-15.8, 0, 2.2],
      [-16.4, 0, 2.2]
    ],
    scale: 0.78,
    rotationY: 0,
  },
  {
    id: 'category-11-sport',
    categoryKey: 'sports-equipment',
    name: 'Уличное спортивное оборудование',
    model: '/models/lider.glb',
    url: 'https://new.hobbyka.ru/catalog/ulichnoe_sportivnoe_oborudovanie/',
    position: [-23, 0, 1],
    scale: 0.8,
    rotationY: 0,
  },
  {
    id: 'category-11-sport',
    categoryKey: 'sports-equipment',
    name: 'Уличное спортивное оборудование',
    model: '/models/germes.glb',
    url: 'https://new.hobbyka.ru/catalog/ulichnoe_sportivnoe_oborudovanie/',
    position: [-24.2, 0, 0],
    scale: 0.8,
    rotationY: 0,
  },
  {
    id: 'category-13-terrace-furniture',
    categoryKey: 'terrace-furniture',
    name: 'Мебель для дома и террас',
    model: '/models/model_wood_beige.glb',
    url: 'https://new.hobbyka.ru/catalog/mebel_dlya_terras_i_besedok/',
    position: [29.84, 0, -7.71],
    scale: 0.82,
    rotationY: 0,
  },
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  {
    id: 'category-14-lighting-admiral',
    categoryKey: 'lighting',
    name: 'Освещение',
    model: '/models/admiral3.glb',
    url: 'https://new.hobbyka.ru/catalog/ulichnoe_i_sadovoparkovoe_osveshchenie/',
    position: [0, 0, 2.2],
    scale: 0.88,
    rotationY: 0,
  },
  {
    id: 'category-14-lighting-fonar',
    categoryKey: 'lighting',
    name: 'Освещение',
    model: '/models/lantern-1.glb',
    url: 'https://new.hobbyka.ru/catalog/ulichnoe_i_sadovoparkovoe_osveshchenie/',
    positions: [
      [38.25, 0, 2.2],
      [-30, 0, 2.2],
    ],
    scale: 0.88,
    rotationY: 0,
  },
  {
    id: 'category-15-tree-grate-01',
    categoryKey: 'tree-grates',
    name: 'Приствольные круги и решётки',
    model: '/models/tree-grate-1.glb',
    url: 'https://new.hobbyka.ru/catalog/reshetki_vokrug_derevev/',
    position: [-31, 0, 1],
    scale: 0.9,
    rotationY: 0,
  },
  {
    id: 'category-15-tree-grate-02',
    categoryKey: 'tree-grates',
    name: 'Приствольные круги и решётки',
    model: '/models/tree-grate-1.glb',
    url: 'https://new.hobbyka.ru/catalog/reshetki_vokrug_derevev/',
    position: [3, 0, -2.1],
    scale: 1,
    rotationY: 0,
  },
  {
    id: 'category-16-sign',
    categoryKey: 'signs',
    name: 'Стенды и указатели',
    model: '/models/sign.glb',
    url: 'https://new.hobbyka.ru/catalog/ulichnye_stendy_ukazateli_vyveski/',
    position: [-32, 0, -1.2],
    scale: 0.85,
    rotationY: 0,
  },
  {
    id: 'category-17-bike-parking-01',
    categoryKey: 'bike-parking',
    name: 'Велосипедные парковки',
    model: '/models/bike-parking-1.glb',
    url: 'https://new.hobbyka.ru/catalog/velosipednye_parkovki/',
    position: [-33.5, 0, 2],
    scale: 0.8,
    rotationY: 90,
  },
  {
    id: 'category-18-bollard',
    categoryKey: 'bollards',
    name: 'Тротуарные столбики и ограждения',
    model: '/models/bollard-standart.glb',
    url: 'https://new.hobbyka.ru/catalog/trotuarnye_stolbiki/',
    positions: [
      [-32, 0, 2.25],
      [-29.9, 0, 2.25],
      [-27.8, 0, 2.25],
      [-23.42, 0, 2.25],
      [-21.22, 0, 2.25],
      [-19.03, 0, 2.25],
      [-14.86, 0, 2.25],
      [-12.89, 0, 2.25],
      [-10.92, 0, 2.25],
      [-8.95, 0, 2.25],
      [-6.98, 0, 2.25],
      [-5.01, 0, 2.25],
      [-0.41, 0, 2.25],
      [2.21, 0, 2.25],
      [4.82, 0, 2.25],
      [8.55, 0, 2.25],
      [11.6, 0, 2.25],
      [14.7, 0, 2.25],
      [17.85, 0, 2.25],
      [22.15, 0, 2.25],
      [26.2, 0, 2.25],
      [28.4, 0, 2.25],
      [30.6, 0, 2.25],
      [32.8, 0, 2.25],
      [18.02, 0, -1.75],
      [18.02, 0, -5.05],
      [18.02, 0, -8.35],
      [18.02, 0, -11.65],
      [18.02, 0, -14.95],
      [18.02, 0, -18.25],
      [18.02, 0, -21.55],
      [21.98, 0, -1.75],
      [21.98, 0, -5.05],
      [21.98, 0, -8.35],
      [21.98, 0, -11.65],
      [21.98, 0, -14.95],
      [21.98, 0, -18.25],
      [21.98, 0, -21.55],
    ],
    scale: 0.7,
    rotationY: 0,
  },
  {
    id: 'category-04-container-site',
    categoryKey: 'container-sites',
    name: 'Контейнерные площадки для ТБО',
    model: '/models/container_shelter_category.glb',
    url: 'https://new.hobbyka.ru/catalog/konteynernye_ploshchadki_dlya_tbo/',
    position: [14.5, 0, -1],
    scale: 0.4,
    rotationY: 0,
  },
  {
    id: 'category-10-smart-city',
    categoryKey: 'smart-city',
    name: 'Умный город',
    model: '/models/smart_trash.glb',
    url: 'https://new.hobbyka.ru/catalog/umnyy_gorod/',
    position: [12.42, 0, -4.38],
    scale: 0.5,
    rotationY: 180,
  },
  {
    id: 'category-22-ac-basket',
    categoryKey: 'ac-baskets',
    name: 'Корзины для кондиционеров',
    model: '/models/ac-basket.glb',
    url: 'https://new.hobbyka.ru/catalog/korziny_dlya_konditsionerov/',
    position: [-23.02, 1.2, -0.18],
    scale: 0.8,
    rotationY: 0,
  },
  {
    id: 'category-23-dog-barrier',
    categoryKey: 'dog-equipment',
    name: 'Оборудование для выгула и дрессировки собак',
    model: '/models/prep.glb',
    url: 'https://new.hobbyka.ru/catalog/ploshadki-dlya-vygula-sobak/',
    position: [1, 0, 0],
    scale: 0.8,
    rotationY: 90,
  },
  {
    id: 'category-23-dog-slide',
    categoryKey: 'dog-equipment',
    name: 'Оборудование для выгула и дрессировки собак',
    model: '/models/gorka_a.glb',
    url: 'https://new.hobbyka.ru/catalog/ploshadki-dlya-vygula-sobak/',
    position: [-1.5, 0, 0],
    scale: 0.76,
    rotationY: 0,
  },
  {
    id: 'category-25-locker-bench-rotated',
    categoryKey: 'locker-benches',
    name: 'Скамейки для раздевалок',
    model: '/models/locker-bench.glb',
    url: 'https://new.hobbyka.ru/catalog/skameyki_dlya_razdevalok/',
    positions: [
      [5.65, 0, 0],
      [6.63, 0, 0],
    ],
    scale: 0.82,
    rotationY: 90,
  },
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  {
    id: 'category-27-ski-rack',
    categoryKey: 'ski-racks',
    name: 'Подставки для лыж и сноубордов',
    model: '/models/ski-rack.glb',
    url: 'https://new.hobbyka.ru/catalog/oborudovanie_dlya_lyzhnykh_kurortov/',
    position: [8.7, 0, -0.6],
    scale: 0.8,
    rotationY: 1,
  },
  {
    id: 'category-28-firewood',
    categoryKey: 'firewood-storage',
    name: 'Дровницы и угольницы',
    model: '/models/firewood.glb',
    url: 'https://new.hobbyka.ru/catalog/drovnitsy_i_ugolnitsy/',
    positions: [
      [2, 0, -1],
      [3, 0, -1],
    ],
    scale: 0.82,
    rotationY: -0,
  },
]

export const CATEGORIES: CategoryConfig[] = LOOP_COPIES.flatMap((cycle) =>
  BASE_CATEGORIES.flatMap((item) => {
    const positions: Position[] =
      item.positions ?? (item.position ? [item.position] : [])

    return positions.map((position, index) => {
      const shiftedPosition: Position = [
        position[0] + cycle * LOOP_WIDTH,
        position[1],
        position[2],
      ]

      return {
        id:
          positions.length > 1
            ? `${item.id}-${index + 1}@${cycle}`
            : `${item.id}@${cycle}`,
        categoryKey: item.categoryKey,
        name: item.name,
        model: item.model,
        url: item.url,
        position: shiftedPosition,
        scale: item.scale,
        rotationY: item.rotationY,
      }
    })
  })
)
